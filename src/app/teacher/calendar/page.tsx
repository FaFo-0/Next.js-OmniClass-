"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { Icon } from "@/components/shared/icons";
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

export default function TeacherCalendarPage() {
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [reason, setReason] = useState("");

  const events = useQuery(api.schedule.listForTeacher, {}) ?? [];
  const me = useQuery(api.users.getMe);
  const allUsers = useQuery(api.users.listAllUsers) ?? [];

  const requestReschedule = useMutation(api.schedule.requestReschedule);
  const updateEvent = useMutation(api.schedule.updateEvent);

  const hasFullEdit = () => {
    if (!me) return false;
    const perms = me.permissions ?? [];
    if (perms.includes("calendar.edit.full")) return true;
    return me.role === "admin";
  };

  const now = new Date();
  const upcoming = events
    .filter((e: any) => e.status === "scheduled" && new Date(`${e.date}T${e.startTime}`) > now)
    .sort((a: any, b: any) =>
      `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)
    );

  const userByExternalId = new Map(allUsers.map((u: any) => [u.externalId, u]));

  function openReschedule(event: any) {
    setSelectedEvent(event);
    setNewDate(event.date);
    setNewTime(event.startTime);
    setReason("");
    setRescheduleOpen(true);
  }

  async function submitReschedule() {
    if (!selectedEvent) return;
    if (hasFullEdit()) {
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

  const title = hasFullEdit() ? "Edit event" : "Request reschedule";
  const submitLabel = hasFullEdit() ? "Reschedule" : "Send request";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Calendar</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {hasFullEdit()
              ? `${upcoming.length} upcoming session${upcoming.length === 1 ? "" : "s"} · click an event to reschedule`
              : `${upcoming.length} upcoming session${upcoming.length === 1 ? "" : "s"} · request changes via admin`}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-secondary btn-sm">Today</button>
          <button className="btn btn-ghost btn-sm"><Icon name="chevronLeft" size={14} /></button>
          <button className="btn btn-ghost btn-sm"><Icon name="chevronRight" size={14} /></button>
          <div className="h3" style={{ marginLeft: 8 }}>
            {now.toLocaleString("en-US", { month: "long", year: "numeric" })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["day", "week", "month"] as const).map((v) => (
            <button
              key={v}
              className="chip"
              onClick={() => setView(v)}
              style={view === v ? { background: "var(--brand-purple)", color: "#FFFFFF", borderColor: "var(--brand-purple)", boxShadow: "0 2px 10px rgba(103,22,164,0.25)" } : {}}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Upcoming */}
      {upcoming.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
          {upcoming.map((e: any) => {
            const student = e.studentId ? userByExternalId.get(e.studentId) : null;
            return (
              <button
                key={e._id}
                onClick={() => openReschedule(e)}
                className="lesson-row"
                style={{ width: "100%", textAlign: "left", border: "none", background: "transparent" }}
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
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <div style={{ width: 88, height: 88, borderRadius: "50%", background: "var(--omnic-tenant-primary-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
              <Icon name="calendar" size={44} stroke="var(--omnic-tenant-primary)" />
            </div>
            <h3 className="h3">No upcoming sessions</h3>
            <div className="body" style={{ marginTop: 4 }}>Schedule sessions appear here.</div>
          </div>
        </div>
      )}

      {/* Placeholder grid view (parity w/ student) */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
          <Icon name="calendar" size={44} stroke="var(--omnic-tenant-primary)" />
          <h3 className="h3" style={{ marginTop: 12 }}>Week Calendar View</h3>
          <div className="body" style={{ marginTop: 4 }}>
            Full calendar with {view} view and Google-style time grid coming soon.
          </div>
        </div>
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
            {!hasFullEdit() && (
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
