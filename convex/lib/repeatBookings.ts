/** The staged week plus two following weekly occurrences; never open-ended. */
export const MAX_REPEAT_WEEKS = 3;

export type BookingStart = { date: string; startTime: string };
export type ExpandedBookingStart = BookingStart & { repeatOccurrence: boolean };

function addWholeDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/**
 * Expand an explicitly staged weekly pattern inside the server's finite
 * booking boundary. Callers cannot submit arbitrary far-future dates and
 * label them "repeat" to escape the normal booking horizon.
 */
export function expandFiniteWeeklyBookings(
  bookings: BookingStart[],
  repeat: boolean
): ExpandedBookingStart[] {
  if (!repeat) return bookings.map((booking) => ({ ...booking, repeatOccurrence: false }));

  const expanded: ExpandedBookingStart[] = [];
  for (let week = 0; week < MAX_REPEAT_WEEKS; week += 1) {
    for (const booking of bookings) {
      expanded.push({
        date: week === 0 ? booking.date : addWholeDays(booking.date, week * 7),
        startTime: booking.startTime,
        repeatOccurrence: week > 0,
      });
    }
  }
  return expanded;
}
