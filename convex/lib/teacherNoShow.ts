import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { insertNotification } from "../notifications";
import { refundPointsForEventInternal } from "../points";
import {
  teacherGenuineNoShowSourceKey,
  teacherLateStartSourceKey,
} from "./teacherNoShowNotifications";
import {
  assertTeacherNoShowDue,
  assertManualNoShowAuthorization,
  type NoShowActor,
  type NoShowParty,
} from "./teacherNoShowPolicy";
import { wallTimeToMs } from "./time";

const TERMINAL_EVENT_STATUSES = new Set([
  "completed",
  "cancelled",
  "no_show_student",
  "no_show_teacher",
]);

export interface NoShowTransitionArgs {
  organizationId: string;
  eventId: Id<"scheduleEvents">;
  party: NoShowParty;
  source: "manual" | "automatic";
  actor?: NoShowActor;
  lessonId?: Id<"lessons">;
  lessonTeacherId?: string;
  nowMs?: number;
}

function nowIso(nowMs?: number): string {
  return new Date(nowMs ?? Date.now()).toISOString();
}

async function teacherNameForEvent(
  ctx: MutationCtx,
  organizationId: string,
  teacherId: string,
): Promise<string> {
  const teacher = await ctx.db
    .query("users")
    .withIndex("by_organization_and_externalId", (q) =>
      q.eq("organizationId", organizationId).eq("externalId", teacherId)
    )
    .unique();
  const name = teacher?.name.trim();
  if (!name) throw new Error(`Teacher display name missing for ${teacherId}`);
  return name;
}

function assertEventBelongsToLesson(
  event: Doc<"scheduleEvents">,
  lessonTeacherId?: string,
): void {
  if (lessonTeacherId !== undefined && event.teacherId !== lessonTeacherId) {
    throw new Error("Lesson and schedule event ownership do not match");
  }
}

async function eventStartMs(
  ctx: MutationCtx,
  organizationId: string,
  event: Doc<"scheduleEvents">,
): Promise<number> {
  const settings = await ctx.db
    .query("tenantSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .unique();
  const startMs = wallTimeToMs(
    event.date,
    event.startTime,
    settings?.timezone ?? "UTC",
  );
  if (Number.isNaN(startMs)) {
    throw new Error("Cannot resolve the lesson start instant for no-show policy");
  }
  return startMs;
}

/**
 * Canonical no-show transition for manual and automatic producers.
 *
 * The function is intentionally transaction-local: point refund, durable
 * notifications, linked lesson status, and event status are all committed by
 * the outer Convex mutation or none of them are. Repeated calls are no-ops
 * after the event reaches its requested terminal state.
 */
export async function transitionNoShowForEvent(
  ctx: MutationCtx,
  args: NoShowTransitionArgs,
): Promise<{ changed: boolean; refunded: number }> {
  const event = await ctx.db.get(args.eventId);
  if (!event || event.organizationId !== args.organizationId) {
    throw new Error("Event not found");
  }
  if (event.isDeleted) throw new Error("Cannot mark a deleted event as no-show");

  const lesson = args.lessonId
    ? await ctx.db.get(args.lessonId)
    : event.teacherId
      ? (await ctx.db
          .query("lessons")
          .withIndex("by_organization_and_teacherId", (q) =>
            q.eq("organizationId", args.organizationId).eq("teacherId", event.teacherId!)
          )
          .collect())
          .find((candidate) => !candidate.isDeleted && candidate.scheduleEventId === event._id) ?? null
      : null;
  if (args.lessonId) {
    if (!lesson || lesson.organizationId !== args.organizationId) {
      throw new Error("Lesson not found");
    }
    if (lesson.scheduleEventId !== event._id) {
      throw new Error("Lesson is not linked to this schedule event");
    }
  }
  if (lesson && event.studentId !== undefined && lesson.studentId !== event.studentId) {
    throw new Error("Lesson and schedule event student ownership do not match");
  }
  assertEventBelongsToLesson(event, lesson?.teacherId ?? args.lessonTeacherId);

  if (args.source === "manual") {
    if (!args.actor) throw new Error("Manual no-show requires an authenticated actor");
    assertManualNoShowAuthorization({
      actor: args.actor,
      event,
      lessonTeacherId: lesson?.teacherId ?? args.lessonTeacherId,
      party: args.party,
    });
  } else {
    if (args.party !== "teacher") {
      throw new Error("Automatic no-show transitions apply only to teacher absence");
    }
    if (!event.teacherId) throw new Error("Teacher no-show event has no assigned teacher");
    if (args.nowMs === undefined) {
      throw new Error("Automatic no-show transition requires current time");
    }
  }

  const transitionNowMs = args.nowMs ?? Date.now();
  if (args.party === "teacher") {
    if (!event.teacherId) throw new Error("Teacher no-show event has no assigned teacher");
    // Never trust a caller-supplied start time. The policy boundary is derived
    // from the stored academy wall-clock event and tenant timezone here, so
    // manual/admin and automatic producers share the same server-side instant.
    const startMs = await eventStartMs(ctx, args.organizationId, event);
    assertTeacherNoShowDue(transitionNowMs, startMs);
  }

  const desiredStatus = args.party === "teacher" ? "no_show_teacher" : "no_show_student";
  if (event.status === desiredStatus) {
    return { changed: false, refunded: 0 };
  }
  if (TERMINAL_EVENT_STATUSES.has(event.status)) {
    throw new Error(`This lesson already concluded (${event.status}) — can't mark no-show.`);
  }

  const timestamp = nowIso(transitionNowMs);
  let refunded = 0;
  if (args.party === "teacher") {
    if (!event.teacherId) throw new Error("Teacher no-show event has no assigned teacher");
    const teacherName = await teacherNameForEvent(
      ctx,
      args.organizationId,
      event.teacherId,
    );
    if (event.studentId) {
      const refund = await refundPointsForEventInternal(ctx, {
        orgId: args.organizationId,
        studentId: event.studentId,
        scheduleEventId: event._id,
        performedBy: args.source === "automatic" ? "system" : args.actor?.externalId ?? "admin",
        notes: `Teacher no-show — refund for event ${event._id}`,
      });
      refunded = refund.refunded;

      await insertNotification(ctx, {
        organizationId: args.organizationId,
        recipientId: event.studentId,
        kind: "teacher_no_show",
        payload: {
          eventId: event._id,
          title: event.title,
          teacherId: event.teacherId,
          teacherName,
          studentId: event.studentId,
          date: event.date,
          startTime: event.startTime,
          level: 4,
          refunded,
        },
        link: "/student/calendar",
        sourceKey: teacherGenuineNoShowSourceKey(event._id, event.studentId),
      });
    }

    const admins = await ctx.db
      .query("users")
      .withIndex("by_organization_and_role", (q) =>
        q.eq("organizationId", args.organizationId).eq("role", "admin")
      )
      .collect();
    for (const admin of admins) {
      await insertNotification(ctx, {
        organizationId: args.organizationId,
        recipientId: admin.externalId,
        kind: "teacher_no_show",
        payload: {
          eventId: event._id,
          title: event.title,
          teacherId: event.teacherId,
          teacherName,
          studentId: event.studentId,
          date: event.date,
          startTime: event.startTime,
          level: 4,
          refunded,
        },
        link: "/admin/calendar",
        sourceKey: teacherGenuineNoShowSourceKey(event._id, admin.externalId),
      });
    }
  }

  await ctx.db.patch(event._id, {
    status: desiredStatus,
    cancelledAt: timestamp,
    cancelledBy: args.source === "automatic"
      ? "admin"
      : args.actor?.role === "admin"
        ? "admin"
        : args.party,
  });
  if (lesson) {
    await ctx.db.patch(lesson._id, { status: desiredStatus });
  }
  return { changed: true, refunded };
}

/** Persist the +10 admin escalation and its event/recipient-keyed notice. */
export async function recordTeacherLateStart(
  ctx: MutationCtx,
  args: {
    organizationId: string;
    eventId: Id<"scheduleEvents">;
    startMs: number;
    nowMs: number;
  },
): Promise<boolean> {
  const event = await ctx.db.get(args.eventId);
  if (!event || event.organizationId !== args.organizationId || event.isDeleted) return false;
  if (!event.teacherId || event.status !== "scheduled" && event.status !== "rescheduled") return false;
  if (!Number.isFinite(args.startMs) || args.nowMs - args.startMs < 10 * 60_000) return false;
  if (args.nowMs - args.startMs >= 20 * 60_000) return false;
  if ((event.noShowNotifications ?? []).some((entry) => entry.level === 3)) return false;

  const teacherName = await teacherNameForEvent(ctx, args.organizationId, event.teacherId);
  const admins = await ctx.db
    .query("users")
    .withIndex("by_organization_and_role", (q) =>
      q.eq("organizationId", args.organizationId).eq("role", "admin")
    )
    .collect();
  for (const admin of admins) {
    await insertNotification(ctx, {
      organizationId: args.organizationId,
      recipientId: admin.externalId,
      kind: "teacher_late_start",
      payload: {
        eventId: event._id,
        title: event.title,
        teacherId: event.teacherId,
        teacherName,
        studentId: event.studentId,
        date: event.date,
        startTime: event.startTime,
        level: 3,
        refunded: 0,
      },
      link: "/admin/calendar",
      sourceKey: teacherLateStartSourceKey(event._id, admin.externalId),
    });
  }
  await ctx.db.patch(event._id, {
    noShowNotifications: [
      ...(event.noShowNotifications ?? []),
      { level: 3, sentAt: new Date(args.nowMs).toISOString() },
    ],
  });
  return true;
}
