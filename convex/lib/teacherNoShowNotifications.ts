import { POLICY } from "./policy";

export type TeacherNoShowLevel = 1 | 2 | 3 | 4;
export type TeacherNoShowEscalationLevel = 3 | 4;
export type TeacherNoShowStage = "none" | "late_start" | "genuine_no_show";

/**
 * Classifies the two post-start escalation states. The ten-minute ping is the
 * existing late-start signal; the policy's twenty-minute grace is the only
 * genuine no-show threshold.
 */
export function teacherNoShowStage(opts: {
  nowMs: number;
  startMs: number;
  lateStartMinutes?: number;
  noShowMinutes?: number;
}): TeacherNoShowStage {
  const deltaMs = opts.nowMs - opts.startMs;
  const lateStartMs =
    (opts.lateStartMinutes ?? POLICY.noShowPingMinutes) * 60_000;
  const noShowMs =
    (opts.noShowMinutes ?? POLICY.noShowWaitMinutes) * 60_000;

  if (deltaMs < lateStartMs) return "none";
  if (deltaMs >= noShowMs) return "genuine_no_show";
  return "late_start";
}

/**
 * Returns the one escalation level a cron scan may emit, if any. Persisted
 * levels are supplied by the caller so a retry after a successful scan is a
 * no-op before it reaches notification storage.
 */
export function teacherNoShowDueLevel(opts: {
  nowMs: number;
  startMs: number;
  notifiedLevels: Iterable<number>;
}): TeacherNoShowEscalationLevel | null {
  const notified = new Set(opts.notifiedLevels);
  const stage = teacherNoShowStage(opts);
  if (stage === "late_start" && !notified.has(3)) return 3;
  if (stage === "genuine_no_show" && !notified.has(4)) return 4;
  return null;
}

/**
 * Stable idempotency key for one teacher-no-show ladder level delivered to one
 * recipient. The recipient is part of the key as well as the notification
 * index scope so the identity contract remains explicit at the durable source.
 */
export function teacherNoShowSourceKey(
  eventId: string,
  recipientId: string,
  level: TeacherNoShowLevel
): string {
  return `teacher_no_show:${eventId}:level:${level}:recipient:${recipientId}`;
}

/** Stable key for the one late-start notification per event and recipient. */
export function teacherLateStartSourceKey(
  eventId: string,
  recipientId: string
): string {
  return teacherNoShowSourceKey(eventId, recipientId, 3);
}

/** Stable key for the one genuine no-show notification per event and recipient. */
export function teacherGenuineNoShowSourceKey(
  eventId: string,
  recipientId: string
): string {
  return teacherNoShowSourceKey(eventId, recipientId, 4);
}

/** Stable idempotency key for the legacy make-up-credit notification path. */
export function teacherNoShowMakeupSourceKey(
  eventId: string,
  recipientId: string
): string {
  return `teacher_no_show_makeup:${eventId}:recipient:${recipientId}`;
}
