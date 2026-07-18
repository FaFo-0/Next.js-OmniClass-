// Server-side timezone conversion. Schedule rows store WALL-CLOCK time in
// the academy's timezone (tenantSettings.timezone); crons compare against
// real instants, so they must convert rather than assume UTC.

/** Offset of `tz` from UTC in minutes at the given instant (DST-aware). */
export function tzOffsetMin(tz: string, instant: Date): number {
  try {
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
    return Math.round((asUTC - instant.getTime()) / 60_000);
  } catch {
    return 0; // unknown tz → behave like UTC
  }
}

/** "HH:mm" → minutes since midnight. */
export function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes since midnight → "HH:mm" (1440 renders as "24:00"). */
export function minToTime(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Instant → wall date/time in `tz`. Unknown tz falls back to UTC. */
export function instantToZoned(
  instant: Date,
  tz: string
): { date: string; time: string } {
  let dtf: Intl.DateTimeFormat;
  try {
    dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`,
  };
}

/**
 * "YYYY-MM-DD" + "HH:mm" wall time in `tz` → epoch ms.
 * Returns NaN for malformed input so callers can skip the row.
 */
export function wallTimeToMs(date: string, time: string, tz: string): number {
  let d = date;
  let t = time;
  if (t === "24:00") {
    const nd = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(nd.getTime())) return NaN;
    nd.setUTCDate(nd.getUTCDate() + 1);
    d = nd.toISOString().slice(0, 10);
    t = "00:00";
  }
  const guess = Date.parse(`${d}T${t}:00.000Z`);
  if (Number.isNaN(guess)) return NaN;
  const off1 = tzOffsetMin(tz, new Date(guess));
  const inst = guess - off1 * 60_000;
  const off2 = tzOffsetMin(tz, new Date(inst));
  return off1 === off2 ? inst : guess - off2 * 60_000;
}
