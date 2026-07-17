// §13.10 — timezone display conversion for calendars.
// Times are STORED in the academy's timezone (tenantSettings.timezone).
// Users view/interact in their own timezone; these helpers convert both ways.

/** True if the runtime recognizes this IANA timezone. */
export function isValidTz(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset of `tz` from UTC in minutes at the given instant (DST-aware).
 *  Returns 0 for an unknown tz instead of throwing (defensive). */
export function tzOffsetMin(tz: string, instant: Date): number {
  if (!isValidTz(tz)) return 0;
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

/** "YYYY-MM-DD" + "HH:mm" wall time in `tz` → UTC instant.
 *  C-3: "24:00" is a valid end-of-day marker but an invalid Date literal —
 *  roll it to 00:00 of the next day before parsing. */
export function zonedToInstant(date: string, time: string, tz: string): Date {
  let d = date;
  let t = time;
  if (t === "24:00") {
    const nd = new Date(`${date}T00:00:00Z`);
    nd.setUTCDate(nd.getUTCDate() + 1);
    d = nd.toISOString().slice(0, 10);
    t = "00:00";
  }
  const guess = new Date(`${d}T${t}:00Z`);
  const off1 = tzOffsetMin(tz, guess);
  const inst = new Date(guess.getTime() - off1 * 60_000);
  const off2 = tzOffsetMin(tz, inst);
  return off1 === off2 ? inst : new Date(guess.getTime() - off2 * 60_000);
}

/** UTC instant → wall date/time in `tz`. Falls back to UTC for unknown tz. */
export function instantToZoned(
  instant: Date,
  tz: string
): { date: string; time: string } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: isValidTz(tz) ? tz : "UTC",
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
