// Academy policy engine — enforcement of POLICY.md §4-§5. Backend mutations
// enforce these verdicts; the UI previews them before the user confirms.
// POLICY.md is authoritative: if the two disagree, this file is the bug.
//
//  - Student: 2 free cancellations per 30 days, ≥6h notice; else lesson burned.
//  - Student move inside 6h is charged like a late cancel (late-move rule).
//  - Teacher: cancel allowed any time but <12h is tracked; first lesson with
//    a new student cannot be cancelled by the teacher.
//  - Reschedule/cancel only within the next 7 days (action horizon).
//  - Admin: always free cancel, always full credit back.

import { wallTimeToMs } from "./time";

export const POLICY = {
  studentFreeCancelsPer30Days: 2,
  studentCancelNoticeHours: 6,
  teacherCancelNoticeHours: 12,
  actionHorizonDays: 7,
  noShowWaitMinutes: 25,
  noShowPingMinutes: 10,
  // §13.2 — student self-booking window
  bookingMinNoticeHours: 12,
  bookingHorizonDays: 28,
  // §13.2 — anti-hoarding caps for student self-booking
  maxStudentBookingsPerDay: 1,
  maxStudentBookingsPerWeek: 5,
  // §13.2 — how far ahead the recurring-schedule cron materializes lessons
  recurringMaterializeDays: 7,
} as const;

export type Actor = "teacher" | "student" | "admin";

export interface EventLike {
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:mm"
  status: string;
  studentId?: string;
  pointCostSnapshot?: number;
}

/**
 * Hours from `now` until the event starts (negative = already started).
 *
 * Event rows store WALL-CLOCK time in the academy's timezone. Building a
 * Date straight from them treats that wall time as the server's zone (UTC
 * in Convex), which skewed every notice window by the academy's offset —
 * 5h for Almaty, enough to let a student cancel an hour before start and
 * be scored as 6h notice. Always pass `orgTz`.
 */
export function hoursUntil(event: EventLike, now: Date, orgTz: string): number {
  const startMs = wallTimeToMs(event.date, event.startTime, orgTz);
  if (Number.isNaN(startMs)) return 0; // malformed row — treat as "started"
  return (startMs - now.getTime()) / 3_600_000;
}

/** Event starts within the next `POLICY.actionHorizonDays` days (and hasn't started). */
export function withinActionHorizon(
  event: EventLike,
  now: Date,
  orgTz: string
): boolean {
  const h = hoursUntil(event, now, orgTz);
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
  /** academy timezone — event times are wall-clock in it */
  orgTz: string;
}): CancelVerdict {
  const { actor, event, now, studentRecentFreeCancels, isFirstLessonWithStudent, orgTz } = args;
  const notice = hoursUntil(event, now, orgTz);

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
  if (!withinActionHorizon(event, now, orgTz)) {
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
  /**
   * POLICY §4 late-move rule — the move is allowed but costs a lesson: the
   * original credit is burned (teacher gets paid for the hour they held)
   * and the new slot consumes a fresh credit.
   */
  chargesLesson: boolean;
  reason: string;
}

export function rescheduleVerdict(args: {
  actor: Actor;
  event: EventLike;
  now: Date;
  /** academy timezone — event times are wall-clock in it */
  orgTz: string;
}): RescheduleVerdict {
  const { actor, event, now, orgTz } = args;
  const notice = hoursUntil(event, now, orgTz);

  if (event.status !== "scheduled" && event.status !== "makeup") {
    return { allowed: false, trackedLate: false, chargesLesson: false, reason: `Cannot move a ${event.status} lesson` };
  }
  if (notice <= 0) {
    return { allowed: false, trackedLate: false, chargesLesson: false, reason: "Lesson already started" };
  }
  if (actor === "admin") {
    return { allowed: true, trackedLate: false, chargesLesson: false, reason: "" };
  }
  if (!withinActionHorizon(event, now, orgTz)) {
    return { allowed: false, trackedLate: false, chargesLesson: false, reason: `Only lessons within the next ${POLICY.actionHorizonDays} days can be moved` };
  }
  if (actor === "teacher") {
    const late = notice < POLICY.teacherCancelNoticeHours;
    return {
      allowed: true,
      trackedLate: late,
      chargesLesson: false,
      reason: late
        ? `Less than ${POLICY.teacherCancelNoticeHours}h notice — agree with the student first`
        : "Agree on the new time with the student first",
    };
  }

  // Student. POLICY §4: without this, "Move" an hour before start strictly
  // beats not showing up — the teacher eats a dead hour unpaid while the
  // student keeps the credit. Inside the cancel-notice window a move is
  // therefore charged exactly like a late cancel.
  if (notice < POLICY.studentCancelNoticeHours) {
    return {
      allowed: true,
      trackedLate: true,
      chargesLesson: true,
      reason: `Less than ${POLICY.studentCancelNoticeHours}h before the lesson — moving now uses this lesson, and the new time will use another`,
    };
  }
  return { allowed: true, trackedLate: false, chargesLesson: false, reason: "" };
}
