// I.6 — Teacher no-show automation.
// Runs every 5 minutes. Walks scheduleEvents where the start time
// passed and `teacherStartedAt` is still empty. Sends a notification
// ladder to admins (and the student at the final step):
//
//   level 1  — pre-start (-5 min): admin nudge "teacher hasn't opened yet"
//   level 2  — at-time:             admin "lesson should be starting now"
//   level 3  — +10 min:             admin "10 minutes late"
//   level 4  — +20 min:             auto-refund full points,
//                                    status → no_show_teacher,
//                                    student apology notification,
//                                    admin final notif
//
// `noShowNotifications: { level, sentAt }[]` on the event acts as the
// idempotency record — every level is sent at most once per event.

import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { grantPointsInternal } from "./points";

type Level = 1 | 2 | 3 | 4;

const FIVE_MIN_MS = 5 * 60_000;
const TEN_MIN_MS = 10 * 60_000;
const TWENTY_MIN_MS = 20 * 60_000;

export const checkTeacherNoShowsCron = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const todayStr = new Date(now).toISOString().slice(0, 10);
    const tomorrowStr = new Date(now + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const yesterdayStr = new Date(now - 86_400_000)
      .toISOString()
      .slice(0, 10);
    // Window: any event whose date is yesterday/today/tomorrow is
    // close enough to be relevant. Tomorrow handles UTC drift.
    const events = await ctx.db.query("scheduleEvents").collect();
    const relevant = events.filter(
      (e) =>
        !e.isDeleted &&
        (e.date === todayStr ||
          e.date === tomorrowStr ||
          e.date === yesterdayStr)
    );

    let reminderSent = 0;
    let touched = 0;

    // ═══ Phase A — Session reminders ═══
    for (const evt of relevant) {
      if (evt.sessionReminderSent) continue;
      if (evt.status !== "scheduled") continue;
      if (!evt.teacherId) continue;
      if (evt.type === "placeholder") continue;

      const startMs = parseStartMs(evt.date, evt.startTime);
      if (Number.isNaN(startMs)) continue;
      const delta = now - startMs;

      // Reminder window: between 6 and 1 minutes before start
      if (delta >= -6 * 60_000 && delta <= -1 * 60_000) {
        await ctx.db.patch(evt._id, { sessionReminderSent: true });
        if (evt.studentId) {
          // Resolve student name for the notification payload
          const student = await ctx.db
            .query("users")
            .withIndex("by_organization_and_externalId", (q: any) =>
              q.eq("organizationId", evt.organizationId).eq("externalId", evt.studentId)
            )
            .first();
          await ctx.db.insert("notifications", {
            organizationId: evt.organizationId,
            recipientId: evt.teacherId,
            kind: "session_reminder",
            payload: {
              eventId: evt._id,
              title: evt.title,
              studentId: evt.studentId,
              studentName: student?.name ?? evt.studentId,
              startTime: evt.startTime,
              date: evt.date,
            },
            link: `/teacher/sessions`,
            createdAt: new Date().toISOString(),
          });
          reminderSent += 1;
        }
      }
    }

    // ═══ Phase B — No-show ladder ═══
    for (const evt of relevant) {
      if (evt.teacherStartedAt) continue;
      if (
        evt.status !== "scheduled" &&
        evt.status !== "rescheduled" &&
        evt.status !== "no_show_teacher"
      ) {
        continue;
      }
      if (evt.status === "no_show_teacher") continue;
      if (!evt.teacherId) continue;

      const startMs = parseStartMs(evt.date, evt.startTime);
      if (Number.isNaN(startMs)) continue;
      const delta = now - startMs;

      const fired = new Set(
        (evt.noShowNotifications ?? []).map((n) => n.level)
      );

      // Level 1: 5 minutes before start, teacher hasn't started.
      if (delta >= -FIVE_MIN_MS && delta < 0 && !fired.has(1)) {
        await fireLevel(ctx, evt, 1);
        touched += 1;
      }
      // Level 2: at start time.
      else if (delta >= 0 && delta < TEN_MIN_MS && !fired.has(2)) {
        await fireLevel(ctx, evt, 2);
        touched += 1;
      }
      // Level 3: +10 min past start.
      else if (
        delta >= TEN_MIN_MS &&
        delta < TWENTY_MIN_MS &&
        !fired.has(3)
      ) {
        await fireLevel(ctx, evt, 3);
        touched += 1;
      }
      // Level 4: +20 min — auto-refund + lock no_show_teacher.
      else if (delta >= TWENTY_MIN_MS && !fired.has(4)) {
        await fireLevel(ctx, evt, 4);
        touched += 1;
      }
    }
    return { touched, reminderSent };
  },
});

async function fireLevel(
  ctx: any,
  evt: Doc<"scheduleEvents">,
  level: Level
) {
  const nowIso = new Date().toISOString();
  const prior = evt.noShowNotifications ?? [];

  // Final level: refund + status flip + student notif.
  if (level === 4) {
    if (evt.studentId && (evt.pointCostSnapshot ?? 0) > 0) {
      try {
        await grantPointsInternal(ctx, {
          orgId: evt.organizationId,
          studentId: evt.studentId,
          points: evt.pointCostSnapshot!,
          source: "refund",
          performedBy: "system",
          notes: `Teacher no-show — automatic refund for event ${evt._id}`,
          scheduleEventId: evt._id as Id<"scheduleEvents">,
        });
      } catch (err) {
        console.error("[no-show cron] refund failed", err);
      }
    }
    await ctx.db.patch(evt._id, {
      status: "no_show_teacher",
      noShowNotifications: [...prior, { level, sentAt: nowIso }],
    });
    if (evt.studentId) {
      await ctx.db.insert("notifications", {
        organizationId: evt.organizationId,
        recipientId: evt.studentId,
        kind: "teacher_no_show",
        payload: {
          eventId: evt._id,
          title: evt.title,
          refunded: evt.pointCostSnapshot ?? 0,
        },
        link: "/student/calendar",
        createdAt: nowIso,
      });
    }
  } else {
    await ctx.db.patch(evt._id, {
      noShowNotifications: [...prior, { level, sentAt: nowIso }],
    });
  }

  // Admin notifications for every level.
  const admins = await ctx.db
    .query("users")
    .withIndex("by_organization_and_role", (q: any) =>
      q.eq("organizationId", evt.organizationId).eq("role", "admin")
    )
    .collect();
  const payload = {
    eventId: evt._id,
    title: evt.title,
    teacherId: evt.teacherId,
    studentId: evt.studentId,
    date: evt.date,
    startTime: evt.startTime,
    level,
  };
  for (const a of admins) {
    await ctx.db.insert("notifications", {
      organizationId: evt.organizationId,
      recipientId: a.externalId,
      kind: "teacher_no_show",
      payload,
      link: `/admin/calendar`,
      createdAt: nowIso,
    });
  }
}

function parseStartMs(date: string, startTime: string): number {
  // Treat stored wall-clock as UTC for now (tenant tz handling lands
  // alongside Phase H currency polish).
  const iso = `${date}T${startTime}:00.000Z`;
  return Date.parse(iso);
}
