// Clock display. Times are stored and passed around as 24h "HH:mm"
// strings everywhere; this converts only at the render boundary, so no
// mutation ever receives a 12h string.

export type TimeFormat = "12h" | "24h";

/** "16:15" → "4:15 PM" (12h) or "16:15" (24h). Invalid input passes through. */
export function formatTime(hhmm: string, fmt: TimeFormat): string {
  if (fmt === "24h") return hhmm;
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  // "24:00" is a valid end-of-day marker in slot data
  if (h === 24 && m === 0) return "12:00 AM";
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Hour-gutter label: drops ":00" in 12h so the column stays narrow. */
export function formatHourLabel(hour: number, fmt: TimeFormat): string {
  if (fmt === "24h") return `${String(hour).padStart(2, "0")}:00`;
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/** "16:15 - 17:15" in the viewer's clock. */
export function formatRange(start: string, end: string, fmt: TimeFormat): string {
  return `${formatTime(start, fmt)} - ${formatTime(end, fmt)}`;
}
