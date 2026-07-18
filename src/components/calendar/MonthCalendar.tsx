"use client";

import { useMemo, type ReactNode } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  addDays,
  format,
  isToday,
  isSameMonth,
} from "date-fns";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  studentColor,
  studentBgColor,
  type ScheduleEvent,
  type CalendarUser,
} from "./WeeklyCalendar";

interface MonthCalendarProps {
  events: ScheduleEvent[];
  users: CalendarUser[];
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onEventClick?: (event: ScheduleEvent) => void;
  onDayClick?: (date: Date) => void;
  headerExtra?: ReactNode;
}

const MAX_CHIPS = 3;

export function MonthCalendar({
  events,
  users,
  currentDate,
  onPrev,
  onNext,
  onToday,
  onEventClick,
  onDayClick,
  headerExtra,
}: MonthCalendarProps) {
  const t = useTranslations("components.calendar");

  const gridDays = useMemo(() => {
    const first = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const last = endOfMonth(currentDate);
    const days: Date[] = [];
    let d = first;
    while (d <= last || days.length % 7 !== 0) {
      days.push(d);
      d = addDays(d, 1);
    }
    return days;
  }, [currentDate]);

  const userMap = useMemo(
    () => new Map(users.map((u) => [u.externalId, u])),
    [users]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const e of events) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return map;
  }, [events]);

  const weekdayLabels = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => format(addDays(monday, i), "EEE"));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={onPrev}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onToday}>
            {t("today")}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={onNext}>
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="ms-2 whitespace-nowrap text-base font-semibold sm:text-lg">
            {format(currentDate, "MMMM yyyy")}
          </h2>
        </div>
        {headerExtra}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="grid min-w-[700px] grid-cols-7">
          {weekdayLabels.map((label) => (
            <div
              key={label}
              className="border-b border-e border-border bg-muted/50 p-2 text-center text-sm font-medium text-muted-foreground last:border-e-0"
            >
              {label}
            </div>
          ))}

          {gridDays.map((day) => {
            const dateStr = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay.get(dateStr) ?? [];
            const today = isToday(day);
            const inMonth = isSameMonth(day, currentDate);
            const overflow = dayEvents.length - MAX_CHIPS;

            return (
              <div
                key={dateStr}
                className={`min-h-[104px] border-b border-e border-border p-1.5 align-top last:border-e-0 ${
                  inMonth ? "" : "bg-muted/30"
                } ${onDayClick ? "cursor-pointer hover:bg-accent/30" : ""}`}
                onClick={() => onDayClick?.(day)}
              >
                <div
                  className={`mb-1 text-xs font-medium ${
                    today
                      ? "inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {format(day, "d")}
                </div>
                <div className="flex flex-col gap-0.5">
                  {dayEvents.slice(0, MAX_CHIPS).map((event) => {
                    const student = event.studentId
                      ? userMap.get(event.studentId)
                      : undefined;
                    const cancelled = event.status === "cancelled";
                    const color = event.studentId
                      ? studentColor(event.studentId)
                      : "var(--brand-purple)";
                    const bg = event.studentId
                      ? studentBgColor(event.studentId)
                      : "var(--brand-purple-tint)";
                    return (
                      <button
                        key={event._id}
                        type="button"
                        className={`truncate rounded border-0 px-1 py-0.5 text-start text-[11px] leading-tight ${
                          cancelled ? "line-through opacity-40" : ""
                        }`}
                        style={{
                          backgroundColor: bg,
                          color,
                          borderInlineStart: `3px solid ${color}`,
                          cursor: "pointer",
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick?.(event);
                        }}
                      >
                        {event.startTime} {student?.name ?? t("student")}
                      </button>
                    );
                  })}
                  {overflow > 0 && (
                    <div className="px-1 text-[11px] text-muted-foreground">
                      +{overflow}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
