"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { addDays, addMonths } from "date-fns";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { Icon } from "@/components/shared/icons";
import { VacancyEditor } from "@/components/calendar/VacancyEditor";
import { WeeklyCalendar, type ScheduleEvent } from "@/components/calendar/WeeklyCalendar";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type CalendarView = "day" | "week" | "month";

export default function TeacherCalendarPage() {
  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [reason, setReason] = useState("");
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  const events = useQuery(api.schedule.listForTeacher, {}) ?? [];
  const me = useQuery(api.users.getMe);
  const allUsers = useQuery(api.users.listAllUsers) ?? [];

  const requestReschedule = useMutation(api.schedule.requestReschedule);
  const updateEvent = useMutation(api.schedule.updateEvent);

  const hasFullEdit =
    !!me && ((me.permissions ?? []).includes("calendar.edit.full") || me.role === "admin");

  const now = new Date();
  const upcoming = events
    .filter((e: any) => e.status === "scheduled" && new Date(`${e.date}T${e.startTime}`) > now)
    .sort((a: any, b: any) =>
      `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)
    );

  const userByExternalId = new Map(allUsers.map((u: any) => [u.externalId, u]));

  const gridEvents = useMemo(
    () => events.filter((e: any) => e.type !== "placeholder") as ScheduleEvent[],
    [events]
  );
  const gridUsers = useMemo(
    () => allUsers.map((u: any) => ({ externalId: u.externalId, name: u.name })),
    [allUsers]
  );

  function openReschedule(event: any) {
    setSelectedEvent(event);
    setNewDate(event.date);
    setNewTime(event.startTime);
    setReason("");
    setRescheduleOpen(true);
  }

  // Sessions page routes here with ?event={id} — auto-open the dialog.
  const [pendingEventId, setPendingEventId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("event");
  });
  useEffect(() => {
    if (!pendingEventId || events.length === 0) return;
    const match = events.find((e: any) => e._id === pendingEventId);
    if (match) {
      openReschedule(match);
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

  async function submitReschedule() {
    if (!selectedEvent) return;
    if (hasFullEdit) {
      try {
        await updateEvent({
          eventId: selectedEvent._id as Id<"scheduleEvents">,
          date: newDate,
          startTime: newTime,
        });
        toast.success("Event rescheduled");
        setRescheduleOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    } else {
      try {
        await requestReschedule({
          eventId: selectedEvent._id as Id<"scheduleEvents">,
          toDate: newDate,
          toStartTime: newTime,
          reason: reason || undefined,
        });
        toast.success("Reschedule request submitted to admin");
        setRescheduleOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
  }

  const title = hasFullEdit ? "Edit event" : "Request reschedule";
  const submitLabel = hasFullEdit ? "Reschedule" : "Send request";

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Calendar</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {hasFullEdit
              ? `${upcoming.length} upcoming session${upcoming.length === 1 ? "" : "s"} · click an event to reschedule`
              : `${upcoming.length} upcoming session${upcoming.length === 1 ? "" : "s"} · request changes via admin`}
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card" style={{ padding: 16, marginBottom: 24 }}>
        {view === "month" ? (
          <MonthCalendar
            events={gridEvents}
            users={gridUsers}
            currentDate={currentDate}
            onPrev={() => navigate(-1)}
            onNext={() => navigate(1)}
            onToday={() => setCurrentDate(new Date())}
            onEventClick={openReschedule}
            onDayClick={(day) => {
              setCurrentDate(day);
              setView("day");
            }}
            headerExtra={viewSwitcher}
          />
        ) : (
          <WeeklyCalendar
            events={gridEvents}
            users={gridUsers}
            currentDate={currentDate}
            mode={view}
            onPrevWeek={() => navigate(-1)}
            onNextWeek={() => navigate(1)}
            onToday={() => setCurrentDate(new Date())}
            onEventClick={openReschedule}
            readOnly
            headerExtra={viewSwitcher}
          />
        )}
      </div>

      {/* Upcoming list */}
      {upcoming.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
          <div style={{ padding: "14px 16px 0" }}>
            <div className="h3">Upcoming sessions</div>
          </div>
          {upcoming.map((e: any) => {
            const student = e.studentId ? userByExternalId.get(e.studentId) : null;
            return (
              <button
                key={e._id}
                onClick={() => openReschedule(e)}
                className="lesson-row"
                style={{ width: "100%", textAlign: "start", border: "none", background: "transparent" }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--omnic-tenant-primary-soft)", color: "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="calendar" size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{e.title}</div>
                  <div className="body-sm" style={{ marginTop: 2 }}>
                    {e.date} · {e.startTime} — {e.endTime}
                    {student ? ` · ${student.name}` : ""}
                  </div>
                </div>
                <span className="pill pill-tenant">{e.type}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Weekly availability editor (collapsible) */}
      <div className="card" style={{ padding: 16 }}>
        <button
          onClick={() => setAvailabilityOpen((o) => !o)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
        >
          <div className="h3">My availability</div>
          <Icon name={availabilityOpen ? "chevronUp" : "chevronDown"} size={16} stroke="var(--omnic-gray-500)" />
        </button>
        {availabilityOpen && (
          <div style={{ marginTop: 16 }}>
            <VacancyEditor />
          </div>
        )}
      </div>

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {selectedEvent && (
              <p className="text-sm text-zinc-500">
                From: {selectedEvent.date} at {selectedEvent.startTime}
              </p>
            )}
            <div>
              <label className="text-sm font-medium">New date</label>
              <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">New time</label>
              <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            </div>
            {!hasFullEdit && (
              <div>
                <label className="text-sm font-medium">Reason (optional)</label>
                <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            )}
            <Button className="w-full" onClick={submitReschedule}>
              {submitLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
