// §13 Academy Policy engine — single source of truth for calendar rules.
// Backend mutations enforce these verdicts; UI calls the preview query in
// convex/schedule.ts to show consequences before the user confirms.
//
// Policy constants (EnglishDom-calibrated, MASTER_PLAN §13):
//  - Student: 2 free cancellations per 30 days, ≥6h notice; else lesson burned.
//  - Teacher: cancel allowed any time but <12h is tracked; first lesson with
//    a new student cannot be cancelled by the teacher.
//  - Reschedule/cancel only within the next 7 days (action horizon).
//  - Admin: always free cancel, always full credit back.

export const POLICY = {
  studentFreeCancelsPer30Days: 2,
  studentCancelNoticeHours: 6,
  teacherCancelNoticeHours: 12,
  actionHorizonDays: 7,
  noShowWaitMinutes: 25,
  noShowPingMinutes: 10,
} as const;

export type Actor = "teacher" | "student" | "admin";

export interface EventLike {
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  status: string;
  studentId?: string;
  pointCostSnapshot?: number;
}

/** Hours from `now` until the event starts (negative = already started). */
export function hoursUntil(event: EventLike, now: Date): number {
  const start = new Date(`${event.date}T${event.startTime}:00`);
  return (start.getTime() - now.getTime()) / 3_600_000;
}

/** Event starts within the next `POLICY.actionHorizonDays` days (and hasn't started). */
export function withinActionHorizon(event: EventLike, now: Date): boolean {
  const h = hoursUntil(event, now);
  return h > 0 && h <= POLICY.actionHorizonDays * 24;
}

export interface CancelVerdict {
  allowed: boolean;
  /** true → student keeps/gets back the lesson credit; false → lesson burned */
  refund: boolean;
  /** teacher acted under the soft notice window — record for metrics */
  trackedLate: boolean;
  reason: string;
}

export function cancelVerdict(args: {
  actor: Actor;
  event: EventLike;
  now: Date;
  /** student's free cancellations already used in the last 30 days */
  studentRecentFreeCancels: number;
  /** is this the student's first-ever lesson with this teacher? */
  isFirstLessonWithStudent: boolean;
}): CancelVerdict {
  const { actor, event, now, studentRecentFreeCancels, isFirstLessonWithStudent } = args;
  const notice = hoursUntil(event, now);

  if (event.status !== "scheduled" && event.status !== "makeup") {
    return { allowed: false, refund: false, trackedLate: false, reason: `Cannot cancel a ${event.status} lesson` };
  }
  if (notice <= 0) {
    return { allowed: false, refund: false, trackedLate: false, reason: "Lesson already started" };
  }

  // Admin bypasses the action horizon (§13.4 horizon applies to teacher/student)
  if (actor === "admin") {
    return { allowed: true, refund: true, trackedLate: false, reason: "Admin cancellation — lesson credited back" };
  }
  if (!withinActionHorizon(event, now)) {
    return { allowed: false, refund: false, trackedLate: false, reason: `Only lessons within the next ${POLICY.actionHorizonDays} days can be cancelled` };
  }

  if (actor === "teacher") {
    if (isFirstLessonWithStudent) {
      return { allowed: false, refund: true, trackedLate: false, reason: "First lesson with a new student cannot be cancelled" };
    }
    const late = notice < POLICY.teacherCancelNoticeHours;
    return {
      allowed: true,
      refund: true,
      trackedLate: late,
      reason: late
        ? `Less than ${POLICY.teacherCancelNoticeHours}h notice — allowed, but counts against your reliability`
        : "Lesson credited back to the student",
    };
  }

  // student
  const inTime = notice >= POLICY.studentCancelNoticeHours;
  const hasFreeLeft = studentRecentFreeCancels < POLICY.studentFreeCancelsPer30Days;
  if (inTime && hasFreeLeft) {
    const left = POLICY.studentFreeCancelsPer30Days - studentRecentFreeCancels - 1;
    return { allowed: true, refund: true, trackedLate: false, reason: `Free cancellation (${left} left this month)` };
  }
  return {
    allowed: true,
    refund: false,
    trackedLate: false,
    reason: inTime
      ? "Free cancellations for this month used up — the lesson will be charged"
      : `Less than ${POLICY.studentCancelNoticeHours}h before the lesson — the lesson will be charged`,
  };
}

export interface RescheduleVerdict {
  allowed: boolean;
  trackedLate: boolean;
  reason: string;
}

export function rescheduleVerdict(args: {
  actor: Actor;
  event: EventLike;
  now: Date;
}): RescheduleVerdict {
  const { actor, event, now } = args;
  const notice = hoursUntil(event, now);

  if (event.status !== "scheduled" && event.status !== "makeup") {
    return { allowed: false, trackedLate: false, reason: `Cannot move a ${event.status} lesson` };
  }
  if (notice <= 0) {
    return { allowed: false, trackedLate: false, reason: "Lesson already started" };
  }
  if (actor === "admin") {
    return { allowed: true, trackedLate: false, reason: "" };
  }
  if (!withinActionHorizon(event, now)) {
    return { allowed: false, trackedLate: false, reason: `Only lessons within the next ${POLICY.actionHorizonDays} days can be moved` };
  }
  if (actor === "teacher") {
    const late = notice < POLICY.teacherCancelNoticeHours;
    return {
      allowed: true,
      trackedLate: late,
      reason: late
        ? `Less than ${POLICY.teacherCancelNoticeHours}h notice — agree with the student first`
        : "Agree on the new time with the student first",
    };
  }
  return { allowed: true, trackedLate: false, reason: "" };
}
