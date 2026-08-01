"use client";

// Admin-side availability editing for one teacher, on the same grid the
// teacher uses. Replaces the old H.7 half-hour checkbox table, which showed a
// different model (raw weekly slots) from the calendar everyone else reads —
// two pictures of one thing that could disagree.

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { toast } from "sonner";
import { convertZoned } from "@/lib/tz";
import { WeeklyCalendar } from "./WeeklyCalendar";
import {
  CalendarSkeleton,
  LegendSwatch,
  calendarRange,
  useZonedCalendar,
  type CalendarView,
  type TimeFormat,
} from "./calendarShared";

function errText(e: unknown) {
  const m = (e as Error)?.message ?? "Something went wrong";
  return m.replace(/^\[.*?\]\s*/, "").split("\n")[0];
}

export function AvailabilityBoard({
  teacherId,
  teacherName,
}: {
  teacherId: string;
  teacherName?: string;
}) {
  const me = useQuery(api.users.getMe);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [brush, setBrush] = useState<"off" | "open" | "block">("open");
  const [brushWeekly, setBrushWeekly] = useState(true);

  const view: CalendarView = "week";
  const { fromDate, toDate } = useMemo(
    () => calendarRange(view, currentDate),
    [currentDate]
  );
  const cal = useQuery(api.calendar.getAdminCalendar, {
    teacherId,
    fromDate,
    toDate,
  });
  const setSlotsBulk = useMutation(api.calendar.setSlotsBulk);

  // Availability is academy wall-clock. The board stays in academy time
  // rather than the admin's own zone — painting 18:00 must mean the teacher's
  // 18:00, and the label under the toolbar says which zone that is.
  const orgTz = cal?.orgTz ?? "Asia/Almaty";
  const viewerTz = orgTz;
  const timeFmt: TimeFormat = me?.timeFormat ?? "24h";
  const zoned = useZonedCalendar(cal, viewerTz);

  async function paint(slots: { date: string; time: string }[]) {
    if (brush === "off" || slots.length === 0) return;
    const open = brush === "open";
    const scope = brushWeekly ? "weekly" : "date";
    const orgSlots = slots.map((sl) => {
      const org = convertZoned(sl.date, sl.time, viewerTz, orgTz);
      return { date: org.date, startTime: org.time };
    });
    try {
      const r = await setSlotsBulk({ slots: orgSlots, open, scope, teacherId });
      toast.success(
        `${open ? "Opened" : "Blocked"} ${r.applied} slot${r.applied === 1 ? "" : "s"}${
          brushWeekly ? " every week" : ""
        }${r.skippedLessons ? ` · ${r.skippedLessons} skipped (has a lesson)` : ""}`,
        {
          action: {
            label: "Undo",
            onClick: () => {
              setSlotsBulk({ slots: orgSlots, open: !open, scope, teacherId })
                .then(() => toast.success("Reverted"))
                .catch((e) => toast.error(errText(e)));
            },
          },
          duration: 10_000,
        }
      );
    } catch (e) {
      toast.error(errText(e));
    }
  }

  function navigate(direction: number) {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + direction * 7);
    setCurrentDate(next);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span className="body-sm" style={{ fontWeight: 600 }}>Tool:</span>
        {([
          { key: "off", label: "Look only" },
          { key: "open", label: "Open brush" },
          { key: "block", label: "Block brush" },
        ] as const).map((b) => (
          <button
            key={b.key}
            className="chip"
            onClick={() => setBrush(b.key)}
            style={
              brush === b.key
                ? {
                    background:
                      b.key === "open" ? "#059669" : b.key === "block" ? "#B45309" : "var(--brand-purple)",
                    color: "#FFFFFF",
                    borderColor: "transparent",
                  }
                : {}
            }
          >
            {b.label}
          </button>
        ))}
        {brush !== "off" && (
          <>
            <label className="body-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={brushWeekly}
                onChange={(e) => setBrushWeekly(e.target.checked)}
              />
              apply every week
            </label>
            <span className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
              Click or drag cells · undo appears after each stroke
            </span>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
        <LegendSwatch color="#DCFCE7" label="Open — bookable" />
        <LegendSwatch color="var(--omnic-gray-100)" label="Busy" />
        <LegendSwatch color="var(--brand-purple)" label="Lesson" />
        <span className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
          Times are academy time ({orgTz})
          {teacherName ? ` · editing ${teacherName}` : ""}
        </span>
      </div>

      {cal === undefined ? (
        <CalendarSkeleton />
      ) : (
        <WeeklyCalendar
          events={zoned.events}
          users={[]}
          currentDate={currentDate}
          mode="week"
          onPrevWeek={() => navigate(-1)}
          onNextWeek={() => navigate(1)}
          onToday={() => setCurrentDate(new Date())}
          onJumpToDate={(d) => setCurrentDate(d)}
          onSlotClick={(date, time) => void paint([{ date, time }])}
          onSlotDragEnd={(slots) => void paint(slots)}
          openSlotKeys={zoned.openSlotKeys}
          openRanges={zoned.openRanges}
          timeFormat={timeFmt}
          readOnly={brush === "off"}
        />
      )}
    </div>
  );
}
