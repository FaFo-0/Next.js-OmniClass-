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
}

const HOUR_START = 0;
const HOUR_END = 24;
const SCROLL_TO_HOUR = 7;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

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
}: WeeklyCalendarProps) {
  const openSet = useMemo(() => new Set(openSlotKeys ?? []), [openSlotKeys]);
  const slotAware = openSlotKeys !== undefined;

  // Scrollable 24h grid — start scrolled to the morning
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = SCROLL_TO_HOUR * 48;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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

  useEffect(() => {
    if (!dragStart) return;
    const up = () => {
      if (dragEnd && dragKeys.size > 1 && onSlotDragEnd) {
        const slots: { date: string; time: string }[] = [];
        for (const key of dragKeys) {
          const [dd, hh] = key.split("-").map(Number);
          slots.push({
            date: format(weekDays[dd], "yyyy-MM-dd"),
            time: `${String(HOURS[hh]).padStart(2, "0")}:00`,
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
  }, [dragStart, dragEnd, dragKeys, onSlotDragEnd, weekDays]);

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
          <h2 className="ms-2 text-lg font-semibold">{weekRangeLabel}</h2>
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
          {weekDays.map((day) => {
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className={`sticky top-0 z-20 border-b border-e border-border p-2 text-center text-sm font-medium last:border-e-0 ${
                  today ? "font-bold text-primary" : "text-muted-foreground"
                }`}
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

          {/* Hour rows */}
          {HOURS.map((hour) => (
            <div
              key={`hour-${hour}`}
              className="contents"
              role="presentation"
            >
              {/* Hour label */}
              <div className="relative border-b border-e border-border px-2 py-3 text-end text-xs text-muted-foreground">
                <span className="absolute -top-2 end-2">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>

              {/* Day cells for this hour */}
              {weekDays.map((day, dayIdx) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const time = `${String(hour).padStart(2, "0")}:00`;
                const hourIdx = hour - HOUR_START;
                const isOpen = openSet.has(`${dateStr}|${time}`);
                const clickable =
                  !readOnly && !!onSlotClick && (!moveMode || isOpen);
                const dragging = dragKeys.has(`${dayIdx}-${hourIdx}`);
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
                    key={`${dateStr}-${hour}`}
                    className={`relative border-b border-e border-border last:border-e-0 ${
                      clickable ? "cursor-pointer hover:bg-accent/40" : ""
                    } ${isToday(day) && !slotBg ? "bg-primary/[0.03]" : ""} ${slotBg}`}
                    style={{ minHeight: "48px" }}
                    onPointerDown={(e) => {
                      if (!readOnly && onSlotDragEnd && !moveMode) {
                        e.preventDefault();
                        dragMoved.current = false;
                        setDragStart({ day: dayIdx, hour: hourIdx });
                        setDragEnd({ day: dayIdx, hour: hourIdx });
                      }
                    }}
                    onPointerEnter={() => {
                      if (dragStart) {
                        dragMoved.current = true;
                        setDragEnd({ day: dayIdx, hour: hourIdx });
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
