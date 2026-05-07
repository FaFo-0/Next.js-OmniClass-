"use client";

import { useMemo } from "react";
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
interface ScheduleEvent {
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

interface CalendarUser {
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
}

const HOUR_START = 8;
const HOUR_END = 20;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

function studentColor(studentId: string): string {
  let hash = 0;
  for (let i = 0; i < studentId.length; i++) {
    hash = studentId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

function studentBgColor(studentId: string): string {
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
}: WeeklyCalendarProps) {
  const t = useTranslations("components.calendar");
  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 1 }),
    [currentDate]
  );

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const weekEnd = weekDays[6];

  const weekRangeLabel = useMemo(() => {
    const startStr = format(weekStart, "MMM d");
    const endStr =
      weekStart.getMonth() === weekEnd.getMonth()
        ? format(weekEnd, "d, yyyy")
        : format(weekEnd, "MMM d, yyyy");
    return `${startStr} - ${endStr}`;
  }, [weekStart, weekEnd]);

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
        </div>
        <h2 className="text-lg font-semibold">{weekRangeLabel}</h2>
      </div>

      {/* Calendar Grid */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <div
          className="grid min-w-[800px]"
          style={{
            gridTemplateColumns: "60px repeat(7, 1fr)",
          }}
        >
          {/* Corner cell */}
          <div className="border-b border-e border-border bg-muted/50 p-2" />

          {/* Day headers */}
          {weekDays.map((day) => {
            const today = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className={`border-b border-e border-border p-2 text-center text-sm font-medium last:border-e-0 ${
                  today
                    ? "bg-primary/10 font-bold text-primary"
                    : "bg-muted/50 text-muted-foreground"
                }`}
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
              {weekDays.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                return (
                  <div
                    key={`${dateStr}-${hour}`}
                    className={`relative border-b border-e border-border last:border-e-0 ${
                      !readOnly
                        ? "cursor-pointer hover:bg-accent/30"
                        : ""
                    } ${isToday(day) ? "bg-primary/[0.03]" : ""}`}
                    style={{ minHeight: "48px" }}
                    onClick={() => {
                      if (!readOnly && onSlotClick) {
                        onSlotClick(
                          dateStr,
                          `${String(hour).padStart(2, "0")}:00`
                        );
                      }
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Event overlays — positioned absolutely over the grid */}
        <div
          className="pointer-events-none relative grid min-w-[800px]"
          style={{
            gridTemplateColumns: "60px repeat(7, 1fr)",
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
