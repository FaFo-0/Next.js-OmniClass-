"use client";

// Sessions — upcoming booked events + past recordings.
// Teacher's job: fulfill scheduled events. Start button creates a lesson
// linked to the event. Past tab shows completed recordings.

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Video, Upload as UploadIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusPill } from "@/components/shared/StatusPill";
import { Icon } from "@/components/shared/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function TeacherSessionsPage() {
  const router = useRouter();
  const { currentUserId } = useAuth();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [quickOpen, setQuickOpen] = useState(false);

  const lessons = useQuery(
    api.lessons.listForTeacher,
    currentUserId ? { teacherId: currentUserId } : "skip"
  );
  const scheduleEvents = useQuery(
    api.schedule.listForTeacher,
    currentUserId ? { teacherId: currentUserId } : "skip"
  );
  const allUsers = useQuery(api.users.listAllUsers, {}) ?? [];

  const userNameMap = new Map(allUsers.map((u) => [u.externalId, u.name]));

  // Upcoming: scheduleEvents that are scheduled + future
  const now = new Date();
  const upcoming = (scheduleEvents ?? [])
    .filter((e) => e.status === "scheduled" && new Date(`${e.date}T${e.startTime}`) > now)
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));

  // Past: lessons already recorded
  const past = (lessons ?? [])
    .filter((l) => !["scheduled"].includes(l.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div style={{ padding: "28px 28px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Sessions</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {upcoming.length} upcoming · {past.length} past
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" size="sm" onClick={() => setQuickOpen(true)}>
            <Icon name="plus" size={14} /> Quick record
          </Button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "upcoming" ? "tab-active" : ""}`} onClick={() => setTab("upcoming")}>
          Upcoming <span className="tab-count">{upcoming.length}</span>
        </button>
        <button className={`tab ${tab === "past" ? "tab-active" : ""}`} onClick={() => setTab("past")}>
          Past <span className="tab-count">{past.length}</span>
        </button>
      </div>

      {tab === "upcoming" && (
        <div className="card">
          {upcoming.length === 0 && (
            <div style={{ padding: 40, textAlign: "center" }}>
              <Icon name="calendar" size={40} stroke="var(--omnic-gray-300)" />
              <div className="body" style={{ marginTop: 12 }}>No upcoming sessions.</div>
              <div className="body-sm" style={{ marginTop: 4 }}>
                Sessions appear here when a student books a slot or an admin creates an event.
              </div>
            </div>
          )}
          {upcoming.map((e) => {
            const studentName = userNameMap.get(e.studentId ?? "") ?? e.studentId ?? "—";
            const eventDate = new Date(`${e.date}T${e.startTime}`);
            const isToday = eventDate.toDateString() === now.toDateString();
            const isTomorrow = eventDate.toDateString() === new Date(now.getTime() + 86400000).toDateString();
            const dateLabel = isToday ? "Today" : isTomorrow ? "Tomorrow" : eventDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

            return (
              <StartableEventRow
                key={e._id}
                event={e}
                studentName={studentName}
                dateLabel={dateLabel}
                onStartedLive={(lessonId) => router.push(`/teacher/sessions/${lessonId}/live`)}
              />
            );
          })}
        </div>
      )}

      {tab === "past" && (
        <div className="card">
          {past.length === 0 && (
            <div style={{ padding: 40, textAlign: "center" }}>
              <Icon name="video" size={40} stroke="var(--omnic-gray-300)" />
              <div className="body" style={{ marginTop: 12 }}>No past recordings.</div>
            </div>
          )}
          {past.map((l) => (
            <Link
              key={l._id}
              href={l.status === "recording" ? `/teacher/sessions/${l._id}/live` : `/teacher/sessions/${l._id}`}
              className="lesson-row"
            >
              <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--omnic-tenant-primary-soft)", color: "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="book" size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{l.title}</div>
                <div className="body-sm" style={{ marginTop: 2 }}>
                  {userNameMap.get(l.studentId) ?? l.studentId} · {new Date(l.createdAt).toLocaleDateString()}
                </div>
              </div>
              <span className={`pill ${l.status === "published" ? "pill-active" : l.status === "recording" ? "pill-tenant" : "pill-new"}`}>
                {l.status === "recording" ? "Live" : l.status === "published" ? "Published" : l.status === "review" ? "Review" : l.status}
              </span>
              <Icon name="chevronRight" size={16} stroke="var(--omnic-gray-400)" />
            </Link>
          ))}
        </div>
      )}

      <QuickRecordDialog
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onStartedLive={(lessonId) => { setQuickOpen(false); router.push(`/teacher/sessions/${lessonId}/live`); }}
        onStartedUpload={(lessonId) => { setQuickOpen(false); router.push(`/teacher/sessions/${lessonId}`); }}
      />
    </div>
  );
}

function StartableEventRow({
  event,
  studentName,
  dateLabel,
  onStartedLive,
}: {
  event: any;
  studentName: string;
  dateLabel: string;
  onStartedLive: (lessonId: string) => void;
}) {
  const router = useRouter();
  const createLesson = useMutation(api.lessons.create);
  const [starting, setStarting] = useState(false);

  async function handleStart() {
    setStarting(true);
    try {
      const lessonId = await createLesson({
        studentId: event.studentId ?? "",
        title: event.title,
        scheduleEventId: event._id as Id<"scheduleEvents">,
        recordingMode: "live",
      });
      onStartedLive(lessonId as string);
    } catch (e) {
      toast.error((e as Error).message);
      setStarting(false);
    }
  }

  return (
    <div className="lesson-row" style={{ justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1, minWidth: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--omnic-tenant-primary-soft)", color: "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="calendar" size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--omnic-gray-900)" }}>{event.title}</div>
          <div className="body-sm" style={{ marginTop: 2 }}>
            {studentName} · {dateLabel} · {event.startTime} — {event.endTime}
          </div>
        </div>
        <span className="pill pill-tenant">{event.type}</span>
      </div>
      <Button
        size="sm"
        disabled={starting}
        onClick={handleStart}
        style={{ marginLeft: 12, flexShrink: 0 }}
      >
        <Video size={14} className="me-1" />
        {starting ? "Starting…" : "Start"}
      </Button>
    </div>
  );
}

function QuickRecordDialog({
  open,
  onClose,
  onStartedLive,
  onStartedUpload,
}: {
  open: boolean;
  onClose: () => void;
  onStartedLive: (lessonId: string) => void;
  onStartedUpload: (lessonId: string) => void;
}) {
  const { currentUserId } = useAuth();
  const students = useQuery(
    api.users.getStudentsForTeacher,
    currentUserId ? { teacherId: currentUserId } : "skip"
  );
  const create = useMutation(api.lessons.create);

  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleStart(mode: "live" | "upload") {
    if (!studentId) { toast.error("Pick a student"); return; }
    if (!title.trim()) { toast.error("Title required"); return; }
    setBusy(true);
    try {
      const id = await create({ studentId, title: title.trim(), recordingMode: mode });
      if (mode === "live") onStartedLive(id as string);
      else onStartedUpload(id as string);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Quick record (ad-hoc)</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--omnic-gray-600)" }}>Student</label>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}
              className="w-full h-9 rounded-md border px-3 text-sm bg-white" style={{ borderColor: "var(--omnic-gray-300)" }}>
              <option value="">— Pick a student —</option>
              {students?.map((s) => (
                <option key={s.externalId} value={s.externalId}>{s.name} ({s.email})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--omnic-gray-600)" }}>Lesson title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Business English — Negotiation" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="outline" disabled={busy} onClick={() => handleStart("upload")}>
            <UploadIcon size={14} className="me-1" /> Upload recording
          </Button>
          <Button disabled={busy} onClick={() => handleStart("live")}>
            <Video size={14} className="me-1" /> Live recording
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
