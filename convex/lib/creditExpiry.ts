// POLICY §2 — a standard pack's expiry clock starts at the FIRST LESSON
// ACTUALLY TAKEN, not at purchase and not at booking.
//
// Booking RESERVES the credit (spend immediately so it can't be
// double-spent), but `activatedAt` is only stamped when a lesson paid by
// that grant genuinely starts. This module holds the pure date/duration
// decisions so they are unit-testable without a Convex DB; the mutations in
// points.ts / lessons.ts apply them.
//
// PURE TypeScript — deliberately dependency-free (no Convex imports) so the
// node test runner can load it directly, mirroring notificationRegistry.ts.

/** Sentinel for "never expires" — kept in sync with convex/points.ts. */
export const NO_EXPIRY = "9999-12-31";

/** Add whole days to a "YYYY-MM-DD" date (UTC-safe, timezone-agnostic). */
export function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Academy-local calendar date of an instant. Stored schedule dates are
 * wall-clock in the academy's timezone, so the expiry calendar day must be
 * computed in that zone, never the server's. Unknown/invalid tz → UTC.
 */
function zonedDate(instantIso: string, tz: string): string {
  let dtf: Intl.DateTimeFormat;
  try {
    dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  return dtf.format(new Date(instantIso)).slice(0, 10);
}

/**
 * Activation state when a lesson paid by an un-activated expiring grant
 * genuinely starts. `activatedAt` = the actual lesson-start instant;
 * `expiresAt` = `expiryDays` from the academy-local date of that instant.
 */
export function activationForLessonStart(
  lessonStartIso: string,
  orgTz: string,
  expiryDays: number
): { activatedAt: string; expiresAt: string } {
  return {
    activatedAt: lessonStartIso,
    expiresAt: addDaysToDate(zonedDate(lessonStartIso, orgTz), expiryDays),
  };
}

/**
 * Grant state after an event is un-started (discard). The clock must
 * reflect the EARLIEST STILL-STARTED lesson paid by this grant; if no other
 * lesson paid by the grant has actually started, the grant returns to its
 * un-activated NO_EXPIRY state and the clock restarts at the next real
 * lesson.
 *
 * @param spendReferences — every ledger row referencing the grant
 * (`type` + `eventId`); the caller resolves them from the DB.
 * @param startedByEvent — map from scheduleEventId → teacherStartedAt (ISO)
 * for events that are genuinely started and not deleted.
 */
export function stateAfterUnstart(args: {
  grantExpiryDays?: number;
  unstartedEventId: string;
  spendReferences: { eventId: string; type: string }[];
  startedByEvent: Record<string, string>;
  orgTz: string;
}): { activatedAt?: string; expiresAt: string } {
  const {
    grantExpiryDays,
    unstartedEventId,
    spendReferences,
    startedByEvent,
    orgTz,
  } = args;
  if (!grantExpiryDays) return { expiresAt: NO_EXPIRY };

  // Earliest still-started lesson that drew from this grant, excluding the
  // event being un-started.
  let earliest: string | null = null;
  for (const ref of spendReferences) {
    if (ref.type !== "spend") continue;
    if (ref.eventId === unstartedEventId) continue;
    const startedAt = startedByEvent[ref.eventId];
    if (!startedAt) continue;
    if (!earliest || startedAt < earliest) earliest = startedAt;
  }
  if (earliest) {
    const a = activationForLessonStart(earliest, orgTz, grantExpiryDays);
    return { activatedAt: a.activatedAt, expiresAt: a.expiresAt };
  }
  return { activatedAt: undefined, expiresAt: NO_EXPIRY };
}