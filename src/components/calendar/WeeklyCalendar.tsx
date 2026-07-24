"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  startOfWeek,
  addDays,
  format,
  isSameDay,
  isToday,
  parseISO,
} from "date-fns";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatHourLabel, formatTime, type TimeFormat } from "@/lib/timeFormat";
export interface ScheduleEvent {
  _id: string;
  teacherId?: string;
  studentId?: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  createdAt: string;
  /** set when the lesson comes from a weekly recurring schedule */
  recurringBookingId?: string | null;
}

export interface CalendarUser {
  externalId: string;
  name: string;
}

interface WeeklyCalendarProps {
  events: ScheduleEvent[];
  users: CalendarUser[];
  currentDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onSlotClick?: (date: string, time: string) => void;
  onEventClick?: (event: ScheduleEvent) => void;
  readOnly?: boolean;
  /** "day" renders a single-column day grid; default "week". */
  mode?: "day" | "week";
  /** Extra controls (e.g. view switcher chips) rendered in the header row. */
  headerExtra?: ReactNode;
  /** Slot keys "YYYY-MM-DD|HH:mm" that are Open (bookable). Others = Busy. */
  openSlotKeys?: string[];
  /**
   * Range model (POLICY §5): continuous open windows rendered as green bands.
   * When provided, per-cell Open highlighting is suppressed in favour of bands.
   */
  openRanges?: { date: string; startTime: string; endTime: string }[];
  /** Opaque "Busy" intervals (other students' lessons on a student's view). */
  busyBlocks?: { date: string; startTime: string; endTime: string }[];
  /** Student clicks an open band → open the start-time picker for that window. */
  onRangeClick?: (date: string, startTime: string, endTime: string) => void;
  /** Reschedule target-picking mode: only open slots clickable, highlighted. */
  moveMode?: boolean;
  /** Called after a drag-selection of 2+ empty cells (rectangular). */
  onSlotDragEnd?: (slots: { date: string; time: string }[]) => void;
  /** Jump-to-date: called with a date picked from the header label. */
  onJumpToDate?: (date: Date) => void;
  /** Drag a lesson block onto an open slot → reschedule (§14.6). */
  onEventDrop?: (event: ScheduleEvent, date: string, time: string) => void;
  /**
   * Desktop hover card content for a lesson block (§14.6). Returning null
   * shows nothing. Never rendered on touch devices, where hover doesn't exist.
   */
  renderEventHover?: (event: ScheduleEvent) => ReactNode;
  /** Viewer clock preference; times are still 24h "HH:mm" internally. */
  timeFormat?: TimeFormat;
}

const HOUR_START = 0;
const HOUR_END = 24;
const SCROLL_TO_HOUR = 7;
const HOUR_PX = 48; // fixed grid height per hour (overlay math depends on it)
const HOVER_CARD_W = 240;

export function studentColor(studentId: string): string {
  let hash = 0;
  for (let i = 0; i < studentId.length; i++) {
    hash = studentId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

/**
 * Terminal-state styling for a lesson block. Returns null for a live
 * (scheduled/makeup) event, which keeps its per-student color. Each state
 * carries a text label so status is never conveyed by color alone (§14.6).
 */
export function eventStatusStyle(status: string): {
  border: string;
  bg: string;
  label: string;
  faded?: boolean;
  strike?: boolean;
} | null {
  switch (status) {
    case "completed":
      return { border: "#16A34A", bg: "#DCFCE7", label: "Done" };
    case "no_show_student":
      return { border: "#D97706", bg: "#FEF3C7", label: "No-show" };
    case "no_show_teacher":
      return { border: "#DC2626", bg: "#FEE2E2", label: "Teacher no-show" };
    case "cancelled":
      return { border: "#9CA3AF", bg: "#F3F4F6", label: "Cancelled", faded: true, strike: true };
    default:
      return null;
  }
}

export function studentBgColor(studentId: string): string {
  let hash = 0;
  for (let i = 0; i < studentId.length; i++) {
    hash = studentId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 65%, 92%)`;
}

function timeToRow(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h - HOUR_START) * 4 + Math.floor(m / 15) + 1; // +1 because grid rows are 1-indexed
}

export function WeeklyCalendar({
  events,
  users,
  currentDate,
  onPrevWeek,
  onNextWeek,
  onToday,
  onSlotClick,
  onEventClick,
  readOnly = false,
  mode = "week",
  headerExtra,
  openSlotKeys,
  openRanges,
  busyBlocks,
  onRangeClick,
  moveMode = false,
  onSlotDragEnd,
  onJumpToDate,
  onEventDrop,
  renderEventHover,
  timeFormat = "24h",
}: WeeklyCalendarProps) {
  const openSet = useMemo(() => new Set(openSlotKeys ?? []), [openSlotKeys]);
  const slotAware = openSlotKeys !== undefined;
  // Band mode = continuous open/busy ranges instead of the discrete grid.
  const bandMode = openRanges !== undefined;
  const rangesByDay = useMemo(() => {
    const map = new Map<string, { startTime: string; endTime: string }[]>();
    for (const r of openRanges ?? []) {
      const arr = map.get(r.date) ?? [];
      arr.push({ startTime: r.startTime, endTime: r.endTime });
      map.set(r.date, arr);
    }
    return map;
  }, [openRanges]);
  const busyByDay = useMemo(() => {
    const map = new Map<string, { startTime: string; endTime: string }[]>();
    for (const b of busyBlocks ?? []) {
      const arr = map.get(b.date) ?? [];
      arr.push({ startTime: b.startTime, endTime: b.endTime });
      map.set(b.date, arr);
    }
    return map;
  }, [busyBlocks]);

  // Row size follows the data: half-hour timezones turn whole-hour academy
  // slots into "HH:30" (C-4), and ad-hoc lessons can start at :15/:45. Pick
  // the coarsest row that still lands every start on a row boundary.
  const rowMinutes = useMemo(() => {
    const marks = new Set<number>();
    for (const k of openSlotKeys ?? []) {
      const t = k.split("|")[1];
      if (t) marks.add(Number(t.split(":")[1]));
    }
    for (const e of events) marks.add(Number(e.startTime.split(":")[1]));
    const mins = [...marks].filter((m) => Number.isFinite(m));
    if (mins.some((m) => m % 30 !== 0)) return 15;
    if (mins.some((m) => m % 60 !== 0)) return 30;
    return 60;
  }, [openSlotKeys, events]);
  const rows = useMemo(() => {
    const out: { h: number; m: number; time: string }[] = [];
    for (let h = HOUR_START; h < HOUR_END; h++) {
      for (let m = 0; m < 60; m += rowMinutes) {
        out.push({
          h,
          m,
          time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
        });
      }
    }
    return out;
  }, [rowMinutes]);
  const rowH = (HOUR_PX * rowMinutes) / 60;

  // Scrollable 24h grid. Opens at the current hour when today is visible,
  // otherwise at the morning.
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Lesson being dragged to another slot (HTML5 DnD — kept separate from
  // the pointer-based slot painting so the two never fight)
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const dragTargetRef = useRef<{ date: string; time: string; open: boolean } | null>(null);

  // Hover card (§14.6). Positioned fixed against the viewport because the
  // grid scrolls in both axes and would clip an absolutely-placed card.
  const [hover, setHover] = useState<{
    event: ScheduleEvent;
    left: number;
    right: number;
    y: number;
  } | null>(null);
  const hoverEnabled =
    renderEventHover !== undefined &&
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: hover)").matches;

  // Ticking "now" for the current-time line (updates each minute)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // C-10 — touch tap-select: pointer drag is unreliable on touch, so on a
  // coarse pointer a range is picked by tapping the first cell then the last.
  const isTouch =
    typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: coarse)").matches;
  const [tapAnchor, setTapAnchor] = useState<{ day: number; row: number } | null>(null);

  // Drag-to-select empty cells (rectangular selection)
  const [dragStart, setDragStart] = useState<{ day: number; hour: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ day: number; hour: number } | null>(null);
  const dragMoved = useRef(false);
  const dragKeys = useMemo(() => {
    if (!dragStart || !dragEnd) return new Set<string>();
    const keys = new Set<string>();
    const [d0, d1] = [Math.min(dragStart.day, dragEnd.day), Math.max(dragStart.day, dragEnd.day)];
    const [h0, h1] = [Math.min(dragStart.hour, dragEnd.hour), Math.max(dragStart.hour, dragEnd.hour)];
    for (let dd = d0; dd <= d1; dd++) {
      for (let hh = h0; hh <= h1; hh++) keys.add(`${dd}-${hh}`);
    }
    return keys;
  }, [dragStart, dragEnd]);
  const t = useTranslations("components.calendar");
  const weekStart = useMemo(
    () =>
      mode === "day"
        ? currentDate
        : startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate, mode]
  );

  const weekDays = useMemo(
    () =>
      Array.from({ length: mode === "day" ? 1 : 7 }, (_, i) =>
        addDays(weekStart, i)
      ),
    [weekStart, mode]
  );

  const weekEnd = weekDays[weekDays.length - 1];

  const weekRangeLabel = useMemo(() => {
    if (mode === "day") return format(weekStart, "EEEE, MMM d, yyyy");
    const startStr = format(weekStart, "MMM d");
    const endStr =
      weekStart.getMonth() === weekEnd.getMonth()
        ? format(weekEnd, "d, yyyy")
        : format(weekEnd, "MMM d, yyyy");
    return `${startStr} - ${endStr}`;
  }, [weekStart, weekEnd, mode]);

  const userMap = useMemo(() => {
    const map = new Map<string, CalendarUser>();
    for (const u of users) {
      map.set(u.externalId, u);
    }
    return map;
  }, [users]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const day of weekDays) {
      const dateStr = format(day, "yyyy-MM-dd");
      map.set(
        dateStr,
        events.filter((e) => e.date === dateStr)
      );
    }
    return map;
  }, [events, weekDays]);

  const totalRows = (HOUR_END - HOUR_START) * 4; // 15-min increments

  // Index of the visible column that is "today" (-1 when today is off-screen)
  const todayIdx = weekDays.findIndex((d) => isToday(d));
  // Minutes since midnight → px offset, used by the now-line
  const nowTopPx =
    (now.getHours() * 60 + now.getMinutes() - HOUR_START * 60) * (HOUR_PX / 60);

  // Open the grid at the current hour when today is on screen
  useEffect(() => {
    if (!scrollRef.current) return;
    const target = todayIdx >= 0 ? Math.max(0, nowTopPx - 2 * HOUR_PX) : SCROLL_TO_HOUR * HOUR_PX;
    scrollRef.current.scrollTop = target;
    // only on mount / view change — not on every minute tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, todayIdx >= 0]);

  /** C-10 touch: first tap arms an anchor, second tap commits the range. */
  function tapCell(day: number, row: number) {
    if (!onSlotDragEnd) return;
    if (tapAnchor === null) {
      setTapAnchor({ day, row });
      return;
    }
    const d0 = Math.min(tapAnchor.day, day);
    const d1 = Math.max(tapAnchor.day, day);
    const r0 = Math.min(tapAnchor.row, row);
    const r1 = Math.max(tapAnchor.row, row);
    const slots: { date: string; time: string }[] = [];
    for (let dd = d0; dd <= d1; dd++) {
      for (let rr = r0; rr <= r1; rr++) {
        slots.push({ date: format(weekDays[dd], "yyyy-MM-dd"), time: rows[rr].time });
      }
    }
    slots.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
    setTapAnchor(null);
    onSlotDragEnd(slots);
  }

  /** Select a whole day column (header click) or one hour across the week. */
  function selectBulk(kind: "day" | "row", index: number) {
    if (readOnly || !onSlotDragEnd) return;
    const slots: { date: string; time: string }[] = [];
    if (kind === "day") {
      for (const r of rows) {
        slots.push({ date: format(weekDays[index], "yyyy-MM-dd"), time: r.time });
      }
    } else {
      for (const d of weekDays) {
        slots.push({ date: format(d, "yyyy-MM-dd"), time: rows[index].time });
      }
    }
    onSlotDragEnd(slots);
  }

  useEffect(() => {
    if (!dragStart) return;
    const up = () => {
      if (dragEnd && dragKeys.size > 1 && onSlotDragEnd) {
        const slots: { date: string; time: string }[] = [];
        for (const key of dragKeys) {
          const [dd, rr] = key.split("-").map(Number);
          slots.push({
            date: format(weekDays[dd], "yyyy-MM-dd"),
            time: rows[rr].time,
          });
        }
        slots.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
        onSlotDragEnd(slots);
      }
      setDragStart(null);
      setDragEnd(null);
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [dragStart, dragEnd, dragKeys, onSlotDragEnd, weekDays, rows]);

  // Lesson drag → drop on an open slot
  useEffect(() => {
    if (!draggingEventId) return;
    const up = () => {
      const target = dragTargetRef.current;
      const ev = events.find((x) => x._id === draggingEventId);
      setDraggingEventId(null);
      dragTargetRef.current = null;
      if (target?.open && ev && onEventDrop) onEventDrop(ev, target.date, target.time);
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [draggingEventId, events, onEventDrop]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={onPrevWeek}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onToday}>
            {t("today")}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={onNextWeek}>
            <ChevronRight className="size-4" />
          </Button>
          {onJumpToDate ? (
            <label
              className="relative ms-2 cursor-pointer whitespace-nowrap text-base font-semibold hover:underline sm:text-lg"
              title="Jump to a date"
            >
              {weekRangeLabel}
              <input
                type="date"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(e) => {
                  if (e.target.value) onJumpToDate(new Date(`${e.target.value}T12:00:00`));
                }}
              />
            </label>
          ) : (
            <h2 className="ms-2 whitespace-nowrap text-base font-semibold sm:text-lg">{weekRangeLabel}</h2>
          )}
        </div>
        {headerExtra}
      </div>

      {isTouch && !readOnly && onSlotDragEnd && !moveMode && (
        <div className="text-xs text-muted-foreground">
          {tapAnchor
            ? "Now tap the end of the range."
            : "Tap the start of a range, then tap the end."}
          {tapAnchor && (
            <button
              className="ms-2 underline"
              onClick={() => setTapAnchor(null)}
            >
              cancel
            </button>
          )}
        </div>
      )}

      {/* Calendar Grid — 24h, scrollable, starts at the morning */}
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-auto rounded-lg border border-border select-none"
        style={{ maxHeight: 560 }}
      >
        <div
          className={mode === "day" ? "grid min-w-[280px]" : "grid min-w-[800px]"}
          style={{
            gridTemplateColumns: `60px repeat(${weekDays.length}, 1fr)`,
          }}
        >
          {/* Corner cell */}
          <div className="sticky top-0 z-20 border-b border-e border-border p-2" style={{ background: "#FAF9FB" }} />

          {/* Day headers */}
          {weekDays.map((day, dayIdx) => {
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                role={!readOnly && onSlotDragEnd ? "button" : undefined}
                title={!readOnly && onSlotDragEnd ? "Select this whole day" : undefined}
                onClick={() => selectBulk("day", dayIdx)}
                className={`sticky top-0 z-20 border-b border-e border-border p-2 text-center text-sm font-medium last:border-e-0 ${
                  today ? "font-bold text-primary" : "text-muted-foreground"
                } ${!readOnly && onSlotDragEnd ? "cursor-pointer hover:bg-accent/40" : ""}`}
                style={{ background: today ? "#F3EDFA" : "#FAF9FB" }}
              >
                <div>{format(day, "EEE")}</div>
                <div
                  className={`text-lg ${
                    today
                      ? "inline-flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      : ""
                  }`}
                >
                  {format(day, "d")}
                </div>
              </div>
            );
          })}

          {/* Time rows (hour or half-hour) */}
          {rows.map((row, rowIdx) => (
            <div key={`row-${row.time}`} className="contents" role="presentation">
              {/* Time label — only on the top-of-hour row */}
              <div
                role={!readOnly && onSlotDragEnd ? "button" : undefined}
                title={!readOnly && onSlotDragEnd ? "Select this time across the week" : undefined}
                onClick={() => selectBulk("row", rowIdx)}
                className={`relative border-e border-border px-2 text-end text-xs text-muted-foreground ${
                  !readOnly && onSlotDragEnd ? "cursor-pointer hover:bg-accent/40" : ""
                }`}
                style={{ borderBottom: row.m === 0 ? "1px solid var(--border)" : "none" }}
              >
                {row.m === 0 && (
                  <span className="absolute -top-2 end-2 whitespace-nowrap">
                    {formatHourLabel(row.h, timeFormat)}
                  </span>
                )}
              </div>

              {/* Day cells for this row */}
              {weekDays.map((day, dayIdx) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const time = row.time;
                const isOpen = openSet.has(`${dateStr}|${time}`);
                const clickable =
                  !readOnly && !!onSlotClick && (!moveMode || isOpen);
                const dragging = dragKeys.has(`${dayIdx}-${rowIdx}`);
                let slotBg = "";
                if (tapAnchor && tapAnchor.day === dayIdx && tapAnchor.row === rowIdx) {
                  slotBg = "bg-sky-300/80 ring-2 ring-sky-500";
                } else if (dragging) {
                  slotBg = "bg-sky-200/70";
                } else if (bandMode) {
                  // Availability is drawn as bands in the overlay; cells stay a
                  // plain backdrop (and the paint surface for teachers).
                  slotBg = "";
                } else if (draggingEventId && slotAware && isOpen) {
                  slotBg = "bg-emerald-200/80 ring-1 ring-emerald-500";
                } else if (slotAware && isOpen) {
                  slotBg = moveMode
                    ? "bg-emerald-200/70 animate-pulse"
                    : "bg-emerald-100/60";
                } else if (slotAware && !isOpen && moveMode) {
                  slotBg = "opacity-40";
                }
                return (
                  <div
                    key={`${dateStr}-${time}`}
                    className={`relative border-e border-border last:border-e-0 ${
                      clickable ? "cursor-pointer hover:bg-accent/40" : ""
                    } ${isToday(day) && !slotBg ? "bg-primary/[0.03]" : ""} ${slotBg}`}
                    style={{
                      minHeight: `${rowH}px`,
                      borderBottom:
                        row.m === 0 ? "1px solid var(--border)" : "1px dashed var(--border)",
                    }}
                    onPointerDown={(e) => {
                      if (!readOnly && onSlotDragEnd && !moveMode) {
                        e.preventDefault();
                        dragMoved.current = false;
                        setDragStart({ day: dayIdx, hour: rowIdx });
                        setDragEnd({ day: dayIdx, hour: rowIdx });
                      }
                    }}
                    onPointerEnter={() => {
                      if (dragStart) {
                        dragMoved.current = true;
                        setDragEnd({ day: dayIdx, hour: rowIdx });
                      }
                    }}
                    onClick={() => {
                      if (dragMoved.current) {
                        dragMoved.current = false;
                        return;
                      }
                      // Touch: tap-to-select a range instead of dragging.
                      if (isTouch && onSlotDragEnd && !readOnly && !moveMode) {
                        tapCell(dayIdx, rowIdx);
                        return;
                      }
                      if (clickable) onSlotClick!(dateStr, time);
                    }}
                    onPointerOver={() => {
                      if (draggingEventId) {
                        dragTargetRef.current = { date: dateStr, time, open: isOpen };
                      }
                    }}
                  >
                    {!bandMode && slotAware && isOpen && (
                      <span className="pointer-events-none absolute inset-inline-start-1 top-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600">
                        Open
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Event overlays — positioned absolutely over the grid */}
        <div
          className={
            mode === "day"
              ? "pointer-events-none relative grid min-w-[280px]"
              : "pointer-events-none relative grid min-w-[800px]"
          }
          style={{
            gridTemplateColumns: `60px repeat(${weekDays.length}, 1fr)`,
            marginBlockStart: `-${(HOUR_END - HOUR_START) * 48}px`, // offset to overlay on top of grid body
          }}
        >
          {/* Spacer for hour label column */}
          <div />

          {weekDays.map((day, dayIndex) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(dateStr) ?? [];

            return (
              <div
                key={dateStr}
                className="relative"
                style={{
                  height: `${(HOUR_END - HOUR_START) * 48}px`,
                }}
              >
                {/* Current-time line (today's column only) */}
                {dayIndex === todayIdx && (
                  <div
                    className="pointer-events-none absolute inset-inline-0 z-10"
                    style={{ top: `${nowTopPx}px` }}
                    aria-hidden
                  >
                    <div style={{ height: 2, background: "#DC2626", opacity: 0.85 }} />
                    <div
                      style={{
                        position: "absolute",
                        insetInlineStart: -4,
                        top: -3,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: "#DC2626",
                      }}
                    />
                  </div>
                )}
                {/* Open availability bands (POLICY §5 range model) */}
                {(rangesByDay.get(dateStr) ?? []).map((r) => {
                  const topPx = (timeToRow(r.startTime) - 1) * 12;
                  const heightPx =
                    (timeToRow(r.endTime) - timeToRow(r.startTime)) * 12;
                  const clickable = !!onRangeClick && !readOnly;
                  return (
                    <div
                      key={`open-${r.startTime}`}
                      onClick={
                        clickable
                          ? (e) => {
                              e.stopPropagation();
                              onRangeClick!(dateStr, r.startTime, r.endTime);
                            }
                          : undefined
                      }
                      title={clickable ? (moveMode ? "Move lesson here" : "Book a lesson") : undefined}
                      className={`absolute overflow-hidden rounded-md border border-dashed border-emerald-400 text-[9px] font-semibold uppercase tracking-wide text-emerald-700 ${
                        clickable ? "pointer-events-auto cursor-pointer hover:bg-emerald-200/70" : "pointer-events-none"
                      } ${moveMode ? "animate-pulse bg-emerald-200/70" : "bg-emerald-100/70"}`}
                      style={{ top: `${topPx}px`, height: `${Math.max(heightPx, 12)}px`, insetInlineStart: 4, insetInlineEnd: 4 }}
                    >
                      <span className="absolute" style={{ insetInlineStart: 4, top: 2 }}>
                        {clickable ? (moveMode ? "Move here" : "＋ Book") : "Open"}
                      </span>
                    </div>
                  );
                })}
                {/* Opaque busy bands — another student holds this time */}
                {(busyByDay.get(dateStr) ?? []).map((b) => {
                  const topPx = (timeToRow(b.startTime) - 1) * 12;
                  const heightPx =
                    (timeToRow(b.endTime) - timeToRow(b.startTime)) * 12;
                  return (
                    <div
                      key={`busy-${b.startTime}`}
                      className="pointer-events-none absolute overflow-hidden rounded-md border border-border bg-muted/80 px-1 text-[9px] font-medium text-muted-foreground"
                      style={{ top: `${topPx}px`, height: `${Math.max(heightPx, 12)}px`, insetInlineStart: 4, insetInlineEnd: 4 }}
                      aria-label="Busy"
                    >
                      Busy
                    </div>
                  );
                })}
                {dayEvents.map((event) => {
                  const startRow = timeToRow(event.startTime);
                  const endRow = timeToRow(event.endTime);
                  const topPx = (startRow - 1) * 12; // each 15-min slot = 12px
                  const heightPx = (endRow - startRow) * 12;
                  const student = event.studentId ? userMap.get(event.studentId) : undefined;
                  const ss = eventStatusStyle(event.status);
                  const isCancelled = event.status === "cancelled";
                  // Terminal events (done/no-show/cancelled) are history — not
                  // draggable, and painted by status rather than student.
                  const isTerminal = ss !== null;
                  const color = ss
                    ? ss.border
                    : event.studentId
                      ? studentColor(event.studentId)
                      : "var(--brand-purple)";
                  const bgColor = ss
                    ? ss.bg
                    : event.studentId
                      ? studentBgColor(event.studentId)
                      : "var(--brand-purple-tint)";

                  return (
                    <div
                      key={event._id}
                      onPointerDown={(e) => {
                        if (!onEventDrop || isTerminal) return;
                        e.preventDefault();
                        e.stopPropagation();
                        setHover(null); // card must not trail a dragged block
                        dragTargetRef.current = null;
                        setDraggingEventId(event._id);
                      }}
                      title={
                        hoverEnabled
                          ? undefined // the hover card says more than a tooltip can
                          : onEventDrop
                            ? "Drag onto a green slot to reschedule"
                            : undefined
                      }
                      onMouseEnter={(e) => {
                        if (!hoverEnabled) return;
                        const r = e.currentTarget.getBoundingClientRect();
                        setHover({ event, left: r.left, right: r.right, y: r.top });
                      }}
                      onMouseLeave={() => {
                        if (hoverEnabled) setHover(null);
                      }}
                      className={`pointer-events-auto absolute overflow-hidden rounded-md border px-1.5 py-0.5 text-xs transition-opacity ${
                        ss?.faded ? "opacity-40" : "opacity-100"
                      } ${draggingEventId === event._id ? "opacity-50" : ""} ${
                        onEventDrop && !isTerminal ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                      } hover:ring-2 hover:ring-ring`}
                      style={{
                        top: `${topPx}px`,
                        height: `${Math.max(heightPx, 20)}px`,
                        insetInlineStart: 4,
                        insetInlineEnd: 4,
                        backgroundColor: bgColor,
                        borderColor: color,
                        borderInlineStartWidth: "3px",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(event);
                      }}
                    >
                      <div
                        className={`font-medium leading-tight ${
                          ss?.strike ? "line-through" : ""
                        }`}
                        style={{ color }}
                      >
                        {event.recurringBookingId && (
                          <span title="Part of a weekly schedule" aria-label="weekly">
                            ↻{" "}
                          </span>
                        )}
                        {student?.name ?? t("student")}
                      </div>
                      {ss ? (
                        <div className="text-[10px] font-semibold" style={{ color }}>
                          {ss.label}
                        </div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground">
                          {formatTime(event.startTime, timeFormat)} -{" "}
                          {formatTime(event.endTime, timeFormat)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Hover card — fixed to the viewport so the scrolling grid can't clip it */}
      {hover && !draggingEventId && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
          style={{
            width: HOVER_CARD_W,
            // flip to the block's other side when the card would run off-screen
            insetInlineStart:
              hover.right + HOVER_CARD_W + 12 > window.innerWidth
                ? Math.max(8, hover.left - HOVER_CARD_W - 8)
                : hover.right + 8,
            top: Math.min(hover.y, window.innerHeight - 180),
          }}
        >
          {renderEventHover!(hover.event)}
        </div>
      )}
    </div>
  );
}
