"use client";

// §13.10 — Student calendar: own lessons + assigned teacher's open slots.
// Click a green slot → book (uses 1 lesson credit, ≥12h notice, ≤28 days
// ahead). Click own lesson → policy-aware Cancel (2 free/30 days, ≥6h
// notice) or Move to another open slot.

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { addDays, addMonths, format } from "date-fns";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { WeeklyCalendar, type ScheduleEvent } from "@/components/calendar/WeeklyCalendar";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  calendarRange,
  useViewerTz,
  useZonedCalendar,
  useRememberedView,
  dualTime,
  TimezoneSelect,
  type DisplayEvent,
} from "@/components/calendar/calendarShared";

type CalEvent = DisplayEvent;

export default function StudentCalendarPage() {
  const [view, setView] = useRememberedView("omnic.cal.view.student");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [movingEventId, setMovingEventId] = useState<Id<"scheduleEvents"> | null>(null);
  const [bookSlot, setBookSlot] = useState<{
    date: string;
    time: string;
    orgDate: string;
    orgTime: string;
  } | null>(null);
  const [booking, setBooking] = useState(false);
  const [repeatWeekly, setRepeatWeekly] = useState(false);

  const { fromDate, toDate } = useMemo(
    () => calendarRange(view, currentDate),
    [currentDate, view]
  );

  const me = useQuery(api.users.getMe);
  const [viewerTz, setViewerTz] = useViewerTz(me?.timezone);
  const cal = useQuery(api.calendar.getStudentCalendar, { fromDate, toDate });
  const orgTz = cal?.orgTz ?? viewerTz;
  const balance = useQuery(api.points.getBalance, {});
  const preview = useQuery(
    api.calendar.actionPreview,
    selectedEvent ? { eventId: selectedEvent._id as Id<"scheduleEvents"> } : "skip"
  );

  const bookLesson = useMutation(api.calendar.bookLesson);
  const cancelEvent = useMutation(api.calendar.cancelEvent);
  const rescheduleEvent = useMutation(api.calendar.rescheduleEvent);
  const endRecurring = useMutation(api.calendar.endRecurring);

  const zoned = useZonedCalendar(cal, viewerTz);
  const events = zoned.events as CalEvent[];
  const openSlotKeys = zoned.openSlotKeys;
  const keyToOrg = zoned.keyToOrg;
  const activeEvents = useMemo(
    () => events.filter((e) => e.status === "scheduled" || e.status === "makeup"),
    [events]
  );
  const gridUsers = useMemo(
    () =>
      activeEvents
        .filter((e) => e.studentId)
        .map((e) => ({ externalId: e.studentId!, name: "My lesson" })),
    [activeEvents]
  );

  const lessonsLeft = balance?.balance ?? 0;

  // §14.6 — turn an abstract balance into a renewal deadline:
  // "4 lessons left — covers your weekly schedule until Aug 12"
  const balanceHorizon = useMemo(() => {
    const perWeek = cal?.recurring?.length ?? 0;
    if (perWeek === 0 || lessonsLeft === 0) return null;
    const weeks = Math.floor(lessonsLeft / perWeek);
    if (weeks < 1) return null;
    return format(addDays(new Date(), weeks * 7), "MMM d");
  }, [cal, lessonsLeft]);

  function navigate(step: -1 | 1) {
    setCurrentDate((d) =>
      view === "day"
        ? addDays(d, step)
        : view === "week"
          ? addDays(d, step * 7)
          : addMonths(d, step)
    );
  }

  function onSlotClick(date: string, time: string) {
    const org = keyToOrg.get(`${date}|${time}`);
    if (movingEventId) {
      if (!org) return;
      rescheduleEvent({ eventId: movingEventId, toDate: org.date, toStartTime: org.time })
        .then(() => toast.success("Lesson moved — your teacher was notified"))
        .catch((e) => toast.error((e as Error).message))
        .finally(() => setMovingEventId(null));
      return;
    }
    if (!org) return;
    setSelectedEvent(null);
    setRepeatWeekly(false);
    setBookSlot({ date, time, orgDate: org.date, orgTime: org.time });
  }

  async function doBook() {
    if (!bookSlot) return;
    setBooking(true);
    try {
      await bookLesson({
        date: bookSlot.orgDate,
        startTime: bookSlot.orgTime,
        repeatWeekly,
      });
      toast.success(
        repeatWeekly
          ? "Lesson booked — this slot repeats every week while your balance lasts"
          : "Lesson booked — 1 lesson used"
      );
      setBookSlot(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBooking(false);
    }
  }

  async function doStopWeekly() {
    const rbId = (selectedEvent as any)?.recurringBookingId;
    if (!rbId) return;
    try {
      await endRecurring({ recurringId: rbId });
      toast.success("Weekly schedule stopped — future booked lessons stay");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doCancel() {
    if (!selectedEvent) return;
    try {
      const r = await cancelEvent({ eventId: selectedEvent._id as Id<"scheduleEvents"> });
      toast.success(
        r?.charged
          ? "Lesson cancelled — the lesson was charged"
          : "Lesson cancelled — credited back to your balance"
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSelectedEvent(null);
      setConfirmingCancel(false);
    }
  }

  const viewSwitcher = (
    <div style={{ display: "flex", gap: 8 }}>
      {(["day", "week", "month"] as const).map((v) => (
        <button
          key={v}
          className="chip"
          onClick={() => setView(v)}
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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <h1 className="h1" style={{ margin: 0 }}>Calendar</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {cal?.teacherName
              ? `Your teacher: ${cal.teacherName} · click a green slot to book a lesson`
              : "No teacher assigned yet — ask your academy"}
          </div>
        </div>
        <span className="pill pill-tenant" style={{ fontSize: 14, fontWeight: 700 }}>
          {lessonsLeft} lesson{lessonsLeft === 1 ? "" : "s"} left
          {balanceHorizon ? ` · weekly schedule covered to ${balanceHorizon}` : ""}
        </span>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <LegendSwatch color="rgba(16,185,129,0.25)" label="Available — click to book" />
        <LegendSwatch color="var(--brand-purple-tint, rgba(103,22,164,0.15))" label="My lesson" />
        <span className="body-sm" style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          My timezone <TimezoneSelect value={viewerTz} onChange={setViewerTz} />
        </span>
        {movingEventId && (
          <span className="pill" style={{ background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>
            Pick a green slot for your lesson —{" "}
            <button style={{ textDecoration: "underline", border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0 }} onClick={() => setMovingEventId(null)}>
              cancel move
            </button>
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="card" style={{ padding: 16, marginBottom: 24 }}>
        {view === "month" ? (
          <MonthCalendar
            events={activeEvents}
            users={gridUsers}
            currentDate={currentDate}
            onPrev={() => navigate(-1)}
            onNext={() => navigate(1)}
            onToday={() => setCurrentDate(new Date())}
            onEventClick={(e) => setSelectedEvent(e as CalEvent)}
            onDayClick={(day) => {
              setCurrentDate(day);
              setView("day");
            }}
            headerExtra={viewSwitcher}
          />
        ) : (
          <WeeklyCalendar
            events={activeEvents}
            users={gridUsers}
            currentDate={currentDate}
            mode={view}
            onPrevWeek={() => navigate(-1)}
            onNextWeek={() => navigate(1)}
            onToday={() => setCurrentDate(new Date())}
            onEventClick={(e) => {
              if (!movingEventId) {
                setBookSlot(null);
                setSelectedEvent(e as CalEvent);
              }
            }}
            onJumpToDate={(d) => setCurrentDate(d)}
            onSlotClick={onSlotClick}
            onEventDrop={(ev, date, time) => {
              const org = keyToOrg.get(`${date}|${time}`);
              if (!org) return;
              rescheduleEvent({
                eventId: ev._id as Id<"scheduleEvents">,
                toDate: org.date,
                toStartTime: org.time,
              })
                .then(() => toast.success("Lesson moved — your teacher was notified"))
                .catch((e) => toast.error((e as Error).message));
            }}
            openSlotKeys={openSlotKeys}
            moveMode={!!movingEventId}
            headerExtra={viewSwitcher}
          />
        )}
      </div>

      {/* Book dialog */}
      <Dialog open={!!bookSlot} onOpenChange={(o) => !o && setBookSlot(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Book a lesson — {bookSlot?.date} at {bookSlot?.time}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-zinc-500">
              With {cal?.teacherName ?? "your teacher"} · uses 1 lesson from your
              balance ({lessonsLeft} left)
            </p>
            {bookSlot && (
              <p className="text-sm text-zinc-500">
                {dualTime(bookSlot.orgDate, bookSlot.orgTime, orgTz, viewerTz)}
              </p>
            )}
            {lessonsLeft < 1 && (
              <p className="text-sm text-red-600">
                You have no lessons on your balance. Contact your academy to top up.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={repeatWeekly}
                onChange={(e) => setRepeatWeekly(e.target.checked)}
              />
              Repeat every{" "}
              {bookSlot ? format(new Date(`${bookSlot.date}T12:00:00`), "EEEE") : "week"} at{" "}
              {bookSlot?.time} — books itself weekly while your balance lasts
            </label>
            <Button className="w-full" onClick={doBook} disabled={booking || lessonsLeft < 1}>
              {booking ? "Booking…" : repeatWeekly ? "Book weekly" : "Book this lesson"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lesson dialog */}
      <Dialog
        open={!!selectedEvent}
        onOpenChange={(o) => {
          if (!o) {
            setSelectedEvent(null);
            setConfirmingCancel(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedEvent?.title}</DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-3">
              <p className="text-sm">
                {selectedEvent.date}
                {cal?.teacherName ? ` · with ${cal.teacherName}` : ""}
              </p>
              <p className="text-sm text-zinc-500">
                {dualTime(
                  selectedEvent.orgDate,
                  selectedEvent.orgStartTime,
                  orgTz,
                  viewerTz
                )}
              </p>
              {selectedEvent.googleMeetLink && (
                <a
                  href={selectedEvent.googleMeetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm underline"
                >
                  Join on Google Meet
                </a>
              )}
              {(selectedEvent as any).recurringBookingId && (
                <p className="text-xs font-medium text-purple-700">
                  Part of your weekly schedule
                </p>
              )}
              {!confirmingCancel ? (
                <div className="flex flex-col gap-2">
                  <Button
                    disabled={!preview?.reschedule.allowed}
                    onClick={() => {
                      setMovingEventId(selectedEvent._id as Id<"scheduleEvents">);
                      setSelectedEvent(null);
                      if (view === "month") setView("week");
                    }}
                  >
                    Move lesson
                  </Button>
                  {preview && !preview.reschedule.allowed && (
                    <p className="text-xs text-zinc-500">{preview.reschedule.reason}</p>
                  )}
                  <Button
                    variant="destructive"
                    disabled={!preview?.cancel.allowed}
                    onClick={() => setConfirmingCancel(true)}
                  >
                    Cancel lesson
                  </Button>
                  <p className="text-xs text-zinc-500">{preview?.cancel.reason}</p>
                  {(selectedEvent as any).recurringBookingId && (
                    <Button variant="outline" onClick={doStopWeekly}>
                      Stop weekly schedule
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium">
                    Cancel this lesson? {preview?.cancel.reason}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="destructive" onClick={doCancel}>
                      Yes, cancel it
                    </Button>
                    <Button variant="outline" onClick={() => setConfirmingCancel(false)}>
                      Keep it
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--omnic-gray-600)" }}>
      <span style={{ width: 14, height: 14, borderRadius: 4, background: color, border: "1px solid var(--omnic-gray-200)", display: "inline-block" }} />
      {label}
    </span>
  );
}
