// I.6 — Teacher no-show automation.
// Runs every 5 minutes. Walks scheduleEvents where the start time
// passed and `teacherStartedAt` is still empty. It emits only two
// post-start escalations:
//
//   level 3  — policy ping (+10 min): one admin late-start notification
//   level 4  — policy grace (+20 min): auto-refund full points,
//                                    status → no_show_teacher,
//                                    one student no-show notification,
//                                    one admin final notification
//
// `noShowNotifications: { level, sentAt }[]` on the event gates the
// scheduler, while each durable notification also carries a stable
// event/level/recipient source key so retries cannot create another row.

import { internalMutation } from "./_generated/server";
import {
  teacherNoShowDueLevel,
} from "./lib/teacherNoShowNotifications";
import {
  recordTeacherLateStart,
  transitionNoShowForEvent,
} from "./lib/teacherNoShow";
import { wallTimeToMs } from "./lib/time";

export const checkTeacherNoShowsCron = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // Stored times are academy wall-clock — resolve each org's timezone once.
    const tzCache = new Map<string, string>();
    const orgTz = async (organizationId: string): Promise<string> => {
      const hit = tzCache.get(organizationId);
      if (hit) return hit;
      const settings = await ctx.db
        .query("tenantSettings")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", organizationId)
        )
        .unique();
      const tz = settings?.timezone ?? "UTC";
      tzCache.set(organizationId, tz);
      return tz;
    };
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
    const dayAfterStr = new Date(now + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const relevant = events.filter(
      (e) =>
        !e.isDeleted &&
        (e.date === todayStr ||
          e.date === tomorrowStr ||
          e.date === yesterdayStr ||
          // 24h reminders for far-east academies can sit two dates ahead
          e.date === dayAfterStr)
    );

    let reminderSent = 0;
    let touched = 0;
    let studentReminders = 0;

    // ═══ C-5 — Student reminders (24h and 1h before start) ═══
    for (const evt of relevant) {
      if (evt.status !== "scheduled") continue;
      if (!evt.studentId) continue;
      if (evt.type === "placeholder") continue;

      const startMs = wallTimeToMs(
        evt.date,
        evt.startTime,
        await orgTz(evt.organizationId)
      );
      if (Number.isNaN(startMs)) continue;
      const minsUntil = (startMs - now) / 60_000;

      // Fire once per window; the flags make the cron idempotent.
      const due24 = !evt.studentReminder24Sent && minsUntil <= 24 * 60 && minsUntil > 12 * 60;
      const due1 = !evt.studentReminder1Sent && minsUntil <= 60 && minsUntil > 5;
      if (!due24 && !due1) continue;

      await ctx.db.patch(evt._id,
        due24 ? { studentReminder24Sent: true } : { studentReminder1Sent: true }
      );
      await ctx.db.insert("notifications", {
        organizationId: evt.organizationId,
        recipientId: evt.studentId,
        kind: "session_reminder",
        payload: {
          eventId: evt._id,
          title: evt.title,
          date: evt.date,
          startTime: evt.startTime,
          when: due24 ? "24h" : "1h",
          googleMeetLink: evt.googleMeetLink ?? null,
        },
        link: "/student/calendar",
        createdAt: new Date().toISOString(),
      });
      studentReminders += 1;
    }

    // ═══ Phase A — Session reminders ═══
    for (const evt of relevant) {
      if (evt.sessionReminderSent) continue;
      if (evt.status !== "scheduled") continue;
      if (!evt.teacherId) continue;
      if (evt.type === "placeholder") continue;

      const startMs = wallTimeToMs(
        evt.date,
        evt.startTime,
        await orgTz(evt.organizationId)
      );
      if (Number.isNaN(startMs)) continue;
      const delta = now - startMs;

      // Reminder window: between 6 and 1 minutes before start
      if (delta >= -6 * 60_000 && delta <= -1 * 60_000) {
        await ctx.db.patch(evt._id, { sessionReminderSent: true });
        if (evt.studentId) {
          // Resolve student name for the notification payload
          const student = await ctx.db
            .query("users")
            .withIndex("by_organization_and_externalId", (q) =>
              q.eq("organizationId", evt.organizationId).eq("externalId", evt.studentId!)
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
      // `teacherStartedAt` disarms the ladder — but only while a session is
      // genuinely running. A teacher who opened the lesson hours early and
      // then deleted/discarded it left the stamp behind, which silently
      // immunised the event and it never counted as a no-show. Trust the
      // lesson row, not the stamp: no live lesson → treat as not started and
      // clear the stale mark so the ladder resumes.
      if (evt.teacherStartedAt) {
        const lessons = await ctx.db
          .query("lessons")
          .withIndex("by_organization_and_teacherId", (q) =>
            q
              .eq("organizationId", evt.organizationId)
              .eq("teacherId", evt.teacherId ?? "")
          )
          .collect();
        const live = lessons.some(
          (l) => !l.isDeleted && l.scheduleEventId === evt._id
        );
        if (live) continue;
        await ctx.db.patch(evt._id, { teacherStartedAt: undefined });
      }
      if (evt.status !== "scheduled" && evt.status !== "rescheduled") continue;
      if (!evt.teacherId) continue;

      const startMs = wallTimeToMs(
        evt.date,
        evt.startTime,
        await orgTz(evt.organizationId)
      );
      if (Number.isNaN(startMs)) continue;
      const fired = new Set(
        (evt.noShowNotifications ?? []).map((n) => n.level)
      );
      const level = teacherNoShowDueLevel({
        nowMs: now,
        startMs,
        notifiedLevels: fired,
      });
      if (level === null) continue;

      if (level === 3) {
        if (await recordTeacherLateStart(ctx, {
          organizationId: evt.organizationId,
          eventId: evt._id,
          startMs,
          nowMs: now,
        })) {
          touched += 1;
        }
      } else {
        const result = await transitionNoShowForEvent(ctx, {
          organizationId: evt.organizationId,
          eventId: evt._id,
          party: "teacher",
          source: "automatic",
          nowMs: now,
        });
        if (result.changed) touched += 1;
      }
    }
    return { touched, reminderSent, studentReminders };
  },
});


