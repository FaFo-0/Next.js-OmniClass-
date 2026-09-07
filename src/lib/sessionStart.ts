// §8 — when a teacher may START a scheduled session.
//
// The academy's rule: a scheduled lesson can be started from
// `LESSON_START_EARLY_MINUTES` (10) before its scheduled start (academy
// wall-clock) until `lessonMinutes + 30` after it should have ended.
// Beyond that the honest outcome is a no-show, not a retroactive start.
//
// Shared by the teacher sessions list, the teacher calendar event dialog,
// and (server-enforced, with the exact same numbers) convex/lessons.ts.
// Times are STORED as academy wall-clock — surfaces must pass the academy
// timezone (tenantSettings.timezone) so the window is never computed in a
// viewer's or server's zone.
import { zonedToInstant } from "./tz";

export const LESSON_START_EARLY_MINUTES = 10;
export const LESSON_END_GRACE_MINUTES = 30;

export type StartWindow =
  | { kind: "before"; minutesUntil: number } // > early window before start
  | { kind: "ready"; minutesUntil: number } // inside the startable window
  | { kind: "tooLate" }; // beyond end + grace

/** Academy-wall-clock start instant (ms) of a stored event. */
export function scheduledStartMs(
  orgTz: string,
  date: string,
  startTime: string
): number {
  return zonedToInstant(date, startTime, orgTz).getTime();
}

/**
 * Where `nowMs` sits relative to the startable window of a scheduled
 * session. Pure — call with `Date.now()` on each render/action.
 */
export function sessionStartWindow(opts: {
  nowMs: number;
  startMs: number;
  lessonMinutes: number;
  earlyMinutes?: number;
  endGraceMinutes?: number;
}): StartWindow {
  const minutesUntil = (opts.startMs - opts.nowMs) / 60_000;
  const early = opts.earlyMinutes ?? LESSON_START_EARLY_MINUTES;
  const grace = opts.endGraceMinutes ?? LESSON_END_GRACE_MINUTES;
  if (minutesUntil > early) return { kind: "before", minutesUntil };
  if (minutesUntil < -(opts.lessonMinutes + grace)) return { kind: "tooLate" };
  return { kind: "ready", minutesUntil };
}