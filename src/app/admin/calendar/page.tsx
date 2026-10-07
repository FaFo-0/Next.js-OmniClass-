"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@convex";
import { userHasPermission } from "../../../../convex/lib/permissions";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { StaffCalendar } from "@/components/calendar/StaffCalendar";
import { CalendarAgenda } from "@/components/calendar/CalendarAgenda";
import {
  calendarRange,
  calendarToday,
  useCalendarWeekStart,
  CalendarWeekStartSelect,
  useViewerTz,
  useZonedCalendar,
  CalendarSkeleton,
} from "@/components/calendar/calendarShared";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { errText } from "@/lib/convexError";
export default function AdminCalendarPage() {
  const params = useSearchParams();
  const users = useQuery(api.users.listAllUsers) ?? [];
  const me = useQuery(api.users.getMe);
  const [choice, setChoice] = useState<string | null>(null);
  const linked = useQuery(
    api.calendar.getAdminEventLink,
    params.get("event") ? { eventId: params.get("event")! } : "skip",
  );
  const selected =
    choice ?? linked?.teacherId ?? params.get("teacher") ?? "all";
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(
    undefined,
  );
  const teachers = users.filter((user) => user.role === "teacher");
  const [selectedDate, setDate] = useState<Date | null>(null);
  const [viewerTz] = useViewerTz(me?.timezone);
  const date = selectedDate ?? calendarToday(viewerTz);
  const [weekStartPreference, setWeekStartPreference, weekStartsOn] = useCalendarWeekStart(`agenda:${me?.externalId ?? "loading"}`, viewerTz);
  const weekStart = startOfWeek(date, { weekStartsOn });
  const cal = useQuery(
    api.calendar.getAllTeachersCalendar,
    selected === "all" ? calendarRange("week", date, weekStartsOn) : "skip",
  );
  const { events } = useZonedCalendar(cal, viewerTz);
  const attention = useQuery(api.calendar.needsAttention, {});
  const pending = useQuery(
    api.schedule.listPendingReschedules,
    me && userHasPermission(me, "schedule.manage") ? {} : "skip",
  );
  const unaccounted = useQuery(
    api.schedule.listPendingUnaccounted,
    me && userHasPermission(me, "schedule.manage") ? {} : "skip",
  );
  const approve = useMutation(api.calendar.approveTimeOff);
  const selection = (
    <select
      aria-label="Teacher calendar"
      className="rounded-md border bg-background p-2 max-w-full"
      value={selected}
      onChange={(event) => setChoice(event.target.value)}
    >
      <option value="all">All teachers</option>
      {teachers.map((teacher) => (
        <option key={teacher.externalId} value={teacher.externalId}>
          {teacher.name}
        </option>
      ))}
    </select>
  );
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Calendar</h1>
        {selection}
      </div>
      {!!((pending?.length ?? 0) + (unaccounted?.length ?? 0)) && (
        <Link
          href="/admin/scheduling/requests"
          className="block text-sm underline"
        >
          {(pending?.length ?? 0) + (unaccounted?.length ?? 0)} scheduling
          requests need attention
        </Link>
      )}
      {!!attention?.unpaid.length && (
        <Link href="/admin/attention" className="block text-sm underline">
          {attention.unpaid.length} unpaid lessons need follow-up
        </Link>
      )}
      {!!attention?.pendingTimeOff.length && (
        <details className="rounded-xl border bg-background p-3">
          <summary className="cursor-pointer text-sm">
            {attention.pendingTimeOff.length} time-off notices to acknowledge
          </summary>
          {attention.pendingTimeOff.map((group) => (
            <div
              key={group.groupId}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span>
                {group.teacherName} · {group.fromDate}–{group.toDate}
              </span>
              <Button
                disabled={!me || !userHasPermission(me, "scheduling.edit")}
                size="sm"
                variant="outline"
                onClick={() =>
                  void approve({ groupId: group.groupId })
                    .then(() => toast.success("Acknowledged"))
                    .catch((error) => toast.error(errText(error)))
                }
              >
                Acknowledge
              </Button>
            </div>
          ))}
        </details>
      )}
      {selected !== "all" ? (
        <StaffCalendar
          key={`${selected}:${selectedEventId ?? params.get("event") ?? ""}`}
          initialDate={
            linked?.date
              ? parseISO(linked.date)
              : params.get("date")
                ? parseISO(params.get("date")!)
                : selectedDate ?? undefined
          }
          initialEventId={selectedEventId ?? params.get("event") ?? undefined}
          teacherId={selected}
          admin
          header={
            <h2 className="h2">
              {teachers.find((t) => t.externalId === selected)?.name ??
                "Teacher"}
            </h2>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setDate(addDays(date, -7))}
              aria-label="Previous week"
            >
              ‹
            </Button>
            <Button variant="outline" onClick={() => setDate(null)}>
              Today
            </Button>
            <Button
              variant="outline"
              onClick={() => setDate(addDays(date, 7))}
              aria-label="Next week"
            >
              ›
            </Button>
            <label className="text-sm">
              Week of{" "}
              <input
                aria-label="Go to date"
                className="rounded-md border bg-background p-2"
                type="date"
                value={format(weekStart, "yyyy-MM-dd")}
                onChange={(event) =>
                  event.target.value && setDate(parseISO(event.target.value))
                }
              />
            </label>
            <CalendarWeekStartSelect value={weekStartPreference} onChange={setWeekStartPreference} />
            <span className="text-sm text-muted-foreground">{viewerTz}</span>
          </div>
          {cal ? (
            <CalendarAgenda
              events={events}
              fromDate={format(weekStart, "yyyy-MM-dd")}
              toDate={format(addDays(weekStart, 6), "yyyy-MM-dd")}
              timeFormat={me?.timeFormat ?? "24h"}
              onEventClick={(event) => {
                if (event.teacherId) {
                  setChoice(event.teacherId);
                  setDate(parseISO(event.date));
                  setSelectedEventId(event._id);
                }
              }}
            />
          ) : (
            <CalendarSkeleton />
          )}
        </>
      )}
    </div>
  );
}
