import { instantToZoned, zonedToInstant } from "./tz";

/** Canonical academy-time half-hour cell. All writes use date/startTime. */
export interface CalendarSlot {
  date: string;
  startTime: string;
  open: boolean;
  editable?: boolean;
  timeOff?: boolean;
  busy?: boolean;
  canBook?: boolean;
  canMove?: boolean;
  eventId?: string;
}

/** A visual fragment; a cell crossing viewer midnight has two fragments. */
export interface ProjectedCalendarSlot extends CalendarSlot {
  key: string;
  viewerDate: string;
  viewerStartTime: string;
  viewerEndTime: string;
  startMs: number;
  endMs: number;
  continuation: boolean;
}

export function calendarSlotKey(slot: Pick<CalendarSlot, "date" | "startTime">): string {
  return `${slot.date}|${slot.startTime}`;
}

export function calendarSlotMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function calendarSlotTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function nextCalendarSlot(slot: Pick<CalendarSlot, "date" | "startTime">): { date: string; startTime: string } {
  const minutes = calendarSlotMinutes(slot.startTime) + 30;
  if (minutes < 1440) return { date: slot.date, startTime: calendarSlotTime(minutes) };
  return { date: nextDate(slot.date), startTime: calendarSlotTime(minutes - 1440) };
}

function nextDate(date: string): string {
  const instant = new Date(`${date}T00:00:00Z`);
  instant.setUTCDate(instant.getUTCDate() + 1);
  return instant.toISOString().slice(0, 10);
}

/**
 * Project the academy lattice, never round viewer wall times. Kathmandu's
 * :15/:45 cells remain the same canonical :00/:30 cells. Midnight fragments
 * retain identity and can be painted, but only the initial fragment can start
 * a booking/move. Existing flags are authoritative; this helper adds no policy.
 */
export function projectCalendarSlots(
  cells: readonly CalendarSlot[],
  academyTimezone: string,
  viewerTimezone: string,
): ProjectedCalendarSlot[] {
  const output: ProjectedCalendarSlot[] = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cell.date) || !/^\d{2}:(00|30)$/.test(cell.startTime) || calendarSlotMinutes(cell.startTime) >= 1440) continue;
    const dayMs = Date.parse(`${cell.date}T00:00:00Z`);
    if (!Number.isFinite(dayMs) || new Date(dayMs).toISOString().slice(0, 10) !== cell.date) continue;
    const key = calendarSlotKey(cell);
    if (seen.has(key)) continue;
    const startMs = zonedToInstant(cell.date, cell.startTime, academyTimezone).getTime();
    if (!Number.isFinite(startMs)) continue;
    seen.add(key);
    const endMs = startMs + 30 * 60_000;
    const start = instantToZoned(new Date(startMs), viewerTimezone);
    const end = instantToZoned(new Date(endMs), viewerTimezone);
    const base = { ...cell, key, startMs, endMs };
    if (start.date === end.date) {
      output.push({ ...base, viewerDate: start.date, viewerStartTime: start.time, viewerEndTime: end.time, continuation: false });
    } else {
      output.push({ ...base, viewerDate: start.date, viewerStartTime: start.time, viewerEndTime: "24:00", continuation: false });
      if (end.time !== "00:00") {
        output.push({ ...base, viewerDate: end.date, viewerStartTime: "00:00", viewerEndTime: end.time, continuation: true, canBook: false, canMove: false });
      }
    }
  }
  return output.sort((a, b) => a.viewerDate.localeCompare(b.viewerDate) || a.viewerStartTime.localeCompare(b.viewerStartTime));
}
