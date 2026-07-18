"use client";

// Shared pieces for the three role calendars (§13.10): visible-range
// computation with a ±1-day fetch buffer for timezone shifts, viewer
// timezone handling, org↔viewer conversion of slots/events, the
// view-switcher chips and legend swatch.

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { addDays, format, startOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { api } from "@convex";
import { convertZoned, browserTz, isValidTz } from "@/lib/tz";
import type { ScheduleEvent } from "./WeeklyCalendar";

export type CalendarView = "day" | "week" | "month";

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
export function useZonedCalendar(
  cal:
    | {
        openSlots: { date: string; startTime: string; endTime: string }[];
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
      };
    }
    const orgTz = cal.orgTz;
    const openSlotEntries: OpenSlotEntry[] = cal.openSlots.map((s) => {
      const z = convertZoned(s.date, s.startTime, orgTz, viewerTz);
      return { key: `${z.date}|${z.time}`, orgDate: s.date, orgTime: s.startTime };
    });
    const keyToOrg = new Map(
      openSlotEntries.map((e) => [e.key, { date: e.orgDate, time: e.orgTime }])
    );
    const events: DisplayEvent[] = cal.events.map((e) => {
      const zs = convertZoned(e.date, e.startTime, orgTz, viewerTz);
      const ze = convertZoned(e.date, e.endTime, orgTz, viewerTz);
      return {
        ...e,
        orgDate: e.date,
        orgStartTime: e.startTime,
        date: zs.date,
        startTime: zs.time,
        endTime: ze.time,
      };
    });
    return {
      openSlotEntries,
      openSlotKeys: openSlotEntries.map((e) => e.key),
      keyToOrg,
      events,
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
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "day" || saved === "week" || saved === "month") setView(saved);
    } catch {
      /* private mode — fall back to the default */
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

/**
 * "14:00 your time · 16:00 academy time" — shown in every dialog so a
 * timezone mismatch can never turn into a missed lesson (§14.5).
 */
export function dualTime(
  orgDate: string,
  orgTime: string,
  orgTz: string,
  viewerTz: string
): string {
  const mine = convertZoned(orgDate, orgTime, orgTz, viewerTz);
  if (viewerTz === orgTz) return `${orgTime} academy time`;
  return `${mine.time} your time · ${orgTime} academy time`;
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

export function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--omnic-gray-600)" }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, background: color, border: "1px solid var(--omnic-gray-200)", display: "inline-block" }} />
      {label}
    </span>
  );
}
