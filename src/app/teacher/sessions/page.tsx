"use client";

// Sessions — upcoming booked events + past recordings.
//
// Upcoming tab: each row shows event info. Green pulsing "Ready" badge
// 5 min before start. Same-day events can be started anytime.
// Clicking the row opens a dialog with Start or Cancel/Reschedule.
//
// Cancel/Reschedule → routes to /teacher/calendar with event ID.
// Start session: link an upcoming scheduled event, or start an unscheduled
// one now — which creates a real dated calendar event (same mutation as the
// calendar one-time lesson) rather than a placeholder.

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Video, Clock, ExternalLink } from "lucide-react";
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
import { errText } from "@/lib/convexError";
import { instantToZoned } from "@/lib/tz";
import { formatTime, type TimeFormat } from "@/lib/timeFormat";

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
  // Clock preference follows the teacher everywhere, not just the calendar.
  const me = useQuery(api.users.getMe);
  const timeFmt: TimeFormat = me?.timeFormat ?? "24h";

  const userNameMap = new Map(allUsers.map((u) => [u.externalId, u.name]));

  const typeLabels: Record<string, string> = {
    "1on1": "Individual",
    group: "Group",
    offline: "Offline",
    global: "Global",
  };

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const upcoming = (scheduleEvents ?? [])
    .filter(
      (e) =>
        e.status === "scheduled" &&
        e.type !== "placeholder" &&
        e.date >= todayStr
    )
    .sort((a, b) =>
      `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)
    );

  const past = (lessons ?? [])
    .filter((l) => !["scheduled"].includes(l.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Active lessons per schedule event — prevent duplicate starts
  const activeLessonByEvent = new Map<string, string>();
  for (const l of lessons ?? []) {
    if (
      l.scheduleEventId &&
      !["published", "no_show_student", "no_show_teacher"].includes(l.status) &&
      !l.isDeleted
    ) {
      activeLessonByEvent.set(l.scheduleEventId, l._id);
    }
  }

  return (
    <div style={{ padding: "28px 28px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <h1 className="h1" style={{ margin: 0 }}>
            Sessions
          </h1>
          <div className="body" style={{ marginTop: 4 }}>
            {upcoming.length} upcoming · {past.length} past
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuickOpen(true)}
          >
            <Icon name="plus" size={14} /> Start session
          </Button>
        </div>
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === "upcoming" ? "tab-active" : ""}`}
          onClick={() => setTab("upcoming")}
        >
          Upcoming <span className="tab-count">{upcoming.length}</span>
        </button>
        <button
          className={`tab ${tab === "past" ? "tab-active" : ""}`}
          onClick={() => setTab("past")}
        >
          Past <span className="tab-count">{past.length}</span>
        </button>
      </div>

      {tab === "upcoming" && (
        <div className="card">
          {upcoming.length === 0 && (
            <div style={{ padding: 40, textAlign: "center" }}>
              <Icon
                name="calendar"
                size={40}
                stroke="var(--omnic-gray-300)"
              />
              <div className="body" style={{ marginTop: 12 }}>
                No upcoming sessions.
              </div>
              <div className="body-sm" style={{ marginTop: 4 }}>
                Sessions appear here when a student books a slot or an admin
                creates an event.
              </div>
            </div>
          )}
          {upcoming.map((e) => {
            const studentName =
              userNameMap.get(e.studentId ?? "") ?? e.studentId ?? "—";
            const eventDate = new Date(`${e.date}T${e.startTime}`);
            const isToday = eventDate.toDateString() === now.toDateString();
            const isTomorrow =
              eventDate.toDateString() ===
              new Date(now.getTime() + 86400000).toDateString();
            const dateLabel = isToday
              ? "Today"
              : isTomorrow
                ? "Tomorrow"
                : eventDate.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  });

            return (
              <StartableEventRow
                key={e._id}
                event={e}
                studentName={studentName}
                dateLabel={dateLabel}
                activeLessonId={activeLessonByEvent.get(e._id) ?? null}
                timeFmt={timeFmt}
                onStartedLive={(lessonId) =>
                  router.push(`/teacher/sessions/${lessonId}/live`)
                }
              />
            );
          })}
        </div>
      )}

      {tab === "past" && (
        <div className="card">
          {past.length === 0 && (
            <div style={{ padding: 40, textAlign: "center" }}>
              <Icon
                name="video"
                size={40}
                stroke="var(--omnic-gray-300)"
              />
              <div className="body" style={{ marginTop: 12 }}>
                No past recordings.
              </div>
            </div>
          )}
          {past.map((l) => (
            <Link
              key={l._id}
              href={
                l.status === "recording"
                  ? `/teacher/sessions/${l._id}/live`
                  : `/teacher/sessions/${l._id}`
              }
              className="lesson-row"
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  background: "var(--omnic-tenant-primary-soft)",
                  color: "var(--omnic-tenant-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="book" size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--omnic-gray-900)",
                  }}
                >
                  {l.title}
                </div>
                <div className="body-sm" style={{ marginTop: 2 }}>
                  {userNameMap.get(l.studentId) ?? l.studentId} ·{" "}
                  {new Date(l.createdAt).toLocaleDateString()}
                  {l.durationSeconds > 0 && (
                    <> · {Math.round(l.durationSeconds / 60)} min</>
                  )}
                </div>
              </div>
              <span
                className={`pill ${
                  l.status === "published"
                    ? "pill-active"
                    : l.status === "recording"
                      ? "pill-tenant"
                      : "pill-new"
                }`}
              >
                {l.status === "recording"
                  ? "Live"
                  : l.status === "published"
                    ? "Published"
                    : l.status === "review"
                      ? "Review"
                      : l.status}
              </span>
              <Icon
                name="chevronRight"
                size={16}
                stroke="var(--omnic-gray-400)"
              />
            </Link>
          ))}
        </div>
      )}

      <QuickRecordDialog
        open={quickOpen}
        upcomingEvents={upcoming}
        timeFmt={timeFmt}
        onClose={() => setQuickOpen(false)}
        onStartedLive={(lessonId) => {
          setQuickOpen(false);
          router.push(`/teacher/sessions/${lessonId}/live`);
        }}
      />
    </div>
  );
}

function StartableEventRow({
  event,
  studentName,
  dateLabel,
  activeLessonId,
  timeFmt,
  onStartedLive,
}: {
  event: any;
  studentName: string;
  dateLabel: string;
  activeLessonId: string | null;
  timeFmt: TimeFormat;
  onStartedLive: (lessonId: string) => void;
}) {
  const router = useRouter();
  const createLesson = useMutation(api.lessons.create);
  const renameEvent = useMutation(api.calendar.renameEvent);
  const [starting, setStarting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  async function handleRename() {
    try {
      await renameEvent({ eventId: event._id, title: renameValue });
      toast.success("Lesson renamed");
      setRenaming(false);
    } catch (e) {
      toast.error(errText(e));
    }
  }

  const now = Date.now();
  const eventTime = new Date(`${event.date}T${event.startTime}:00`).getTime();
  const fiveMinBefore = eventTime - 5 * 60 * 1000;

  const isToday = event.date === new Date().toISOString().slice(0, 10);
  const canStart = !activeLessonId && (isToday || now >= fiveMinBefore);
  const isReady = now >= fiveMinBefore && now < eventTime;
  const isLive = !!activeLessonId;

  const typeLabels: Record<string, string> = {
    "1on1": "Individual",
    group: "Group",
    offline: "Offline",
    global: "Global",
  };

  async function handleStart() {
    setDialogOpen(false);
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

  function handleCancelReschedule() {
    setDialogOpen(false);
    router.push(`/teacher/calendar?event=${event._id}`);
  }

  return (
    <>
      <div
        className="lesson-row"
        style={{ justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setDialogOpen(true)}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: "var(--omnic-tenant-primary-soft)",
              color: "var(--omnic-tenant-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="calendar" size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--omnic-gray-900)",
              }}
            >
              {event.title}
            </div>
            <div className="body-sm" style={{ marginTop: 2 }}>
              {studentName} · {dateLabel} · {formatTime(event.startTime, timeFmt)} — {formatTime(event.endTime, timeFmt)}
            </div>
          </div>
          <span className="pill pill-tenant">{typeLabels[event.type] ?? event.type}</span>
          {isReady && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 600,
                color: "var(--omnic-green, #16a34a)",
                background: "var(--omnic-green-soft, #dcfce7)",
                padding: "2px 8px",
                borderRadius: 999,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "currentColor",
                  animation: "pulse 1.5s infinite",
                }}
              />
              Ready
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!canStart && (
            <span
              style={{
                fontSize: 11,
                color: "var(--omnic-gray-400)",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <Clock size={11} />
              {isToday ? `Starts at ${formatTime(event.startTime, timeFmt)}` : "Upcoming"}
            </span>
          )}
          {isLive ? (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/teacher/sessions/${activeLessonId}/live`);
              }}
              style={{
                marginLeft: 0,
                flexShrink: 0,
                background: "var(--omnic-green, #16a34a)",
              }}
            >
              <Video size={14} className="me-1" /> Resume
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={!canStart || starting}
              onClick={(e) => {
                e.stopPropagation();
                handleStart();
              }}
              style={{
                marginLeft: 0,
                flexShrink: 0,
                ...(isReady
                  ? { background: "var(--brand-purple)" }
                  : {}),
              }}
            >
              <Video size={14} className="me-1" />
              {starting ? "Starting…" : "Start"}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{event.title}</DialogTitle>
          </DialogHeader>
          <div
            className="space-y-1 text-sm"
            style={{ color: "var(--omnic-gray-600)" }}
          >
            <div>
              <strong>Student:</strong> {studentName}
            </div>
            <div>
              {dateLabel} · {formatTime(event.startTime, timeFmt)} — {formatTime(event.endTime, timeFmt)}
            </div>
            <div>Type: {typeLabels[event.type] ?? event.type}</div>
          </div>
          {renaming ? (
            <div className="space-y-2">
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Lesson name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleRename();
                }}
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleRename} disabled={!renameValue.trim()}>
                  Save name
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCancelReschedule}>
              <ExternalLink size={14} className="me-1" /> Cancel or Reschedule
            </Button>
            {!renaming && (
              <Button
                variant="outline"
                onClick={() => {
                  setRenameValue(event.title ?? "");
                  setRenaming(true);
                }}
              >
                Rename
              </Button>
            )}
            {isLive ? (
              <Button
                onClick={() => {
                  setDialogOpen(false);
                  router.push(`/teacher/sessions/${activeLessonId}/live`);
                }}
                style={{ background: "var(--omnic-green, #16a34a)" }}
              >
                <Video size={14} className="me-1" /> Resume session
              </Button>
            ) : (
              <Button
                disabled={!canStart || starting}
                onClick={handleStart}
              >
                <Video size={14} className="me-1" />
                {starting ? "Starting…" : "Start session"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QuickRecordDialog({
  open,
  upcomingEvents,
  timeFmt,
  onClose,
  onStartedLive,
}: {
  open: boolean;
  upcomingEvents: any[];
  timeFmt: TimeFormat;
  onClose: () => void;
  onStartedLive: (lessonId: string) => void;
}) {
  const { currentUserId } = useAuth();
  const students = useQuery(
    api.users.getStudentsForTeacher,
    currentUserId ? { teacherId: currentUserId } : "skip"
  );
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const orgTz = tenant?.timezone ?? "UTC";
  const create = useMutation(api.lessons.create);
  // Same mutation the calendar's one-time lesson uses — one concept, one path.
  const createOneTime = useMutation(api.calendar.createOneTimeLesson);

  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [busy, setBusy] = useState(false);

  // The picked event decides who the lesson is with; an unscheduled session
  // asks for the student instead.
  const pickedEvent = upcomingEvents.find((e) => e._id === selectedEventId);
  const effectiveStudentId = pickedEvent?.studentId ?? studentId;

  async function handleStart(overrideBuffer = false) {
    if (!effectiveStudentId) {
      toast.error("Pick a student");
      return;
    }
    if (!title.trim()) {
      toast.error("Title required");
      return;
    }
    setBusy(true);
    try {
      let eventId = selectedEventId;

      // POLICY §5 — every live session resolves to a real dated calendar
      // event. An unscheduled "start now" creates one at the current academy
      // wall-clock time instead of leaving a placeholder behind.
      if (!eventId) {
        const nowOrg = instantToZoned(new Date(), orgTz);
        const r = await createOneTime({
          studentId: effectiveStudentId,
          date: nowOrg.date,
          startTime: nowOrg.time,
          durationMinutes: tenant?.defaultLessonDurationMinutes ?? 60,
          overrideBuffer,
        });
        eventId = r.eventId as string;
        if (r.unpaid) {
          toast.warning("Student had no lesson credit — flagged unpaid for the admin");
        }
      }

      const id = await create({
        studentId: effectiveStudentId,
        title: title.trim(),
        recordingMode: "live",
        scheduleEventId: eventId as Id<"scheduleEvents">,
      });
      onStartedLive(id as string);
    } catch (e) {
      const msg = errText(e);
      // Soft rest-break warning (POLICY §5) — let the teacher confirm through.
      if (msg.startsWith("BUFFER:")) {
        const note = msg.split(":").slice(3).join(":");
        toast.warning(note || "Too close to another lesson", {
          action: { label: "Start anyway", onClick: () => void handleStart(true) },
          duration: 12_000,
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a session</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label
              className="text-xs font-medium block mb-1"
              style={{ color: "var(--omnic-gray-600)" }}
            >
              Session
            </label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full h-9 rounded-md border px-3 text-sm bg-white"
              style={{ borderColor: "var(--omnic-gray-300)" }}
            >
              <option value="">— Not scheduled: start one now —</option>
              {upcomingEvents.map((e) => {
                const eventDate = new Date(`${e.date}T${e.startTime}`);
                const dateLabel = eventDate.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
                return (
                  <option key={e._id} value={e._id}>
                    {e.title} — {dateLabel} {formatTime(e.startTime, timeFmt)}
                  </option>
                );
              })}
            </select>
            <div
              className="text-xs mt-1"
              style={{ color: "var(--omnic-gray-400)" }}
            >
              {selectedEventId
                ? "Lesson will be linked to this scheduled session."
                : "Adds a lesson to the calendar at the current time and starts it — same as a one-time lesson."}
            </div>
          </div>
          {pickedEvent ? (
            <div
              className="text-xs"
              style={{ color: "var(--omnic-gray-600)" }}
            >
              Student:{" "}
              <strong>
                {students?.find((s) => s.externalId === pickedEvent.studentId)?.name ??
                  "the student on this session"}
              </strong>
            </div>
          ) : (
            <div>
              <label
                className="text-xs font-medium block mb-1"
                style={{ color: "var(--omnic-gray-600)" }}
              >
                Student
              </label>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full h-9 rounded-md border px-3 text-sm bg-white"
                style={{ borderColor: "var(--omnic-gray-300)" }}
              >
                <option value="">— Pick a student —</option>
                {students?.map((s) => (
                  <option key={s.externalId} value={s.externalId}>
                    {s.name} ({s.email})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label
              className="text-xs font-medium block mb-1"
              style={{ color: "var(--omnic-gray-600)" }}
            >
              Lesson title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Business English — Negotiation"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => handleStart()}>
            <Video size={14} className="me-1" />{" "}
            {selectedEventId ? "Start live recording" : "Create & start now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
