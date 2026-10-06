"use client";

// §13.10 — Unified teacher calendar.
// One grid: Open slots (green), Busy (default), Lessons (colored blocks).
// Click empty cell → open/block, this date or every week.
// Click lesson → policy-aware Move / Cancel with consequence labels.

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { addDays, addMonths, format, parseISO } from "date-fns";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { WeeklyCalendar, type ScheduleEvent } from "@/components/calendar/WeeklyCalendar";
import { AvailabilityBoard } from "@/components/calendar/AvailabilityBoard";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { errText } from "@/lib/convexError";
import { formatTime } from "@/lib/timeFormat";
import { convertZoned, zonedToInstant } from "@/lib/tz";
import { sessionStartWindow, LESSON_START_EARLY_MINUTES } from "@/lib/sessionStart";
import {
  calendarRange,
  useViewerTz,
  useZonedCalendar,
  useRememberedView,
  dualTime,
  viewerAndStudentTime,
  TimezoneSelect,
  TimeFormatToggle,
  useTimeFormat,
  CalendarSkeleton,
  bookableStarts,
  type DisplayEvent,
} from "@/components/calendar/calendarShared";

type CalEvent = DisplayEvent;

/** Keep the teacher's start-window control current without a navigation. */
function useNow(intervalMs = 30_000): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}

export default function TeacherCalendarPage() {
  const [view, setView] = useRememberedView("omnic.cal.view.teacher");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [movingEventId, setMovingEventId] = useState<Id<"scheduleEvents"> | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [availabilityDirty, setAvailabilityDirty] = useState(false);
  function toggleAvailability() {
    if (availabilityDirty) { toast.error("Save or discard your changes first"); return; }
    setAvailabilityOpen(value => !value);
  }

  // Visible range per view (±1 day buffer for timezone shifts)
  const { fromDate, toDate } = useMemo(
    () => calendarRange(view, currentDate),
    [currentDate, view]
  );

  const me = useQuery(api.users.getMe);
  const [viewerTz, setViewerTz] = useViewerTz(me?.timezone);
  const [timeFmt, setTimeFmt] = useTimeFormat(me?.timeFormat);
  const cal = useQuery(api.calendar.getTeacherCalendar, { fromDate, toDate });
  const orgTz = cal?.orgTz ?? viewerTz;
  const nowMs = useNow(30_000);
  const preview = useQuery(
    api.calendar.actionPreview,
    selectedEvent || movingEventId ? { eventId: (selectedEvent?._id ?? movingEventId) as Id<"scheduleEvents"> } : "skip"
  );

  const attention = useQuery(api.calendar.needsAttention, {});
  const createLesson = useMutation(api.lessons.create);

  // Rename a lesson straight from the grid (§ second brain dump).
  const renameEvent = useMutation(api.calendar.renameEvent);
  const [renameId, setRenameId] = useState<Id<"scheduleEvents"> | null>(null);
  const [renameValue, setRenameValue] = useState("");
  async function doRename() {
    if (!renameId) return;
    try {
      await renameEvent({ eventId: renameId, title: renameValue });
      toast.success("Lesson renamed");
      setRenameId(null);
    } catch (e) {
      toast.error(errText(e));
    }
  }

  const [starting, setStarting] = useState(false);

  /** Start the live session for a lesson (C-7/P1 — one link from the grid). */
  async function startSession(ev: CalEvent) {
    if (!ev.studentId) return;
    setStarting(true);
    try {
      const id = await createLesson({
        studentId: ev.studentId,
        title: ev.title,
        scheduledFor: zonedToInstant(ev.orgDate, ev.orgStartTime, orgTz).toISOString(),
        recordingMode: "live",
        scheduleEventId: ev._id as Id<"scheduleEvents">,
      });
      window.location.href = `/teacher/sessions/${id}/live`;
    } catch (e) {
      toast.error(errText(e));
      setStarting(false);
    }
  }

  const cancelEvent = useMutation(api.calendar.cancelEvent);
  const rescheduleEvent = useMutation(api.calendar.rescheduleEvent);
  const blockTimeOff = useMutation(api.calendar.blockTimeOff);
  const unblockTimeOff = useMutation(api.calendar.unblockTimeOff);

  const [showCancelled, setShowCancelled] = useState(false);

  // Staff can schedule a half-hour start outside published availability.
  const createOneTime = useMutation(api.calendar.createOneTimeLesson);
  const myStudents =
    useQuery(
      api.users.getStudentsForTeacher,
      me?.externalId ? { teacherId: me.externalId } : "skip"
    ) ?? [];
  const [oneTimeOpen, setOneTimeOpen] = useState(false);
  const [oneTimeStudent, setOneTimeStudent] = useState("");
  const [oneTimeDate, setOneTimeDate] = useState("");
  const [oneTimeTime, setOneTimeTime] = useState("");
  const [oneTimeBusy, setOneTimeBusy] = useState(false);

  function openOneTime() {
    // Default to the viewed day and the next academy half-hour.
    const wall = convertZoned(format(new Date(), "yyyy-MM-dd"), format(new Date(), "HH:mm"), Intl.DateTimeFormat().resolvedOptions().timeZone, orgTz);
    const mins = Math.min(1380, Math.ceil((Number(wall.time.slice(0, 2)) * 60 + Number(wall.time.slice(3))) / 30) * 30);
    setOneTimeDate(format(currentDate, "yyyy-MM-dd"));
    setOneTimeTime(`${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`);
    setOneTimeStudent("");
    setOneTimeOpen(true);
  }

  async function submitOneTime() {
    if (!oneTimeStudent || !oneTimeDate || !oneTimeTime) return;
    setOneTimeBusy(true);
    try {
      const result = await createOneTime({studentId: oneTimeStudent, date: oneTimeDate, startTime: oneTimeTime});
      toast.success(result.unpaid ? "Lesson added — admin will settle the unpaid lesson" : "Lesson added — 1 lesson used");
      setOneTimeOpen(false);
    } catch (error) { toast.error(errText(error)); }
    finally { setOneTimeBusy(false); }
  }

  const [timeOffOpen, setTimeOffOpen] = useState(false);
  const [timeOffFrom, setTimeOffFrom] = useState("");
  const [timeOffTo, setTimeOffTo] = useState("");

  async function doTimeOff(block: boolean) {
    if (!timeOffFrom || !timeOffTo) {
      toast.error("Pick both dates");
      return;
    }
    try {
      if (block) {
        const r = await blockTimeOff({ fromDate: timeOffFrom, toDate: timeOffTo });
        toast.success(
          r.affectedLessons > 0
            ? `Blocked ${r.blockedDays} day(s) — ${r.affectedLessons} lesson(s) inside still need moving or cancelling`
            : `Blocked ${r.blockedDays} day(s)`
        );
      } else {
        const r = await unblockTimeOff({ fromDate: timeOffFrom, toDate: timeOffTo });
        toast.success(`Removed ${r.removed} blocked day(s)`);
      }
      setTimeOffOpen(false);
    } catch (e) {
      toast.error(errText(e));
    }
  }

  const zoned = useZonedCalendar(cal, viewerTz);
  const events = zoned.events as CalEvent[];
  const [moveWindow, setMoveWindow] = useState<{date: string; startTime: string; endTime: string} | null>(null);
  const [moveStart, setMoveStart] = useState("");
  const moveOptions = moveWindow ? bookableStarts(
    zoned.openRanges.find(range => range.date === moveWindow.date && range.startTime === moveWindow.startTime) ?? moveWindow,
    events.filter(event => event._id !== movingEventId && (event.status === "scheduled" || event.status === "makeup")),
    60, 0, 30,
  ) : [];
  async function confirmMove() {
    if (!moveWindow || !moveStart || !movingEventId) return;
    const target = convertZoned(moveWindow.date, moveStart, viewerTz, orgTz);
    try {
      await rescheduleEvent({eventId: movingEventId, toDate: target.date, toStartTime: target.time});
      toast.success("Lesson moved — student notified");
      setMoveWindow(null); setMovingEventId(null);
    } catch (error) { toast.error(errText(error)); }
  }

  const activeEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          e.status === "scheduled" ||
          e.status === "makeup" ||
          // Terminal outcomes are shown as history (colored + labelled) so a
          // past lesson reads as Done / No-show, not a still-open slot.
          e.status === "completed" ||
          e.status === "no_show_student" ||
          e.status === "no_show_teacher" ||
          (showCancelled && e.status === "cancelled")
      ),
    [events, showCancelled]
  );
  const gridUsers = useMemo(
    () =>
      events
        .filter((e) => e.studentId && e.studentName)
        .map((e) => ({ externalId: e.studentId!, name: e.studentName! })),
    [events]
  );

  /**
   * §14.6 hover card — the facts a teacher wants before clicking: who, when
   * in both clocks, how many lessons they have left, when they last came.
   */
  function renderEventHover(ev: ScheduleEvent) {
    const e = ev as CalEvent;
    const info = e.studentId ? cal?.students?.[e.studentId] : undefined;
    const initials =
      (info?.name ?? e.studentName ?? "?")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2) || "?";
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>
            {initials}
          </span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            {info?.name ?? e.studentName ?? "Student"}
          </span>
        </div>
        <div className="body-sm" style={{ fontSize: 12 }}>
          {viewerAndStudentTime(
            e.orgDate,
            e.orgStartTime,
            orgTz,
            viewerTz,
            info?.timezone,
            timeFmt,
            (info?.name ?? e.studentName ?? "student").split(" ")[0] + "'s"
          )}
        </div>
        {info && (
          <div className="body-sm" style={{ fontSize: 12 }}>
            {info.balance} lesson{info.balance === 1 ? "" : "s"} left
            {info.balance === 0 && (
              <span style={{ color: "var(--omnic-red)", fontWeight: 600 }}> · needs a top-up</span>
            )}
          </div>
        )}
        <div className="body-sm" style={{ fontSize: 12 }}>
          {info?.lastLessonDate
            ? `Last lesson ${info.lastLessonDate}`
            : "No completed lessons yet"}
        </div>
        {e.status === "cancelled" && (
          <div className="body-sm" style={{ fontSize: 12, fontWeight: 600 }}>
            Cancelled
          </div>
        )}
      </div>
    );
  }

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
      setCurrentDate(parseISO(match.date));
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

  // Availability changes use the source-backed editor below. Empty grid cells
  // are intentionally read-only here; this prevents a second writer from
  // bypassing its source precondition and booked-lesson protection.
  async function doCancel() {
    if (!selectedEvent) return;
    try {
      const r = await cancelEvent({ eventId: selectedEvent._id as Id<"scheduleEvents"> });
      toast.success(
        r?.charged ? "Lesson cancelled — lesson was charged" : "Lesson cancelled — credited back"
      );
    } catch (e) {
      toast.error(errText(e));
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <h1 className="h1" style={{ margin: 0 }}>Calendar</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {availabilityOpen ? "Select the half-hour cells you want to open." : `${upcomingCount} lessons in view · 55 minutes of teaching per lesson`}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" onClick={openOneTime}>Add lesson</button>
          <button className="btn btn-secondary" onClick={toggleAvailability} disabled={!me?.externalId}>{availabilityOpen ? "Back to schedule" : "Working hours"}</button>
          <details className="relative">
            <summary className="btn btn-secondary cursor-pointer list-none">More ···</summary>
            <div className="absolute end-0 z-30 mt-2 flex min-w-64 flex-col gap-3 rounded-xl border bg-background p-4 shadow-lg">
              <button className="btn btn-secondary" onClick={() => setTimeOffOpen(true)}>Time off</button>
              <Link href="/teacher/profile" className="btn btn-secondary">Meeting room & profile</Link>
              <TimezoneSelect value={viewerTz} onChange={setViewerTz} />
              <TimeFormatToggle value={timeFmt} onChange={setTimeFmt} />
              <label className="body-sm flex items-center gap-2"><input type="checkbox" checked={showCancelled} onChange={event => setShowCancelled(event.target.checked)} />Show cancelled lessons</label>
            </div>
          </details>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <LegendSwatch color="rgba(16,185,129,0.25)" label="Open" />
        <LegendSwatch color="var(--brand-purple-tint)" label="Lesson" />
        <span className="body-sm ms-auto">{viewerTz.replace(/_/g, " ")}</span>
      </div>

      {/* Move-mode banner */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        {movingEventId && (
          <span className="pill" style={{ background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>
            Pick a green slot for the lesson — or{" "}
            <button style={{ textDecoration: "underline", border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0 }} onClick={() => setMovingEventId(null)}>
              cancel move
            </button>
          </span>
        )}
      </div>

      {/* C-7 — Needs attention inbox */}
      {attention && (attention.conflicts.length > 0 ||
        attention.noBalance.length > 0 ||
        attention.unpaid.length > 0 ||
        attention.unreviewedHomework.length > 0 ||
        attention.unpublishedNotes.length > 0) && (
        <details className="card mb-3 border-amber-400 bg-amber-50 p-3">
          <summary className="h3 cursor-pointer">Needs attention ({attention.conflicts.length + attention.noBalance.length + attention.unpaid.length + attention.unreviewedHomework.length + attention.unpublishedNotes.length})</summary>
          {attention.conflicts.map((c) => (
            <div key={c._id} className="body-sm" style={{ padding: "4px 0" }}>
              ⚠️ <strong>{c.studentName ?? "Lesson"}</strong> on {c.date} at {formatTime(c.startTime, timeFmt)} sits in
              time you have blocked — move or cancel it.{" "}
              <button
                style={{ textDecoration: "underline", border: "none", background: "none", cursor: "pointer", padding: 0, color: "inherit" }}
                onClick={() => {
                  const match = events.find((e) => e._id === c._id);
                  if (match) {
                    setCurrentDate(parseISO(match.date));
                    setSelectedEvent(match);
                  } else {
                    setCurrentDate(parseISO(c.date));
                  }
                }}
              >
                Open
              </button>
            </div>
          ))}
          {attention.noBalance.map((n) => (
            <div key={n._id} className="body-sm" style={{ padding: "4px 0" }}>
              💳 <strong>{n.studentName ?? "Student"}</strong> has no lessons left — their weekly
              slot ({["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][n.dayOfWeek]} {formatTime(n.startTime, timeFmt)}) will be
              skipped until the balance is topped up.
            </div>
          ))}
          {attention.unpaid.map((u) => (
            <div key={u._id} className="body-sm" style={{ padding: "4px 0" }}>
              🧾 <strong>{u.studentName ?? "Student"}</strong> had a one-time lesson on {u.date} at{" "}
              {formatTime(u.startTime, timeFmt)} with no lesson credit left — it was recorded
              anyway and still needs settling in Billing.
            </div>
          ))}
          {attention.unreviewedHomework.map((h) => (
            <div key={h._id} className="body-sm" style={{ padding: "4px 0" }}>
              📩 <strong>{h.studentName ?? "Student"}</strong> submitted <strong>{h.title}</strong> —
              review it{h.lessonId ? " " : "."}
              {h.lessonId && (
                <a href={`/teacher/sessions/${h.lessonId}`} style={{ textDecoration: "underline", color: "inherit" }}>
                  in the session
                </a>
              )}
              .
            </div>
          ))}
          {attention.unpublishedNotes.map((n) => (
            <div key={n._id} className="body-sm" style={{ padding: "4px 0" }}>
              📝 <strong>{n.studentName ?? "Student"}</strong> — <strong>{n.title}</strong> has no published notes after 24 hours.
            </div>
          ))}
        </details>
      )}

      {/* First-run hint — no availability opened yet (§14.6 empty states) */}
      {cal && zoned.openSlotKeys.length === 0 && activeEvents.length === 0 && (
        <div
          className="card"
          style={{
            padding: 14,
            marginBottom: 12,
            borderColor: "var(--brand-purple)",
            background: "var(--omnic-tenant-primary-soft)",
          }}
        >
          <strong>No open hours in this view.</strong>{" "}
          <span className="body-sm">
            Open Working hours to select and save your half-hour cells. Students and your admin can only book inside open
            (green) slots.
          </span>
        </div>
      )}

      {/* Grid */}
      <div className="card" style={{ padding: 16, marginBottom: 24 }}>
        {availabilityOpen && me?.externalId ? <AvailabilityBoard teacherId={me.externalId} teacherName={me.name} onDirtyChange={setAvailabilityDirty} /> : cal === undefined ? (
          <CalendarSkeleton columns={view === "day" ? 1 : 7} />
        ) : view === "month" ? (
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
            timeFormat={timeFmt}
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
            onJumpToDate={(d) => setCurrentDate(d)}
            onEventDrop={(ev, date, time) => {
              setMovingEventId(ev._id as Id<"scheduleEvents">);
              setMoveWindow({date,startTime:time,endTime:time === "23:00" ? "24:00" : `${String(Number(time.slice(0,2))+1).padStart(2,"0")}:${time.slice(3)}`});
              setMoveStart(time);

            }}
            preferenceKey={me?.externalId}
            viewerTz={viewerTz}
            granularity={30}
            onRangeClick={(date, startTime, endTime) => { if (movingEventId) { setMoveStart(""); setMoveWindow({date, startTime, endTime}); } }}
            openRanges={zoned.openRanges}
            moveMode={!!movingEventId}
            headerExtra={viewSwitcher}
            timeFormat={timeFmt}
            renderEventHover={renderEventHover}
          />
        )}
        {view === "month" && (
          <div className="body-sm" style={{ marginTop: 8 }}>
            Open Working hours to edit availability.
          </div>
        )}
      </div>

      <Dialog open={!!moveWindow} onOpenChange={open => {if (!open) setMoveWindow(null);}}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Move lesson</DialogTitle></DialogHeader>
          <p className="body-sm">{moveWindow?.date} · Choose a new start · {viewerTz}</p>
          <div className="grid grid-cols-3 gap-2">{moveOptions.map(time => <Button key={time} variant={moveStart === time ? "default" : "outline"} onClick={() => setMoveStart(time)}>{formatTime(time, timeFmt)}</Button>)}</div>
          {!moveOptions.length && <p>No full lesson fits here.</p>}
          {moveStart && <p className="body-sm">{formatTime(moveStart, timeFmt)} · 60-minute reservation, 55 minutes teaching</p>}
          <p className="body-sm text-muted-foreground">{preview?.reschedule.reason}</p>
          <Button disabled={!moveStart || !preview?.reschedule.allowed} onClick={confirmMove}>Move to this time</Button>
        </DialogContent>
      </Dialog>

      {/* One-time lesson — any time, including outside published hours */}
      <Dialog open={oneTimeOpen} onOpenChange={(o) => !o && setOneTimeOpen(false)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add lesson</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-zinc-500">
              Choose two half-hour cells for a 60-minute reservation, including outside your open hours. Teach for 55 minutes; take the final five minutes as a break.
            </p>

            <label className="text-sm font-medium">Student</label>
            <select
              className="select"
              value={oneTimeStudent}
              onChange={(e) => setOneTimeStudent(e.target.value)}
            >
              <option value="">Pick a student…</option>
              {myStudents.map((s: any) => (
                <option key={s.externalId} value={s.externalId}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="flex flex-wrap gap-3">
              <div style={{ flex: "1 1 140px" }}>
                <label className="text-sm font-medium">Date</label>
                <Input
                  type="date"
                  value={oneTimeDate}
                  onChange={(e) => setOneTimeDate(e.target.value)}
                />
              </div>
              <div style={{ flex: "1 1 110px" }}>
                <label className="text-sm font-medium">Start</label>
                <select className="select" aria-label="Lesson start" value={oneTimeTime} onChange={event => setOneTimeTime(event.target.value)}>
                  {Array.from({length: 47}, (_, index) => { const minute = index * 30; const time = `${String(Math.floor(minute / 60)).padStart(2,"0")}:${String(minute % 60).padStart(2,"0")}`; return <option key={time} value={time}>{formatTime(time,timeFmt)}</option>; })}
                </select>
              </div>
            </div>
            <p className="body-sm">Times in {orgTz}. {oneTimeTime && `${formatTime(oneTimeTime,timeFmt)}–${formatTime(`${String(Number(oneTimeTime.slice(0,2))+1).padStart(2,"0")}:${oneTimeTime.slice(3)}`,timeFmt)}`} · 1 lesson</p>

            <div className="flex flex-col gap-2">
              <Button disabled={oneTimeBusy || !oneTimeStudent} onClick={submitOneTime}>
                {oneTimeBusy ? "Adding…" : "Add to calendar"}
              </Button>

            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Time off dialog */}
      <Dialog open={timeOffOpen} onOpenChange={setTimeOffOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Time off</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-zinc-500">
              Close these dates to new bookings. Move or cancel booked lessons first.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">From</label>
                <Input type="date" value={timeOffFrom} onChange={(e) => setTimeOffFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">To</label>
                <Input type="date" value={timeOffTo} onChange={(e) => setTimeOffTo(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => doTimeOff(true)}>
                Block range
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => doTimeOff(false)}>
                Unblock range
              </Button>
            </div>
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
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {/* The title itself is the rename control — clicking a name to
                  edit it is the expected gesture; a separate Rename button is
                  a step nobody needs. */}
              {renameId && renameId === selectedEvent?._id ? (
                <Input
                  value={renameValue}
                  autoFocus
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={doRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void doRename();
                    if (e.key === "Escape") setRenameId(null);
                  }}
                  style={{ fontSize: "inherit", fontWeight: "inherit" }}
                />
              ) : (
                <span
                  role="button"
                  tabIndex={0}
                  title="Click to rename"
                  onClick={() => {
                    if (!selectedEvent) return;
                    setRenameValue(selectedEvent.title);
                    setRenameId(selectedEvent._id as Id<"scheduleEvents">);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" || !selectedEvent) return;
                    setRenameValue(selectedEvent.title);
                    setRenameId(selectedEvent._id as Id<"scheduleEvents">);
                  }}
                  style={{
                    cursor: "text",
                    borderBottom: "1px dashed var(--omnic-gray-300)",
                  }}
                >
                  {selectedEvent?.title}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-3">
              <p className="text-sm">
                {selectedEvent.studentName ?? "No student"} · {selectedEvent.date}
              </p>
              <p className="text-sm text-zinc-500">
                {viewerAndStudentTime(
                  selectedEvent.orgDate,
                  selectedEvent.orgStartTime,
                  orgTz,
                  viewerTz,
                  selectedEvent.studentId
                    ? cal?.students?.[selectedEvent.studentId]?.timezone
                    : null,
                  timeFmt,
                  (selectedEvent.studentName ?? "student").split(" ")[0] + "'s"
                )}
              </p>
              {selectedEvent.googleMeetLink && (
                <a
                  href={selectedEvent.googleMeetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                  }}
                >
                  <ExternalLink size={14} className="me-1.5" />
                  Go to Google Meet
                </a>
              )}

              {!confirmingCancel ? (
                <div className="flex flex-col gap-2">
                  {(() => {
                    // Resolve from the academy-tz values: the display values
                    // are in the viewer's chosen zone, which need not be the
                    // browser's, and `new Date("...")` assumes browser-local.
                    const startMs = zonedToInstant(
                      selectedEvent.orgDate,
                      selectedEvent.orgStartTime,
                      orgTz
                    ).getTime();
                    // same-day and not long past → offer to start, but never
                    // for a lesson that already concluded (done / no-show /
                    // cancelled) — the backend rejects it and the calendar
                    // shows it as history.
                    const terminal = [
                      "completed",
                      "cancelled",
                      "no_show_student",
                      "no_show_teacher",
                    ].includes(selectedEvent.status);
                    const active = (selectedEvent as any).activeLessonId as
                      | string
                      | null;
                    // Already recording → resume it rather than starting a
                    // second session for the same slot.
                    if (active && !terminal) {
                      return (
                        <Button
                          onClick={() => {
                            window.location.href = `/teacher/sessions/${active}/live`;
                          }}
                          style={{ background: "#059669" }}
                        >
                          Resume session
                        </Button>
                      );
                    }
                    if (terminal) return null;
                    // §8 — a lesson is startable from 10 minutes before its
                    // scheduled time until shortly after it would have ended
                    // (same window the sessions list uses, same numbers the
                    // server enforces). Outside that window starting is a
                    // mistake, not a choice: too far ahead opens next week's
                    // lesson, and long past the end the honest outcome is a
                    // no-show, not a retroactive recording.
                    const lessonMins = cal?.lessonMinutes ?? 60;
                    const win = sessionStartWindow({
                      nowMs,
                      startMs,
                      lessonMinutes: lessonMins,
                    });
                    const tooEarly = win.kind === "before";
                    const tooLate = win.kind === "tooLate";
                    if (tooEarly || tooLate) {
                      return (
                        <p className="text-xs text-zinc-500">
                          {win.kind === "before"
                            ? `Can be started from ${
                                LESSON_START_EARLY_MINUTES
                              } minutes before — that's ${
                                Math.round(win.minutesUntil / 60) >= 1
                                  ? `${Math.round(win.minutesUntil / 60)}h`
                                  : `${Math.round(win.minutesUntil)} min`
                              } away.`
                            : "This lesson's time has passed — mark it as a no-show instead of starting it."}
                        </p>
                      );
                    }
                    const early = win.minutesUntil >= 0;
                    return (
                      <>
                        <Button
                          disabled={starting}
                          onClick={() => startSession(selectedEvent)}
                          style={{ background: "#059669" }}
                        >
                          {starting
                            ? "Starting…"
                            : early
                              ? "Start early"
                              : "Start session"}
                        </Button>
                        {early && (
                          <p className="text-xs text-zinc-500">
                            Starts in {Math.round(win.minutesUntil / 60) >= 1
                              ? `${Math.round(win.minutesUntil / 60)}h`
                              : `${Math.round(win.minutesUntil)} min`}
                            . Starting now is fine — discard it if you opened it
                            by mistake and the booking stays untouched.
                          </p>
                        )}
                      </>
                    );
                  })()}
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
