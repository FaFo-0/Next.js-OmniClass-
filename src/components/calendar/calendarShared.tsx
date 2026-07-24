"use client";

// Shared pieces for the three role calendars (§13.10): visible-range
// computation with a ±1-day fetch buffer for timezone shifts, viewer
// timezone handling, org↔viewer conversion of slots/events, the
// view-switcher chips and legend swatch.

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { addDays, format, startOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { api } from "@convex";
import { convertZoned, browserTz, isValidTz, zonedToInstant } from "@/lib/tz";
import { formatTime, type TimeFormat } from "@/lib/timeFormat";
import type { ScheduleEvent } from "./WeeklyCalendar";

export type { TimeFormat };

export type CalendarView = "day" | "week" | "month";

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Bookable starts (viewer tz) inside an open window, on the booking grid, that
 * keep the lesson fully inside the window and a mandatory break clear of every
 * busy block (POLICY §5). Mirrors the server check so pickers only offer valid
 * times. Shared by the student and admin calendars.
 */
export function bookableStarts(
  win: { date: string; startTime: string; endTime: string },
  busy: { date: string; startTime: string; endTime: string }[],
  lessonMin: number,
  bufferMin: number,
  gran: number,
  // Student self-booking window (POLICY §5): starts must be ≥ minNoticeHours
  // ahead and ≤ horizonDays out. Omit for admin/teacher assignment, which has
  // no notice/horizon limits. `viewerTz` interprets the win.date/start as wall
  // time; `now` is Date.now().
  notice?: {
    viewerTz: string;
    now: number;
    minNoticeHours: number;
    horizonDays: number;
  }
): string[] {
  const s0 = toMin(win.startTime);
  const e0 = win.endTime === "24:00" ? 24 * 60 : toMin(win.endTime);
  const dayBusy = busy.filter((b) => b.date === win.date);
  const minInstant = notice ? notice.now + notice.minNoticeHours * 3_600_000 : 0;
  const maxInstant = notice
    ? notice.now + notice.horizonDays * 86_400_000
    : Infinity;
  const out: string[] = [];
  const first = Math.ceil(s0 / gran) * gran;
  for (let cs = first; cs + lessonMin <= e0; cs += gran) {
    const ce = cs + lessonMin;
    const clash = dayBusy.some((b) => {
      const bs = toMin(b.startTime);
      const be = b.endTime === "24:00" ? 24 * 60 : toMin(b.endTime);
      return bs < ce + bufferMin && cs - bufferMin < be;
    });
    if (clash) continue;
    if (notice) {
      const t = zonedToInstant(win.date, toHHMM(cs), notice.viewerTz).getTime();
      if (t < minInstant || t > maxInstant) continue;
    }
    out.push(toHHMM(cs));
  }
  return out;
}

export function calendarRange(view: CalendarView, currentDate: Date) {
  let from: Date;
  let to: Date;
  if (view === "day") {
    from = currentDate;
    to = currentDate;
  } else if (view === "week") {
    from = startOfWeek(currentDate, { weekStartsOn: 1 });
    to = addDays(from, 6);
  } else {
    from = startOfMonth(currentDate);
    to = endOfMonth(currentDate);
  }
  return {
    // ±1 day buffer: timezone conversion can shift items across midnight
    fromDate: format(addDays(from, -1), "yyyy-MM-dd"),
    toDate: format(addDays(to, 1), "yyyy-MM-dd"),
  };
}

export interface OpenSlotEntry {
  /** viewer-timezone key "YYYY-MM-DD|HH:mm" used by the grid */
  key: string;
  /** original academy-timezone values used by mutations */
  orgDate: string;
  orgTime: string;
}

export type DisplayEvent = ScheduleEvent & {
  studentName?: string | null;
  googleMeetLink?: string | null;
  recurringBookingId?: string | null;
  /** original academy-timezone values */
  orgDate: string;
  orgStartTime: string;
};

/** Convert server calendar data (academy tz) into viewer-tz display data. */
/** A tz-converted range/busy band; keeps the academy-tz origin for mutations. */
export interface ZonedRange {
  date: string;
  startTime: string;
  endTime: string;
  orgDate: string;
  orgStartTime: string;
}

export function useZonedCalendar(
  cal:
    | {
        openSlots: { date: string; startTime: string; endTime: string }[];
        openRanges?: { date: string; startTime: string; endTime: string }[];
        busy?: { date: string; startTime: string; endTime: string }[];
        events: any[];
        orgTz: string;
      }
    | undefined,
  viewerTz: string
) {
  return useMemo(() => {
    if (!cal) {
      return {
        openSlotEntries: [] as OpenSlotEntry[],
        openSlotKeys: [] as string[],
        keyToOrg: new Map<string, { date: string; time: string }>(),
        events: [] as DisplayEvent[],
        openRanges: [] as ZonedRange[],
        busy: [] as ZonedRange[],
      };
    }
    const orgTz = cal.orgTz;
    // Legacy rows can carry an empty or garbage "HH:mm"; converting one throws
    // (Invalid Date) and would blank the entire calendar. Validate + guard so a
    // bad row is skipped, never fatal.
    const isTime = (t: string) => /^\d{1,2}:\d{2}$/.test(t ?? "");
    const conv = (date: string, time: string) => {
      if (!isTime(time)) return null;
      try {
        return convertZoned(date, time, orgTz, viewerTz);
      } catch {
        return null;
      }
    };
    const openSlotEntries: OpenSlotEntry[] = cal.openSlots.flatMap((s) => {
      const z = conv(s.date, s.startTime);
      return z
        ? [{ key: `${z.date}|${z.time}`, orgDate: s.date, orgTime: s.startTime }]
        : [];
    });
    const keyToOrg = new Map(
      openSlotEntries.map((e) => [e.key, { date: e.orgDate, time: e.orgTime }])
    );
    const zoneRange = (
      r: { date: string; startTime: string; endTime: string }
    ): ZonedRange | null => {
      const zs = conv(r.date, r.startTime);
      const ze = conv(r.date, r.endTime);
      if (!zs || !ze) return null;
      return {
        date: zs.date,
        startTime: zs.time,
        // A window ending at exactly midnight lands on the next day as 00:00;
        // keep it on the start day as 24:00 so the band renders in one column.
        endTime: ze.date !== zs.date ? "24:00" : ze.time,
        orgDate: r.date,
        orgStartTime: r.startTime,
      };
    };
    const events: DisplayEvent[] = cal.events.flatMap((e) => {
      const zs = conv(e.date, e.startTime);
      const ze = conv(e.date, e.endTime);
      if (!zs || !ze) return [];
      return [
        {
          ...e,
          orgDate: e.date,
          orgStartTime: e.startTime,
          date: zs.date,
          startTime: zs.time,
          endTime: ze.time,
        },
      ];
    });
    return {
      openSlotEntries,
      openSlotKeys: openSlotEntries.map((e) => e.key),
      keyToOrg,
      events,
      openRanges: (cal.openRanges ?? [])
        .map(zoneRange)
        .filter((r): r is ZonedRange => r !== null),
      busy: (cal.busy ?? [])
        .map(zoneRange)
        .filter((r): r is ZonedRange => r !== null),
    };
  }, [cal, viewerTz]);
}

/** Viewer timezone: saved preference → browser default. Setter persists. */
export function useViewerTz(savedTz: string | null | undefined) {
  const [override, setOverride] = useState<string | null>(null);
  const save = useMutation(api.users.setTimezone);
  const candidate = override ?? savedTz ?? browserTz();
  const tz = isValidTz(candidate) ? candidate : "UTC";
  const set = (next: string) => {
    if (!isValidTz(next)) return; // ignore garbage; never break the grid
    setOverride(next);
    save({ timezone: next }).catch(() => {});
  };
  return [tz, set] as const;
}

/** Persist the chosen view (day/week/month) per role across visits. */
export function useRememberedView(storageKey: string) {
  const [view, setView] = useState<CalendarView>("week");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(storageKey);
    } catch {
      /* private mode — fall back to the default */
    }
    const isPhone = typeof window !== "undefined" && window.innerWidth < 768;
    if (saved === "day" || saved === "week" || saved === "month") {
      // Z.X-8 — seven columns are unreadable on a phone: a remembered
      // "week" falls back to Day there (the choice is kept for desktop).
      setView(isPhone && saved === "week" ? "day" : saved);
    } else if (isPhone) {
      setView("day");
    }
    setLoaded(true);
  }, [storageKey]);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(storageKey, view);
    } catch {
      /* ignore */
    }
  }, [view, loaded, storageKey]);
  return [view, setView] as const;
}

/** Clock preference: saved value → 24h. Setter persists like the timezone. */
export function useTimeFormat(saved: TimeFormat | null | undefined) {
  const [override, setOverride] = useState<TimeFormat | null>(null);
  const save = useMutation(api.users.setTimeFormat);
  const fmt: TimeFormat = override ?? saved ?? "24h";
  const set = (next: TimeFormat) => {
    setOverride(next);
    save({ timeFormat: next }).catch(() => {});
  };
  return [fmt, set] as const;
}

export function TimeFormatToggle({
  value,
  onChange,
}: {
  value: TimeFormat;
  onChange: (f: TimeFormat) => void;
}) {
  return (
    <button
      className="chip"
      onClick={() => onChange(value === "24h" ? "12h" : "24h")}
      title="Switch between 24-hour and 12-hour clock"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {value === "24h" ? "24h" : "12h"}
    </button>
  );
}

/**
 * "14:00 your time · 16:00 academy time" — shown in every dialog so a
 * timezone mismatch can never turn into a missed lesson (§14.5).
 */
export function dualTime(
  orgDate: string,
  orgTime: string,
  orgTz: string,
  viewerTz: string,
  fmt: TimeFormat = "24h"
): string {
  const mine = convertZoned(orgDate, orgTime, orgTz, viewerTz);
  if (viewerTz === orgTz) return `${formatTime(orgTime, fmt)} academy time`;
  return `${formatTime(mine.time, fmt)} your time · ${formatTime(orgTime, fmt)} academy time`;
}

export function TimezoneSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (tz: string) => void;
}) {
  const zones = useMemo(() => {
    try {
      return (Intl as any).supportedValuesOf("timeZone") as string[];
    } catch {
      return [value];
    }
  }, [value]);
  return (
    <select
      className="select"
      style={{ width: "auto", maxWidth: 220, fontSize: 13 }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Times are shown in this timezone"
    >
      {!zones.includes(value) && <option value={value}>{value}</option>}
      {zones.map((z) => (
        <option key={z} value={z}>
          {z.replace(/_/g, " ")}
        </option>
      ))}
    </select>
  );
}

export function ViewSwitcher({
  view,
  onChange,
}: {
  view: CalendarView;
  onChange: (v: CalendarView) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {(["day", "week", "month"] as const).map((v) => (
        <button
          key={v}
          className="chip"
          onClick={() => onChange(v)}
          style={
            view === v
              ? {
                  background: "var(--brand-purple)",
                  color: "#FFFFFF",
                  borderColor: "var(--brand-purple)",
                  boxShadow: "0 2px 10px rgba(103,22,164,0.25)",
                }
              : {}
          }
        >
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </button>
      ))}
    </div>
  );
}

/**
 * Z.X-1 — placeholder grid shown while the calendar query resolves, so the
 * page reserves its final height instead of collapsing and snapping back.
 * Mirrors WeeklyCalendar's geometry (60px gutter, 48px hours, 560px cap).
 */
export function CalendarSkeleton({ columns = 7 }: { columns?: number }) {
  const rows = 12;
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading calendar…</span>
      <div className="flex items-center gap-2">
        <div className="skel" style={{ width: 32, height: 32, borderRadius: 8 }} />
        <div className="skel" style={{ width: 64, height: 32, borderRadius: 8 }} />
        <div className="skel" style={{ width: 32, height: 32, borderRadius: 8 }} />
        <div className="skel" style={{ width: 160, height: 20, borderRadius: 6, marginInlineStart: 8 }} />
      </div>
      <div className="overflow-hidden rounded-lg border border-border" style={{ maxHeight: 560 }}>
        <div
          className="grid"
          style={{ gridTemplateColumns: `60px repeat(${columns}, 1fr)` }}
          aria-hidden
        >
          <div className="border-b border-e border-border" style={{ height: 56, background: "#FAF9FB" }} />
          {Array.from({ length: columns }, (_, i) => (
            <div
              key={`h-${i}`}
              className="flex flex-col items-center justify-center gap-1 border-b border-e border-border last:border-e-0"
              style={{ height: 56, background: "#FAF9FB" }}
            >
              <div className="skel" style={{ width: 28, height: 10, borderRadius: 4 }} />
              <div className="skel" style={{ width: 20, height: 16, borderRadius: 4 }} />
            </div>
          ))}
          {Array.from({ length: rows }, (_, r) => (
            <div key={`r-${r}`} className="contents">
              <div className="border-b border-e border-border" style={{ height: 48 }} />
              {Array.from({ length: columns }, (_, c) => (
                <div
                  key={`c-${r}-${c}`}
                  className="border-b border-e border-border last:border-e-0"
                  style={{ height: 48 }}
                >
                  {/* sparse blocks so it reads as a calendar, not a grey wall */}
                  {(r * 7 + c * 3) % 11 === 0 && (
                    <div
                      className="skel"
                      style={{ margin: 4, height: 40, borderRadius: 6 }}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--omnic-gray-600)" }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, background: color, border: "1px solid var(--omnic-gray-200)", display: "inline-block" }} />
      {label}
    </span>
  );
}
