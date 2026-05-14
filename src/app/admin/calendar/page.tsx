"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { Icon } from "@/components/shared/icons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function AdminCalendarPage() {
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const events = useQuery(api.schedule.listForOrg, {}) ?? [];
  const pending = useQuery(api.schedule.listPendingReschedules, {}) ?? [];
  const unaccounted = useQuery(api.schedule.listPendingUnaccounted, {}) ?? [];
  const allUsers = useQuery(api.users.listAllUsers) ?? [];
  const activities = useQuery(api.tenantSettings.getActivityTypes, {
    activeOnly: true,
  }) ?? [];
  const createEvent = useMutation(api.schedule.createEvent);
  const createMeetEvent = useAction(api.meet.createCalendarEvent);
  const attachMeetLink = useMutation(api.schedule.setMeetLink);

  const teachers = useMemo(
    () => allUsers.filter((u: any) => u.role === "teacher"),
    [allUsers]
  );
  const students = useMemo(
    () => allUsers.filter((u: any) => u.role === "student"),
    [allUsers]
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [activityId, setActivityId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [startTime, setStartTime] = useState("18:00");
  const [duration, setDuration] = useState("60");
  const [capacity, setCapacity] = useState("8");
  const [meetLink, setMeetLink] = useState("");
  const [creating, setCreating] = useState(false);

  const selectedActivity = activities.find((a: any) => a.id === activityId);
  const isGroup = selectedActivity?.isGroup ?? false;

  function resetForm() {
    setActivityId("");
    setTeacherId("");
    setStudentId("");
    setTitle("");
    setMeetLink("");
    setCapacity("8");
  }

  function computeEndTime(start: string, mins: number): string {
    const [h, m] = start.split(":").map(Number);
    const total = h * 60 + m + mins;
    const eh = Math.floor(total / 60) % 24;
    const em = total % 60;
    return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
  }

  async function submitCreate() {
    if (!activityId || !date || !startTime) {
      toast.error("Activity, date, and start time required");
      return;
    }
    if (!isGroup && (!teacherId || !studentId)) {
      toast.error("1-on-1 needs both teacher and student");
      return;
    }
    if (isGroup && !teacherId && selectedActivity?.id !== "offline_group") {
      toast.error("Online groups need a teacher");
      return;
    }
    setCreating(true);
    try {
      const endTime = computeEndTime(startTime, Number(duration));
      const eventId = (await createEvent({
        activityTypeId: activityId,
        teacherId: teacherId || undefined,
        studentId: !isGroup ? studentId : undefined,
        title: title || selectedActivity!.name,
        date,
        startTime,
        endTime,
        googleMeetLink: meetLink || undefined,
        capacity: isGroup ? Number(capacity) : undefined,
      })) as Id<"scheduleEvents">;
      toast.success("Event created");

      // I.2 — best-effort Google Meet auto-create when the teacher
      // has OAuth connected AND no link was pasted manually.
      if (eventId && teacherId && !meetLink) {
        try {
          const res = await createMeetEvent({
            teacherId,
            title: title || selectedActivity!.name,
            date,
            startTime,
            endTime,
          });
          if (res?.meetLink) {
            await attachMeetLink({ eventId, meetLink: res.meetLink });
            toast.success("Google Meet link attached");
          }
        } catch (err) {
          console.warn("Meet auto-create failed", err);
        }
      }

      resetForm();
      setCreateOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const upcoming = events
    .filter((e: any) => e.status === "scheduled")
    .sort((a: any, b: any) =>
      `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)
    )
    .slice(0, 8);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Calendar</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {events.length} total event{events.length === 1 ? "" : "s"} · {pending.length} pending reschedule{pending.length === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-tenant" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={14} /> Create event
          </button>
          <Link href="/admin/settings#scheduling" className="btn btn-secondary">
            <Icon name="settings" size={14} /> Scheduling rules
          </Link>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-secondary btn-sm">Today</button>
          <button className="btn btn-ghost btn-sm"><Icon name="chevronLeft" size={14} /></button>
          <button className="btn btn-ghost btn-sm"><Icon name="chevronRight" size={14} /></button>
          <div className="h3" style={{ marginLeft: 8 }}>
            {new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}
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
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--omnic-gray-100)" }}>
          <div className="h3">Upcoming sessions</div>
        </div>
        {upcoming.length === 0 && (
          <div className="body-sm" style={{ padding: "24px 20px", textAlign: "center" }}>
            No upcoming sessions.
          </div>
        )}
        {upcoming.map((e: any) => (
          <div key={e._id} className="lesson-row">
            <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--omnic-tenant-primary-soft)", color: "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="calendar" size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{e.title}</div>
              <div className="body-sm" style={{ marginTop: 2 }}>
                {e.date} · {e.startTime} — {e.endTime} · {e.type}
              </div>
            </div>
            <span className="pill pill-tenant">{e.status}</span>
          </div>
        ))}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create event</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-sm font-medium">Activity</label>
              <Select value={activityId} onValueChange={(v) => setActivityId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick activity type" />
                </SelectTrigger>
                <SelectContent>
                  {activities.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} · {a.pointCost} pts
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Title (optional)</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={selectedActivity?.name ?? "Event title"}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Start time</label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Duration (minutes)</label>
              <Input
                type="number"
                min={15}
                step={15}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                {isGroup ? "Teacher / host" : "Teacher"}
              </label>
              <Select value={teacherId} onValueChange={(v) => setTeacherId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a teacher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— none —</SelectItem>
                  {teachers.map((t: any) => (
                    <SelectItem key={t.externalId} value={t.externalId}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isGroup && (
              <div>
                <label className="text-sm font-medium">Student</label>
                <Select value={studentId} onValueChange={(v) => setStudentId(v ?? "")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a student" />
                  </SelectTrigger>
                  <SelectContent>
                    {students.map((s: any) => (
                      <SelectItem key={s.externalId} value={s.externalId}>
                        {s.name} · {s.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isGroup && (
              <div>
                <label className="text-sm font-medium">Capacity</label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Google Meet link (optional)</label>
              <Input
                value={meetLink}
                onChange={(e) => setMeetLink(e.target.value)}
                placeholder="https://meet.google.com/…"
              />
            </div>
            <Button className="w-full" onClick={submitCreate} disabled={creating}>
              {creating ? "Creating…" : "Create event"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {unaccounted.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "var(--status-cancelled)" }}>
          <div className="h3" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="alert" size={16} stroke="var(--omnic-red)" /> Unaccounted-for sessions
          </div>
          <div className="body-sm">
            {unaccounted.length} session{unaccounted.length === 1 ? "" : "s"} ran past start time without status updates. Resolve via the session detail page.
          </div>
        </div>
      )}
    </div>
  );
}
