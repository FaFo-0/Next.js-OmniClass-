"use client";

import { format, parseISO } from "date-fns";
import { useLocale } from "next-intl";
import { enUS, ru as ruLocale, arSA, kk as kkLocale } from "date-fns/locale";
import { formatTime, type TimeFormat } from "@/lib/timeFormat";
import { eventStatusStyle, type ScheduleEvent } from "./WeeklyCalendar";

export type AgendaEvent = ScheduleEvent & {
  studentName?: string | null;
  teacherName?: string | null;
};

function dateLocale(locale: string) {
  return locale === "ar" ? arSA : locale === "ru" ? ruLocale : locale === "kk" ? kkLocale : enUS;
}

/**
 * Read-only, date-grouped staff agenda. Unlike the shared time grid, every
 * event gets its own row, so simultaneous lessons for different teachers stay
 * individually readable and selectable.
 */
export function CalendarAgenda({
  events,
  onEventClick,
  timeFormat = "24h",
}: {
  events: AgendaEvent[];
  onEventClick?: (event: AgendaEvent) => void;
  timeFormat?: TimeFormat;
}) {
  const locale = useLocale();
  const grouped = new Map<string, AgendaEvent[]>();
  for (const event of events) {
    const list = grouped.get(event.date) ?? [];
    list.push(event);
    grouped.set(event.date, list);
  }
  const dates = [...grouped.keys()].sort();

  return (
    <div className="flex flex-col gap-4" data-testid="calendar-agenda" aria-label="Calendar agenda">
      {dates.length === 0 ? (
        <p className="body" style={{ padding: 24, textAlign: "center" }}>No lessons in this period.</p>
      ) : (
        dates.map((date) => {
          const dayEvents = (grouped.get(date) ?? []).slice().sort((a, b) =>
            `${a.startTime}|${a.teacherName ?? ""}|${a.studentName ?? ""}`.localeCompare(
              `${b.startTime}|${b.teacherName ?? ""}|${b.studentName ?? ""}`
            )
          );
          return (
            <section key={date} aria-labelledby={`agenda-${date}`}>
              <h2 id={`agenda-${date}`} className="h3" style={{ marginBottom: 8 }}>
                {format(parseISO(date), "EEEE, MMM d, yyyy", { locale: dateLocale(locale) })}
              </h2>
              <div className="flex flex-col gap-2">
                {dayEvents.map((event) => {
                  const status = eventStatusStyle(event.status);
                  const content = (
                    <>
                      <span className="shrink-0 tabular-nums font-semibold">
                        {formatTime(event.startTime, timeFormat)}–{formatTime(event.endTime, timeFormat)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate">{event.studentName ?? "No student"}</strong>
                        <span className="block truncate text-sm text-muted-foreground">
                          {event.teacherName ?? "Teacher"} · {event.title}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold" style={{ color: status?.border }}>
                        {status?.label ?? (event.status === "scheduled" || event.status === "makeup" ? "Scheduled" : event.status)}
                      </span>
                    </>
                  );
                  return onEventClick ? (
                    <button
                      key={event._id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-start transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => onEventClick(event)}
                      aria-label={`${event.studentName ?? "No student"}, ${event.teacherName ?? "Teacher"}, ${event.startTime}`}
                    >
                      {content}
                    </button>
                  ) : (
                    <div key={event._id} className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                      {content}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
