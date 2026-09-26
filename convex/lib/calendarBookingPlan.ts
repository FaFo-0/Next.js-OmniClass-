// Server mirror of src/lib/calendarBookingPlan.ts. Keep the canonical
// explicit-date planning rules dependency-free and in sync with the client.

export type BookingStart = { date: string; startTime: string };
export type WeeklyPattern = { dayOfWeek: number; startTime: string };
export type BookingPeriod = { fromDate: string; toDate: string };

function dateAtUtcNoon(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

export function addCalendarDays(date: string, days: number): string {
  const d = dateAtUtcNoon(date);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addCalendarMonths(date: string, months: number): string {
  const d = dateAtUtcNoon(date);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function firstDayOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function lastDayOfMonth(date: string): string {
  return addCalendarDays(addCalendarMonths(firstDayOfMonth(date), 1), -1);
}

export function monthPeriod(date: string): BookingPeriod {
  const fromDate = firstDayOfMonth(date);
  return { fromDate, toDate: lastDayOfMonth(date) };
}

/** Exclusive start of the month after the following academy month. */
export function nextMonthBoundaryDate(academyDate: string): string {
  return addCalendarMonths(firstDayOfMonth(academyDate), 2);
}

export function canonicalizeBookings(bookings: BookingStart[]): BookingStart[] {
  const seen = new Set<string>();
  return [...bookings]
    .filter((booking) => {
      const key = `${booking.date}|${booking.startTime}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => `${a.date}|${a.startTime}`.localeCompare(`${b.date}|${b.startTime}`));
}

export function generateWeeklyOccurrences(
  period: BookingPeriod,
  patterns: WeeklyPattern[],
): BookingStart[] {
  const wanted = new Map<number, string[]>();
  for (const pattern of patterns) {
    if (!Number.isInteger(pattern.dayOfWeek) || pattern.dayOfWeek < 0 || pattern.dayOfWeek > 6) continue;
    const times = wanted.get(pattern.dayOfWeek) ?? [];
    if (!times.includes(pattern.startTime)) times.push(pattern.startTime);
    wanted.set(pattern.dayOfWeek, times);
  }
  for (const times of wanted.values()) times.sort();

  const out: BookingStart[] = [];
  for (let date = period.fromDate; date <= period.toDate; date = addCalendarDays(date, 1)) {
    const times = wanted.get(dateAtUtcNoon(date).getUTCDay()) ?? [];
    for (const startTime of times) out.push({ date, startTime });
  }
  return canonicalizeBookings(out);
}
