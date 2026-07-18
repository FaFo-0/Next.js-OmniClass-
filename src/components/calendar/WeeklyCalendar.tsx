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
  /** Reschedule target-picking mode: only open slots clickable, highlighted. */
  moveMode?: boolean;
  /** Called after a drag-selection of 2+ empty cells (rectangular). */
  onSlotDragEnd?: (slots: { date: string; time: string }[]) => void;
  /** Jump-to-date: called with a date picked from the header label. */
  onJumpToDate?: (date: Date) => void;
}

const HOUR_START = 0;
const HOUR_END = 24;
const SCROLL_TO_HOUR = 7;
const HOUR_PX = 48; // fixed grid height per hour (overlay math depends on it)

export function studentColor(studentId: string): string {
  let hash = 0;
  for (let i = 0; i < studentId.length; i++) {
    hash = studentId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 65%, 55%)`;
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
  moveMode = false,
  onSlotDragEnd,
  onJumpToDate,
}: WeeklyCalendarProps) {
  const openSet = useMemo(() => new Set(openSlotKeys ?? []), [openSlotKeys]);
  const slotAware = openSlotKeys !== undefined;

  // C-4: half-hour timezones convert whole-hour academy slots to "HH:30".
  // If any slot/event lands off the hour, render 30-min rows so cells match.
  const rowMinutes = useMemo(() => {
    const marks = new Set<number>();
    for (const k of openSlotKeys ?? []) {
      const t = k.split("|")[1];
      if (t) marks.add(Number(t.split(":")[1]));
    }
    for (const e of events) marks.add(Number(e.startTime.split(":")[1]));
    return [...marks].some((m) => m % 60 !== 0 && m % 30 === 0) || [...marks].some((m) => m === 30)
      ? 30
      : 60;
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

  // Ticking "now" for the current-time line (updates each minute)
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

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

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
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
              className="relative ms-2 cursor-pointer text-lg font-semibold hover:underline"
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
            <h2 className="ms-2 text-lg font-semibold">{weekRangeLabel}</h2>
          )}
        </div>
        {headerExtra}
      </div>

      {/* Calendar Grid — 24h, scrollable, starts at the morning */}
      <div
        ref={scrollRef}
        className="overflow-x-auto overflow-y-auto rounded-lg border border-border select-none"
        style={{ maxHeight: 560 }}
      >
        <div
          className={mode === "day" ? "grid min-w-[400px]" : "grid min-w-[800px]"}
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
                  <span className="absolute -top-2 end-2">
                    {String(row.h).padStart(2, "0")}:00
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
                if (dragging) {
                  slotBg = "bg-sky-200/70";
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
                      if (clickable) onSlotClick!(dateStr, time);
                    }}
                  >
                    {slotAware && isOpen && (
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
              ? "pointer-events-none relative grid min-w-[400px]"
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
                {dayEvents.map((event) => {
                  const startRow = timeToRow(event.startTime);
                  const endRow = timeToRow(event.endTime);
                  const topPx = (startRow - 1) * 12; // each 15-min slot = 12px
                  const heightPx = (endRow - startRow) * 12;
                  const student = event.studentId ? userMap.get(event.studentId) : undefined;
                  const isCancelled = event.status === "cancelled";
                  const color = event.studentId ? studentColor(event.studentId) : "var(--brand-purple)";
                  const bgColor = event.studentId ? studentBgColor(event.studentId) : "var(--brand-purple-tint)";

                  return (
                    <div
                      key={event._id}
                      className={`pointer-events-auto absolute inset-inline-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-xs transition-opacity ${
                        isCancelled ? "opacity-40" : "opacity-100"
                      } cursor-pointer hover:ring-2 hover:ring-ring`}
                      style={{
                        top: `${topPx}px`,
                        height: `${Math.max(heightPx, 20)}px`,
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
                          isCancelled ? "line-through" : ""
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
                      <div className="text-[10px] text-muted-foreground">
                        {event.startTime} - {event.endTime}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
