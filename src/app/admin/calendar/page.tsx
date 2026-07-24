"use client";

// §13.10 — Admin calendar: pick a teacher, see their Open/Busy/Lesson grid,
// click an open slot to assign a student (deducts 1 lesson credit at
// booking — Z.A.CAL-1 fixed). Lessons get policy-aware Move/Cancel (admin
// bypasses the 7-day horizon).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { addDays, addMonths, format } from "date-fns";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { Icon } from "@/components/shared/icons";
import { WeeklyCalendar, type ScheduleEvent } from "@/components/calendar/WeeklyCalendar";
import { MonthCalendar } from "@/components/calendar/MonthCalendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { toast } from "sonner";
import { errText } from "@/lib/convexError";
import { formatTime } from "@/lib/timeFormat";
import { convertZoned } from "@/lib/tz";
import {
  calendarRange,
  useViewerTz,
  useZonedCalendar,
  useRememberedView,
  dualTime,
  TimezoneSelect,
  TimeFormatToggle,
  useTimeFormat,
  CalendarSkeleton,
  bookableStarts,
  type DisplayEvent,
} from "@/components/calendar/calendarShared";

type CalEvent = DisplayEvent;

export default function AdminCalendarPage() {
  const [view, setView] = useRememberedView("omnic.cal.view.admin");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [teacherId, setTeacherId] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [movingEventId, setMovingEventId] = useState<Id<"scheduleEvents"> | null>(null);
  // Open window clicked (viewer tz) + the start picked inside it. `move`
  // distinguishes rescheduling an existing lesson from a fresh assignment.
  const [pickWindow, setPickWindow] = useState<{
    date: string;
    startTime: string;
    endTime: string;
    move: boolean;
    eventId?: Id<"scheduleEvents">;
  } | null>(null);
  const [pickStart, setPickStart] = useState<string | null>(null);
  const [assignStudentId, setAssignStudentId] = useState("");
  const [assignMeetLink, setAssignMeetLink] = useState("");
  const [assigning, setAssigning] = useState(false);

  const allUsers = useQuery(api.users.listAllUsers) ?? [];
  const balances = useQuery(api.points.getBalancesForOrg, {}) ?? [];
  const pending = useQuery(api.schedule.listPendingReschedules, {}) ?? [];
  const unaccounted = useQuery(api.schedule.listPendingUnaccounted, {}) ?? [];

  const teachers = useMemo(
    () => allUsers.filter((u: any) => u.role === "teacher"),
    [allUsers]
  );
  const students = useMemo(
    () => allUsers.filter((u: any) => u.role === "student"),
    [allUsers]
  );
  const balanceMap = useMemo(
    () => new Map(balances.map((b: any) => [b.studentId, b.balance])),
    [balances]
  );

  // Default to the first teacher
  useEffect(() => {
    if (!teacherId && teachers.length > 0) setTeacherId(teachers[0].externalId);
  }, [teacherId, teachers]);

  const { fromDate, toDate } = useMemo(
    () => calendarRange(view, currentDate),
    [currentDate, view]
  );

  const me = useQuery(api.users.getMe);
  const [viewerTz, setViewerTz] = useViewerTz(me?.timezone);
  const [timeFmt, setTimeFmt] = useTimeFormat(me?.timeFormat);

  const ALL_TEACHERS = "__all__";
  const allMode = teacherId === ALL_TEACHERS;
  const calOne = useQuery(
    api.calendar.getAdminCalendar,
    teacherId && !allMode ? { teacherId, fromDate, toDate } : "skip"
  );
  const calAll = useQuery(
    api.calendar.getAllTeachersCalendar,
    allMode ? { fromDate, toDate } : "skip"
  );
  const cal = allMode ? calAll : calOne;
  const orgTz = cal?.orgTz ?? viewerTz;
  const preview = useQuery(
    api.calendar.actionPreview,
    selectedEvent ? { eventId: selectedEvent._id as Id<"scheduleEvents"> } : "skip"
  );

  const attention = useQuery(api.calendar.needsAttention, {});
  const assignLesson = useMutation(api.calendar.assignLesson);
  const cancelEvent = useMutation(api.calendar.cancelEvent);
  const rescheduleEvent = useMutation(api.calendar.rescheduleEvent);

  const zoned = useZonedCalendar(cal, viewerTz);
  const events = zoned.events as CalEvent[];
  const lessonMin = cal?.lessonMinutes ?? 60;
  const bufferMin = cal?.bufferMinutes ?? 10;
  const gran = cal?.granularity ?? 15;
  const startOptions = useMemo(
    () =>
      pickWindow
        ? bookableStarts(pickWindow, zoned.busy, lessonMin, bufferMin, gran)
        : [],
    [pickWindow, zoned.busy, lessonMin, bufferMin, gran]
  );
  const activeEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          e.status === "scheduled" ||
          e.status === "makeup" ||
          e.status === "completed" ||
          e.status === "no_show_student" ||
          e.status === "no_show_teacher"
      ),
    [events]
  );
  const gridUsers = useMemo(
    () =>
      events
        .filter((e) => e.studentId && e.studentName)
        .map((e) => ({
          externalId: e.studentId!,
          // All-teachers overview: attribute each block to its teacher.
          name:
            allMode && (e as any).teacherName
              ? `${e.studentName} · ${(e as any).teacherName}`
              : e.studentName!,
        })),
    [events, allMode]
  );

  function navigate(step: -1 | 1) {
    setCurrentDate((d) =>
      view === "day"
        ? addDays(d, step)
        : view === "week"
          ? addDays(d, step * 7)
          : addMonths(d, step)
    );
  }

  function onRangeClick(date: string, startTime: string, endTime: string) {
    setPickStart(null);
    if (movingEventId) {
      setPickWindow({ date, startTime, endTime, move: true, eventId: movingEventId });
      return;
    }
    setAssignStudentId("");
    setAssignMeetLink("");
    setSelectedEvent(null);
    setPickWindow({ date, startTime, endTime, move: false });
  }

  async function doAssign(overrideBuffer = false) {
    if (!pickWindow || !pickStart) return;
    if (!pickWindow.move && !assignStudentId) {
      toast.error("Pick a student");
      return;
    }
    const org = convertZoned(pickWindow.date, pickStart, viewerTz, orgTz);
    setAssigning(true);
    try {
      if (pickWindow.move && pickWindow.eventId) {
        await rescheduleEvent({
          eventId: pickWindow.eventId,
          toDate: org.date,
          toStartTime: org.time,
        });
        toast.success("Lesson moved — both parties notified");
        setMovingEventId(null);
      } else {
        await assignLesson({
          teacherId,
          studentId: assignStudentId,
          date: org.date,
          startTime: org.time,
          googleMeetLink: assignMeetLink || undefined,
          overrideBuffer,
        });
        toast.success("Lesson assigned — 1 lesson deducted, both notified");
      }
      setPickWindow(null);
    } catch (e) {
      const msg = errText(e);
      // Soft rest-break warning (POLICY §5) — let the admin confirm through.
      if (msg.startsWith("BUFFER:")) {
        const note = msg.split(":").slice(3).join(":");
        toast.warning(note || "Too close to another lesson", {
          action: { label: "Assign anyway", onClick: () => void doAssign(true) },
          duration: 12_000,
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setAssigning(false);
    }
  }

  async function doCancel() {
    if (!selectedEvent) return;
    try {
      await cancelEvent({ eventId: selectedEvent._id as Id<"scheduleEvents"> });
      toast.success("Lesson cancelled — credited back");
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

  const selectedTeacher = teachers.find((t: any) => t.externalId === teacherId);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <h1 className="h1" style={{ margin: 0 }}>Calendar</h1>
          <div className="body" style={{ marginTop: 4 }}>
            Click a green slot to assign a lesson · click a lesson to move or cancel
            {pending.length > 0 ? ` · ${pending.length} pending reschedule${pending.length === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <Link href="/admin/settings#scheduling" className="btn btn-secondary">
          <Icon name="settings" size={14} /> Scheduling rules
        </Link>
      </div>

      {/* Teacher picker + legend */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 220 }}>
          <Select value={teacherId} onValueChange={(v) => setTeacherId(v ?? "")}>
            <SelectTrigger>
              <span>
                {allMode
                  ? "All teachers (overview)"
                  : (selectedTeacher?.name ?? "Pick a teacher")}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TEACHERS}>All teachers (overview)</SelectItem>
              {teachers.map((t: any) => (
                <SelectItem key={t.externalId} value={t.externalId}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {allMode && (
          <span className="pill" style={{ background: "#EEF2FF", color: "#3730A3", fontWeight: 600 }}>
            Read-only overview — pick a teacher to assign or edit
          </span>
        )}
        <LegendSwatch color="rgba(16,185,129,0.25)" label="Open — click to assign" />
        <LegendSwatch color="var(--omnic-gray-100)" label="Busy" />
        <LegendSwatch color="var(--brand-purple-tint, rgba(103,22,164,0.15))" label="Lesson" />
        <span className="body-sm" style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          Timezone <TimezoneSelect value={viewerTz} onChange={setViewerTz} />
          <TimeFormatToggle value={timeFmt} onChange={setTimeFmt} />
        </span>
        {movingEventId && (
          <span className="pill" style={{ background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>
            Pick a green slot —{" "}
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
        attention.unreviewedHomework.length > 0) && (
        <div
          className="card"
          style={{ padding: 14, marginBottom: 12, borderColor: "#D97706", background: "#FFFBEB" }}
        >
          <div className="h3" style={{ marginBottom: 6 }}>Needs attention</div>
          {attention.conflicts.map((c) => (
            <div key={c._id} className="body-sm" style={{ padding: "4px 0" }}>
              ⚠️ {c.teacherName ? `${c.teacherName} — ` : ""}
              <strong>{c.studentName ?? "Lesson"}</strong> on {c.date} at {formatTime(c.startTime, timeFmt)} sits in
              blocked time — move or cancel it.
            </div>
          ))}
          {attention.noBalance.map((n) => (
            <div key={n._id} className="body-sm" style={{ padding: "4px 0" }}>
              💳 <strong>{n.studentName ?? "Student"}</strong> has no lessons left — weekly slot
              ({["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][n.dayOfWeek]} {formatTime(n.startTime, timeFmt)}) will be
              skipped. Grant lessons in Billing.
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
              waiting for the teacher to review.
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        {!teacherId ? (
          <div className="body" style={{ padding: 40, textAlign: "center" }}>
            No teachers yet — invite one first.
          </div>
        ) : cal === undefined ? (
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
              if (!movingEventId) {
                setPickWindow(null);
                setSelectedEvent(e as CalEvent);
              }
            }}
            onJumpToDate={(d) => setCurrentDate(d)}
            openRanges={allMode ? undefined : zoned.openRanges}
            onRangeClick={allMode ? undefined : onRangeClick}
            moveMode={!allMode && !!movingEventId}
            headerExtra={viewSwitcher}
            timeFormat={timeFmt}
          />
        )}
      </div>

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

      {/* Assign / move picker — choose a start time inside the open window */}
      <Dialog
        open={!!pickWindow}
        onOpenChange={(o) => {
          if (!o) {
            setPickWindow(null);
            setPickStart(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pickWindow?.move ? "Move lesson" : "Assign lesson"} —{" "}
              {pickWindow
                ? format(new Date(`${pickWindow.date}T12:00:00`), "EEE, MMM d")
                : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-zinc-500">
              Teacher: {selectedTeacher?.name ?? "—"} · open{" "}
              {pickWindow
                ? `${formatTime(pickWindow.startTime, timeFmt)}–${formatTime(
                    pickWindow.endTime === "24:00" ? "00:00" : pickWindow.endTime,
                    timeFmt
                  )}`
                : ""}
              {" "}· {lessonMin}-min lesson, {bufferMin}-min break each side
            </p>

            {startOptions.length === 0 ? (
              <p className="text-sm text-amber-600">
                No {lessonMin}-minute start fits in this window with the required
                break.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {startOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPickStart(s)}
                    className={`rounded-md border px-2 py-1.5 text-sm tabular-nums transition-colors ${
                      pickStart === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    {formatTime(s, timeFmt)}
                  </button>
                ))}
              </div>
            )}

            {pickStart && pickWindow && (
              <p className="text-sm text-zinc-500">
                {dualTime(
                  convertZoned(pickWindow.date, pickStart, viewerTz, orgTz).date,
                  convertZoned(pickWindow.date, pickStart, viewerTz, orgTz).time,
                  orgTz,
                  viewerTz,
                  timeFmt
                )}
              </p>
            )}

            {!pickWindow?.move && (
              <>
                <div>
                  <label className="text-sm font-medium">Student</label>
                  <Select value={assignStudentId} onValueChange={(v) => setAssignStudentId(v ?? "")}>
                    <SelectTrigger>
                      <span>
                        {students.find((s: any) => s.externalId === assignStudentId)?.name ??
                          "Pick a student"}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((s: any) => {
                        const bal = balanceMap.get(s.externalId) ?? 0;
                        return (
                          <SelectItem key={s.externalId} value={s.externalId}>
                            {s.name} · {bal} lesson{bal === 1 ? "" : "s"} left
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {assignStudentId && (balanceMap.get(assignStudentId) ?? 0) < 1 && (
                    <p className="mt-1 text-xs text-red-600">
                      No lessons on balance — grant lessons in Billing first.
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">Google Meet link (optional)</label>
                  <Input
                    value={assignMeetLink}
                    onChange={(e) => setAssignMeetLink(e.target.value)}
                    placeholder="https://meet.google.com/…"
                  />
                </div>
              </>
            )}

            <Button
              className="w-full"
              onClick={() => doAssign()}
              disabled={assigning || !pickStart || (!pickWindow?.move && !assignStudentId)}
            >
              {assigning
                ? "Saving…"
                : pickWindow?.move
                  ? "Move to this time"
                  : "Assign lesson (deducts 1 lesson)"}
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
                {selectedEvent.studentName ?? "No student"} · {selectedEvent.date}
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
                  Google Meet link
                </a>
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
