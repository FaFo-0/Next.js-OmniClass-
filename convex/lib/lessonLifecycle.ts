// Pure lifecycle logic for lesson start/discard — unit-testable without a
// Convex runtime.

export const START_EVENT_SOURCE = "one_time_start" as const;
export const BOOKING_EVENT_SOURCE = "one_time_booking" as const;

/** Legacy fallback window: pre-provenance ad-hoc events were only
 * distinguishable from real bookings by creation proximity. */
const LEGACY_START_WINDOW_MS = 2 * 60_000;

export interface StartableEventShape {
  adHoc?: boolean;
  adHocSource?: string | null;
  createdAt: string;
}

/**
 * Was this calendar event minted BY a start-now operation (and therefore
 * un-created when that start is discarded)?
 *
 * - Explicit provenance wins: only `one_time_start` counts.
 * - `one_time_booking` events (a teacher deliberately placing a one-time
 *   lesson on the calendar) are REAL bookings and must survive a discard.
 * - Legacy ad-hoc rows created before provenance existed keep the old
 *   near-creation-time heuristic (event created within 2 minutes of the
 *   lesson row) so genuinely misplaced starts can still be undone.
 */
export function isStartCreatedEvent(
  event: StartableEventShape,
  lessonCreatedAt: string
): boolean {
  if (event.adHocSource === START_EVENT_SOURCE) return true;
  if (event.adHocSource === BOOKING_EVENT_SOURCE) return false;
  return (
    event.adHoc === true &&
    Math.abs(
      new Date(event.createdAt).getTime() - new Date(lessonCreatedAt).getTime()
    ) < LEGACY_START_WINDOW_MS
  );
}