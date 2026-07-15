// §13.10 — timezone display conversion for calendars.
// Times are STORED in the academy's timezone (tenantSettings.timezone).
// Users view/interact in their own timezone; these helpers convert both ways.

/** Offset of `tz` from UTC in minutes at the given instant (DST-aware). */
export function tzOffsetMin(tz: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute)
  );
  return (asUTC - instant.getTime()) / 60_000;
}

/** "YYYY-MM-DD" + "HH:mm" wall time in `tz` → UTC instant. */
export function zonedToInstant(date: string, time: string, tz: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const off1 = tzOffsetMin(tz, guess);
  const inst = new Date(guess.getTime() - off1 * 60_000);
  const off2 = tzOffsetMin(tz, inst);
  return off1 === off2 ? inst : new Date(guess.getTime() - off2 * 60_000);
}

/** UTC instant → wall date/time in `tz`. */
export function instantToZoned(
  instant: Date,
  tz: string
): { date: string; time: string } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`,
  };
}

/** Convert wall time between two timezones. */
export function convertZoned(
  date: string,
  time: string,
  fromTz: string,
  toTz: string
): { date: string; time: string } {
  if (fromTz === toTz) return { date, time };
  return instantToZoned(zonedToInstant(date, time, fromTz), toTz);
}

export function browserTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
