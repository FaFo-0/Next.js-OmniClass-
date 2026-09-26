// Canonical client-side planning helpers for the student calendar.
// Keep this module policy-agnostic: the server remains authoritative for
// notice, caps, availability, balance and confirmation.

import { convertZoned } from "./tz";

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

/**
 * Expand a weekly pattern in the pattern author's zone, then retain only
 * occurrences whose canonical academy date falls inside the chosen period.
 * The returned values are already academy wall-clock values and are safe to
 * retain while the viewer changes timezone.
 */
export function generateWeeklyOccurrencesInZone(
  period: BookingPeriod,
  patterns: WeeklyPattern[],
  patternTz: string,
  academyTz: string,
): BookingStart[] {
  const out: BookingStart[] = [];
  const from = addCalendarDays(period.fromDate, -2);
  const to = addCalendarDays(period.toDate, 2);
  for (let patternDate = from; patternDate <= to; patternDate = addCalendarDays(patternDate, 1)) {
    const day = dateAtUtcNoon(patternDate).getUTCDay();
    for (const pattern of patterns) {
      if (pattern.dayOfWeek !== day) continue;
      const converted = convertZoned(patternDate, pattern.startTime, patternTz, academyTz);
      const canonical = { date: converted.date, startTime: converted.time };
      if (canonical.date < period.fromDate || canonical.date > period.toDate) continue;
      out.push(canonical);
    }
  }
  return canonicalizeBookings(out);
}

export function academyDateFromInstant(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values: Record<string, string> = {};
  for (const part of parts) values[part.type] = part.value;
  return `${values.year}-${values.month}-${values.day}`;
}

export function periodForNextAcademyMonth(now: Date, timeZone: string): BookingPeriod {
  const academyDate = academyDateFromInstant(now, timeZone);
  return monthPeriod(addCalendarMonths(firstDayOfMonth(academyDate), 1));
}

export function periodForAcademyMonth(
  now: Date,
  timeZone: string,
  monthOffset: 0 | 1,
): BookingPeriod {
  const academyDate = academyDateFromInstant(now, timeZone);
  return monthPeriod(addCalendarMonths(firstDayOfMonth(academyDate), monthOffset));
}

export function projectBookingForViewer(
  booking: BookingStart,
  academyTz: string,
  viewerTz: string,
): BookingStart {
  const converted = convertZoned(booking.date, booking.startTime, academyTz, viewerTz);
  return { date: converted.date, startTime: converted.time };
}

export function canonicalizeViewerBooking(
  booking: BookingStart,
  viewerTz: string,
  academyTz: string,
): BookingStart {
  const converted = convertZoned(booking.date, booking.startTime, viewerTz, academyTz);
  return { date: converted.date, startTime: converted.time };
}

export function draftKey(booking: BookingStart): string {
  return `${booking.date}|${booking.startTime}`;
}
