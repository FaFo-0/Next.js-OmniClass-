"use client";

import { useMemo, type ReactNode } from "react";
import { startOfMonth, endOfMonth, startOfWeek, addDays, format, isToday, isSameMonth } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import { enUS, ru as ruLocale, arSA, kk as kkLocale } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatTime, type TimeFormat } from "@/lib/timeFormat";
import type { BookingStart } from "@/lib/calendarBookingPlan";
import { studentColor, studentBgColor, eventStatusStyle, type ScheduleEvent, type CalendarUser } from "./WeeklyCalendar";

interface MonthCalendarProps {
  events: ScheduleEvent[];
  /** Explicit, unconfirmed starts. These are never rendered as booked events. */
  planned?: BookingStart[];
  /** Dates with a preview conflict or other repair-needed state. */
  attentionDates?: string[];
  /** The selected date remains visible in the month; it does not force a view switch. */
  selectedDate?: string;
  users: CalendarUser[];
  currentDate: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onEventClick?: (event: ScheduleEvent) => void;
  onDayClick?: (date: Date) => void;
  headerExtra?: ReactNode;
  timeFormat?: TimeFormat;
}

const MAX_CHIPS = 2;

export function MonthCalendar({
  events,
  planned = [],
  attentionDates = [],
  selectedDate,
  users,
  currentDate,
  onPrev,
  onNext,
  onToday,
  onEventClick,
  onDayClick,
  headerExtra,
  timeFormat = "24h",
}: MonthCalendarProps) {
  const t = useTranslations("components.calendar");
  const gridDays = useMemo(() => {
    const first = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
    const last = endOfMonth(currentDate);
    const days: Date[] = [];
    let day = first;
    while (day <= last || days.length % 7 !== 0) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentDate]);

  const userMap = useMemo(() => new Map(users.map((user) => [user.externalId, user])), [users]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const event of events) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return map;
  }, [events]);
  const plannedByDay = useMemo(() => {
    const map = new Map<string, BookingStart[]>();
    for (const booking of planned) {
      const list = map.get(booking.date) ?? [];
      list.push(booking);
      map.set(booking.date, list);
    }
    return map;
  }, [planned]);
  const attentionSet = useMemo(() => new Set(attentionDates), [attentionDates]);

  const locale = useLocale();
  const dfLocale = locale === "ar" ? arSA : locale === "ru" ? ruLocale : locale === "kk" ? kkLocale : enUS;
  const weekdayLabels = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, index) => format(addDays(monday, index), "EEE", { locale: dfLocale }));
  }, [dfLocale]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon-sm" aria-label={t("previousMonth")} onClick={onPrev}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="sm" onClick={onToday}>{t("today")}</Button>
          <Button variant="outline" size="icon-sm" aria-label={t("nextMonth")} onClick={onNext}><ChevronRight className="size-4" /></Button>
          <h2 className="ms-2 whitespace-nowrap text-base font-semibold sm:text-lg">{format(currentDate, "MMMM yyyy", { locale: dfLocale })}</h2>
        </div>
        {headerExtra}
      </div>

      <div className="student-month-grid rounded-lg border border-border" role="grid" aria-label={format(currentDate, "MMMM yyyy", { locale: dfLocale })}>
        {weekdayLabels.map((label) => <div key={label} role="columnheader" className="student-month-weekday">{label}</div>)}
        {gridDays.map((day) => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDay.get(dateStr) ?? [];
          const dayPlanned = plannedByDay.get(dateStr) ?? [];
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);
          const selected = dateStr === selectedDate;
          const attention = attentionSet.has(dateStr);
          const overflow = Math.max(0, dayEvents.length - MAX_CHIPS);
          const labelParts = [
            format(day, "EEEE, MMMM d", { locale: dfLocale }),
            dayEvents.length ? `${dayEvents.length} ${t("bookedStatusShort")}` : "",
            dayPlanned.length ? `${dayPlanned.length} ${t("selectedStatusShort")}` : "",
            attention ? t("needsAttentionStatus") : "",
          ].filter(Boolean);

          return (
            <div
              key={dateStr}
              role="gridcell"
              aria-label={labelParts.join(" · ")}
              aria-selected={selected}
              className={`student-month-day ${inMonth ? "" : "is-outside"} ${selected ? "is-selected" : ""} ${today ? "is-today" : ""}`}
            >
              <button
                type="button"
                className="student-month-day-select"
                aria-label={labelParts.join(" · ")}
                aria-pressed={selected}
                onClick={() => onDayClick?.(day)}
              >
                <div className="student-month-day-number">
                  <span>{format(day, "d")}</span>
                  {today && <span className="student-month-today-label">{t("todayShort")}</span>}
                </div>
                <div className="student-month-markers" aria-hidden={false}>
                  {dayEvents.length > 0 && <span className="student-month-marker is-booked">{t("bookedStatusShort")} {dayEvents.length}</span>}
                  {dayPlanned.length > 0 && <span className="student-month-marker is-selected">{t("selectedStatusShort")} {dayPlanned.length}</span>}
                  {attention && <span className="student-month-marker is-attention">! {t("needsAttentionStatus")}</span>}
                </div>
              </button>
              <div className="student-month-events">
                {dayEvents.slice(0, MAX_CHIPS).map((event) => {
                  const student = event.studentId ? userMap.get(event.studentId) : undefined;
                  const status = eventStatusStyle(event.status);
                  const color = status?.border ?? (event.studentId ? studentColor(event.studentId) : "var(--brand-purple)");
                  const background = status?.bg ?? (event.studentId ? studentBgColor(event.studentId) : "var(--brand-purple-tint)");
                  return (
                    <button
                      key={event._id}
                      type="button"
                      className={`student-month-event ${status?.strike ? "line-through" : ""} ${status?.faded ? "opacity-50" : ""}`}
                      style={{ backgroundColor: background, color, borderInlineStartColor: color }}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        onEventClick?.(event);
                      }}
                    >
                      <span>{status?.label ?? formatTime(event.startTime, timeFormat)}</span>
                      <span className="truncate">{student?.name ?? event.title ?? t("lesson")}</span>
                    </button>
                  );
                })}
                {overflow > 0 && <span className="student-month-more">+{overflow} {t("moreLessons")}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
