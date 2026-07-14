"use client";

// §13.10 — Unified teacher calendar.
// One grid: Open slots (green), Busy (default), Lessons (colored blocks).
// Click empty cell → open/block, this date or every week.
// Click lesson → policy-aware Move / Cancel with consequence labels.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { addDays, addMonths, format, startOfWeek, startOfMonth, endOfMonth } from "date-fns";
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

type CalendarView = "day" | "week" | "month";

type CalEvent = ScheduleEvent & {
  studentName?: string | null;
  googleMeetLink?: string | null;
};

export default function TeacherCalendarPage() {
  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [movingEventId, setMovingEventId] = useState<Id<"scheduleEvents"> | null>(null);
  const [pendingSlot, setPendingSlot] = useState<{
    date: string;
    time: string;
    isOpen: boolean;
  } | null>(null);

  // Visible range per view
  const { fromDate, toDate } = useMemo(() => {
    if (view === "day") {
      const d = format(currentDate, "yyyy-MM-dd");
      return { fromDate: d, toDate: d };
    }
    if (view === "week") {
      const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
      return {
        fromDate: format(ws, "yyyy-MM-dd"),
        toDate: format(addDays(ws, 6), "yyyy-MM-dd"),
      };
    }
    return {
      fromDate: format(startOfMonth(currentDate), "yyyy-MM-dd"),
      toDate: format(endOfMonth(currentDate), "yyyy-MM-dd"),
    };
  }, [currentDate, view]);

  const cal = useQuery(api.calendar.getTeacherCalendar, { fromDate, toDate });
  const preview = useQuery(
    api.calendar.actionPreview,
    selectedEvent ? { eventId: selectedEvent._id as Id<"scheduleEvents"> } : "skip"
  );

  const setSlotState = useMutation(api.calendar.setSlotState);
  const setWeeklySlot = useMutation(api.calendar.setWeeklySlot);
  const cancelEvent = useMutation(api.calendar.cancelEvent);
  const rescheduleEvent = useMutation(api.calendar.rescheduleEvent);

  const events = useMemo(() => (cal?.events ?? []) as CalEvent[], [cal]);
  const activeEvents = useMemo(
    () => events.filter((e) => e.status === "scheduled" || e.status === "makeup"),
    [events]
  );
  const openSlotKeys = useMemo(
    () => (cal?.openSlots ?? []).map((s) => `${s.date}|${s.startTime}`),
    [cal]
  );
  const gridUsers = useMemo(
    () =>
      events
        .filter((e) => e.studentId && e.studentName)
        .map((e) => ({ externalId: e.studentId!, name: e.studentName! })),
    [events]
  );

  // Sessions page routes here with ?event={id} — open the lesson dialog.
  const [pendingEventId, setPendingEventId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("event");
  });
  useEffect(() => {
    if (!pendingEventId || events.length === 0) return;
    const match = events.find((e) => e._id === pendingEventId);
    if (match) {
      setSelectedEvent(match);
      setCurrentDate(new Date(`${match.date}T00:00:00`));
    }
    setPendingEventId(null);
  }, [pendingEventId, events]);

  function navigate(step: -1 | 1) {
    setCurrentDate((d) =>
      view === "day"
        ? addDays(d, step)
        : view === "week"
          ? addDays(d, step * 7)
          : addMonths(d, step)
    );
  }

  // ── Interactions ────────────────────────────────────────────

  function onSlotClick(date: string, time: string) {
    if (movingEventId) {
      // Move-mode: this cell is an open slot (grid only allows those)
      rescheduleEvent({ eventId: movingEventId, toDate: date, toStartTime: time })
        .then((r) => {
          toast.success(
            r?.trackedLate
              ? "Lesson moved — under 12h notice, make sure the student agreed"
              : "Lesson moved"
          );
        })
        .catch((e) => toast.error((e as Error).message))
        .finally(() => setMovingEventId(null));
      return;
    }
    const isOpen = openSlotKeys.includes(`${date}|${time}`);
    setPendingSlot({ date, time, isOpen });
  }

  async function applySlotChange(scope: "date" | "weekly") {
    if (!pendingSlot) return;
    const { date, time, isOpen } = pendingSlot;
    try {
      if (scope === "date") {
        await setSlotState({ date, startTime: time, open: !isOpen });
      } else {
        const dow = new Date(`${date}T12:00:00`).getDay();
        await setWeeklySlot({ dayOfWeek: dow, startTime: time, open: !isOpen });
      }
      toast.success(
        `${!isOpen ? "Opened" : "Blocked"} ${time} ${scope === "weekly" ? "every week" : `on ${date}`}`
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPendingSlot(null);
    }
  }

  async function doCancel() {
    if (!selectedEvent) return;
    try {
      const r = await cancelEvent({ eventId: selectedEvent._id as Id<"scheduleEvents"> });
      toast.success(
        r?.charged ? "Lesson cancelled — lesson was charged" : "Lesson cancelled — credited back"
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

  const upcomingCount = activeEvents.length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 16 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Calendar</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {upcomingCount} lesson{upcomingCount === 1 ? "" : "s"} in view · click an empty cell to open or block it · click a lesson to move or cancel
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <LegendSwatch color="rgba(16,185,129,0.25)" label="Open — bookable" />
        <LegendSwatch color="var(--omnic-gray-100)" label="Busy" />
        <LegendSwatch color="var(--brand-purple-tint, rgba(103,22,164,0.15))" label="Lesson" />
        {movingEventId && (
          <span className="pill" style={{ background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>
            Pick a green slot for the lesson — or{" "}
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
              if (!movingEventId) setSelectedEvent(e as CalEvent);
            }}
            onSlotClick={onSlotClick}
            openSlotKeys={openSlotKeys}
            moveMode={!!movingEventId}
            headerExtra={viewSwitcher}
          />
        )}
        {view === "month" && (
          <div className="body-sm" style={{ marginTop: 8 }}>
            Slot painting works in Day and Week views. Click a day to zoom in.
          </div>
        )}
      </div>

      {/* Slot toggle dialog */}
      <Dialog open={!!pendingSlot} onOpenChange={(o) => !o && setPendingSlot(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingSlot?.isOpen ? "Block" : "Open"} {pendingSlot?.time} slot
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-500">
            {pendingSlot?.isOpen
              ? "Blocked time can't be booked by admins or students."
              : "Open slots can be booked by your admin and students."}
          </p>
          <div className="mt-2 flex flex-col gap-2">
            <Button onClick={() => applySlotChange("date")}>
              {pendingSlot?.isOpen ? "Block" : "Open"} this date only (
              {pendingSlot?.date})
            </Button>
            <Button variant="outline" onClick={() => applySlotChange("weekly")}>
              {pendingSlot?.isOpen ? "Block" : "Open"} every{" "}
              {pendingSlot &&
                format(new Date(`${pendingSlot.date}T12:00:00`), "EEEE")}
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
                {selectedEvent.studentName ?? "No student"} ·{" "}
                {selectedEvent.date} · {selectedEvent.startTime}–{selectedEvent.endTime}
              </p>
              {selectedEvent.googleMeetLink && (
                <a
                  href={selectedEvent.googleMeetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm underline"
                >
                  Google Meet link
                </a>
              )}

              {!confirmingCancel ? (
                <div className="flex flex-col gap-2">
                  <Button
                    disabled={!preview?.reschedule.allowed}
                    title={preview?.reschedule.allowed ? undefined : preview?.reschedule.reason}
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
