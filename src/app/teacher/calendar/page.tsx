"use client";

// §13.10 — Unified teacher calendar.
// One grid: Open slots (green), Busy (default), Lessons (colored blocks).
// Click empty cell → open/block, this date or every week.
// Click lesson → policy-aware Move / Cancel with consequence labels.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { addDays, addMonths, format, startOfWeek } from "date-fns";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
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
import { toast } from "sonner";
import { formatTime } from "@/lib/timeFormat";
import { convertZoned, zonedToInstant } from "@/lib/tz";
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
  type DisplayEvent,
} from "@/components/calendar/calendarShared";

type CalEvent = DisplayEvent;

export default function TeacherCalendarPage() {
  const [view, setView] = useRememberedView("omnic.cal.view.teacher");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [movingEventId, setMovingEventId] = useState<Id<"scheduleEvents"> | null>(null);
  const [pendingSlot, setPendingSlot] = useState<{
    date: string;
    time: string;
    isOpen: boolean;
  } | null>(null);

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
  const preview = useQuery(
    api.calendar.actionPreview,
    selectedEvent ? { eventId: selectedEvent._id as Id<"scheduleEvents"> } : "skip"
  );

  const attention = useQuery(api.calendar.needsAttention, {});
  const createLesson = useMutation(api.lessons.create);
  const setMeetLink = useMutation(api.users.setMeetLink);
  const [starting, setStarting] = useState(false);

  /** Start the live session for a lesson (C-7/P1 — one link from the grid). */
  async function startSession(ev: CalEvent) {
    if (!ev.studentId) return;
    setStarting(true);
    try {
      const id = await createLesson({
        studentId: ev.studentId,
        title: ev.title,
        scheduledFor: `${ev.orgDate}T${ev.orgStartTime}`,
        recordingMode: "live",
        scheduleEventId: ev._id as Id<"scheduleEvents">,
      });
      window.location.href = `/teacher/sessions/${id}/live`;
    } catch (e) {
      toast.error((e as Error).message);
      setStarting(false);
    }
  }

  const setSlotState = useMutation(api.calendar.setSlotState);
  const setWeeklySlot = useMutation(api.calendar.setWeeklySlot);
  const cancelEvent = useMutation(api.calendar.cancelEvent);
  const rescheduleEvent = useMutation(api.calendar.rescheduleEvent);
  const blockTimeOff = useMutation(api.calendar.blockTimeOff);
  const unblockTimeOff = useMutation(api.calendar.unblockTimeOff);

  const setSlotsBulk = useMutation(api.calendar.setSlotsBulk);
  const [bulkSlots, setBulkSlots] = useState<{ date: string; time: string }[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  async function applyBulk(open: boolean, scope: "date" | "weekly") {
    if (!bulkSlots) return;
    setBulkBusy(true);
    try {
      const orgSlots = bulkSlots.map((sl) => {
        const org = convertZoned(sl.date, sl.time, viewerTz, orgTz);
        return { date: org.date, startTime: org.time };
      });
      const r = await setSlotsBulk({ slots: orgSlots, open, scope });
      toast.success(
        `${open ? "Opened" : "Blocked"} ${r.applied} slot${r.applied === 1 ? "" : "s"}${
          scope === "weekly" ? " every week" : ""
        }${r.skippedLessons ? ` · ${r.skippedLessons} skipped (has a lesson)` : ""}`,
        {
          // §14.6 — reversible action: undo instead of a confirm dialog
          action: {
            label: "Undo",
            onClick: () => {
              setSlotsBulk({ slots: orgSlots, open: !open, scope })
                .then(() => toast.success("Reverted"))
                .catch((e) => toast.error((e as Error).message));
            },
          },
          duration: 10_000,
        }
      );
      setBulkSlots(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  // §14.6 brush: paint directly without a dialog; undo covers mistakes
  const [brush, setBrush] = useState<"off" | "open" | "block">("off");
  const [brushWeekly, setBrushWeekly] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);

  // §14.6 copy-week: replicate the viewed week's availability forward.
  const copyWeekMut = useMutation(api.calendar.copyWeekAvailability);
  const [copying, setCopying] = useState(false);
  async function copyWeek(weeks: number) {
    setCopying(true);
    try {
      const monday = startOfWeek(currentDate, { weekStartsOn: 1 });
      const fromMonday = format(monday, "yyyy-MM-dd");
      const toMondays = Array.from({ length: weeks }, (_, i) =>
        format(addDays(monday, (i + 1) * 7), "yyyy-MM-dd")
      );
      const r = await copyWeekMut({ fromMonday, toMondays });
      toast.success(
        `Copied this week to ${r.weeks} week${r.weeks === 1 ? "" : "s"} — ${r.copied} open window${r.copied === 1 ? "" : "s"}`
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCopying(false);
    }
  }

  /** Apply a brush stroke to slots (already in viewer tz). */
  async function paint(slots: { date: string; time: string }[]) {
    if (brush === "off" || slots.length === 0) return;
    const open = brush === "open";
    const scope = brushWeekly ? "weekly" : "date";
    const orgSlots = slots.map((sl) => {
      const org = convertZoned(sl.date, sl.time, viewerTz, orgTz);
      return { date: org.date, startTime: org.time };
    });
    try {
      const r = await setSlotsBulk({ slots: orgSlots, open, scope });
      toast.success(
        `${open ? "Opened" : "Blocked"} ${r.applied} slot${r.applied === 1 ? "" : "s"}${
          brushWeekly ? " every week" : ""
        }${r.skippedLessons ? ` · ${r.skippedLessons} skipped (has a lesson)` : ""}`,
        {
          action: {
            label: "Undo",
            onClick: () => {
              setSlotsBulk({ slots: orgSlots, open: !open, scope })
                .then(() => toast.success("Reverted"))
                .catch((e) => toast.error((e as Error).message));
            },
          },
          duration: 10_000,
        }
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // One-time lesson — deliberately not bound to the open-slot lattice, so a
  // teacher can log a lesson that really happened at 16:15 outside their
  // published hours. The mutation enforces overlap rules.
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
  const [oneTimeDuration, setOneTimeDuration] = useState("60");
  const [oneTimeBusy, setOneTimeBusy] = useState(false);

  function openOneTime() {
    // Default to the day being viewed, at the next quarter hour.
    const now = new Date();
    const mins = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15;
    setOneTimeDate(format(currentDate, "yyyy-MM-dd"));
    setOneTimeTime(
      `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
    );
    setOneTimeStudent("");
    setOneTimeDuration("60");
    setOneTimeOpen(true);
  }

  async function submitOneTime(startNow: boolean, overrideBuffer = false) {
    if (!oneTimeStudent) {
      toast.error("Pick a student");
      return;
    }
    if (!oneTimeDate || !oneTimeTime) {
      toast.error("Pick a date and time");
      return;
    }
    setOneTimeBusy(true);
    try {
      // Dialog values are in the viewer's timezone; the mutation wants org time.
      const org = convertZoned(oneTimeDate, oneTimeTime, viewerTz, orgTz);
      const r = await createOneTime({
        studentId: oneTimeStudent,
        date: org.date,
        startTime: org.time,
        durationMinutes: Number(oneTimeDuration) || 60,
        overrideBuffer,
      });
      toast.success(
        r.unpaid
          ? "Lesson added — student had no credit, so it's flagged unpaid for the admin"
          : "One-time lesson added — 1 lesson used"
      );
      setOneTimeOpen(false);
      if (startNow) {
        const id = await createLesson({
          studentId: oneTimeStudent,
          title: "One-time lesson",
          scheduledFor: `${org.date}T${org.time}`,
          recordingMode: "live",
          scheduleEventId: r.eventId as Id<"scheduleEvents">,
        });
        window.location.href = `/teacher/sessions/${id}/live`;
      }
    } catch (e) {
      const msg = (e as Error).message;
      // Soft rest-break warning (POLICY §5): let the teacher confirm through.
      if (msg.startsWith("BUFFER:")) {
        const note = msg.split(":").slice(3).join(":");
        toast.warning(note || "Too close to another lesson", {
          action: {
            label: "Add anyway",
            onClick: () => void submitOneTime(startNow, true),
          },
          duration: 12_000,
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setOneTimeBusy(false);
    }
  }

  const [roomOpen, setRoomOpen] = useState(false);
  const [roomLink, setRoomLink] = useState("");
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
      toast.error((e as Error).message);
    }
  }

  const zoned = useZonedCalendar(cal, viewerTz);
  const events = zoned.events as CalEvent[];
  const openSlotKeys = zoned.openSlotKeys;
  const keyToOrg = zoned.keyToOrg;
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
          {e.recurringBookingId && (
            <span className="pill" style={{ fontSize: 10, padding: "1px 6px" }} title="Weekly schedule">
              ↻ weekly
            </span>
          )}
        </div>
        <div className="body-sm" style={{ fontSize: 12 }}>
          {dualTime(e.orgDate, e.orgStartTime, orgTz, viewerTz, timeFmt)}
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
      // Move-mode: this cell is an open slot; convert to academy time
      const org = keyToOrg.get(`${date}|${time}`) ?? convertZoned(date, time, viewerTz, orgTz);
      rescheduleEvent({ eventId: movingEventId, toDate: org.date, toStartTime: org.time })
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
    if (brush !== "off") {
      void paint([{ date, time }]);
      return;
    }
    const isOpen = openSlotKeys.includes(`${date}|${time}`);
    setSelectedEvent(null);
    setPendingSlot({ date, time, isOpen });
  }

  async function applySlotChange(scope: "date" | "weekly") {
    if (!pendingSlot) return;
    const { date, time, isOpen } = pendingSlot;
    const org = convertZoned(date, time, viewerTz, orgTz);
    try {
      if (scope === "date") {
        await setSlotState({ date: org.date, startTime: org.time, open: !isOpen });
      } else {
        const dow = new Date(`${org.date}T12:00:00`).getDay();
        await setWeeklySlot({ dayOfWeek: dow, startTime: org.time, open: !isOpen });
      }
      toast.success(
        `${!isOpen ? "Opened" : "Blocked"} ${time} ${scope === "weekly" ? "every week" : `on ${date}`}`,
        {
          action: {
            label: "Undo",
            onClick: () => {
              const revert =
                scope === "date"
                  ? setSlotState({ date: org.date, startTime: org.time, open: isOpen })
                  : setWeeklySlot({
                      dayOfWeek: new Date(`${org.date}T12:00:00`).getDay(),
                      startTime: org.time,
                      open: isOpen,
                    });
              revert
                .then(() => toast.success("Reverted"))
                .catch((e) => toast.error((e as Error).message));
            },
          },
          duration: 10_000,
        }
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <h1 className="h1" style={{ margin: 0 }}>Calendar</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {upcomingCount} lesson{upcomingCount === 1 ? "" : "s"} in view · click an empty cell to open or block it · click a lesson to move or cancel
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={openOneTime}>
            One-time lesson
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setRoomLink(me?.meetLink ?? "");
              setRoomOpen(true);
            }}
          >
            Meeting room
          </button>
          <button className="btn btn-secondary" onClick={() => setTimeOffOpen(true)}>
            Time off
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <LegendSwatch color="rgba(16,185,129,0.25)" label="Open — bookable" />
        <LegendSwatch color="var(--omnic-gray-100)" label="Busy" />
        <LegendSwatch color="var(--brand-purple-tint, rgba(103,22,164,0.15))" label="Lesson" />
        <span className="body-sm" style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          Timezone <TimezoneSelect value={viewerTz} onChange={setViewerTz} />
          <TimeFormatToggle value={timeFmt} onChange={setTimeFmt} />
        </span>
      </div>

      {/* Brush toolbar — §14.6: painting is frequent + reversible, so it
          skips dialogs entirely and relies on the undo snackbar. */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <span className="body-sm" style={{ fontWeight: 600 }}>Tool:</span>
        {([
          { key: "off", label: "Select" },
          { key: "open", label: "Open brush" },
          { key: "block", label: "Block brush" },
        ] as const).map((b) => (
          <button
            key={b.key}
            className="chip"
            onClick={() => setBrush(b.key)}
            style={
              brush === b.key
                ? {
                    background:
                      b.key === "open" ? "#059669" : b.key === "block" ? "#B45309" : "var(--brand-purple)",
                    color: "#FFFFFF",
                    borderColor: "transparent",
                  }
                : {}
            }
          >
            {b.label}
          </button>
        ))}
        {brush !== "off" && (
          <>
            <label className="body-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={brushWeekly}
                onChange={(e) => setBrushWeekly(e.target.checked)}
              />
              apply every week
            </label>
            <span className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
              Click or drag cells to paint · undo appears after each stroke
            </span>
          </>
        )}
        <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
            Copy this week →
          </span>
          <button
            className="chip"
            disabled={copying}
            onClick={() => copyWeek(1)}
            title="Copy this week's open hours to next week"
          >
            next week
          </button>
          <button
            className="chip"
            disabled={copying}
            onClick={() => copyWeek(4)}
            title="Copy this week's open hours to the next 4 weeks"
          >
            next 4 weeks
          </button>
          <label className="body-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
            />
            Show cancelled
          </label>
        </span>
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
        attention.unreviewedHomework.length > 0) && (
        <div
          className="card"
          style={{ padding: 14, marginBottom: 12, borderColor: "#D97706", background: "#FFFBEB" }}
        >
          <div className="h3" style={{ marginBottom: 6 }}>Needs attention</div>
          {attention.conflicts.map((c) => (
            <div key={c._id} className="body-sm" style={{ padding: "4px 0" }}>
              ⚠️ <strong>{c.studentName ?? "Lesson"}</strong> on {c.date} at {formatTime(c.startTime, timeFmt)} sits in
              time you have blocked — move or cancel it.{" "}
              <button
                style={{ textDecoration: "underline", border: "none", background: "none", cursor: "pointer", padding: 0, color: "inherit" }}
                onClick={() => {
                  const match = events.find((e) => e._id === c._id);
                  if (match) {
                    setCurrentDate(new Date(`${match.date}T12:00:00`));
                    setSelectedEvent(match);
                  } else {
                    setCurrentDate(new Date(`${c.date}T12:00:00`));
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
        </div>
      )}

      {/* First-run hint — no availability opened yet (§14.6 empty states) */}
      {cal && openSlotKeys.length === 0 && activeEvents.length === 0 && (
        <div
          className="card"
          style={{
            padding: 14,
            marginBottom: 12,
            borderColor: "var(--brand-purple)",
            background: "var(--omnic-tenant-primary-soft)",
          }}
        >
          <strong>No working hours opened yet.</strong>{" "}
          <span className="body-sm">
            Drag across the grid to open a block of times, or click a day/hour
            header to select a whole column or row. Students and your admin can
            only book inside open (green) slots.
          </span>
        </div>
      )}

      {/* Grid */}
      <div className="card" style={{ padding: 16, marginBottom: 24 }}>
        {cal === undefined ? (
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
                setPendingSlot(null);
                setSelectedEvent(e as CalEvent);
              }
            }}
            onJumpToDate={(d) => setCurrentDate(d)}
            onSlotClick={onSlotClick}
            onSlotDragEnd={(slots) => {
              setSelectedEvent(null);
              if (brush !== "off") {
                void paint(slots);
                return;
              }
              setBulkSlots(slots);
            }}
            onEventDrop={(ev, date, time) => {
              const org =
                keyToOrg.get(`${date}|${time}`) ?? convertZoned(date, time, viewerTz, orgTz);
              rescheduleEvent({
                eventId: ev._id as Id<"scheduleEvents">,
                toDate: org.date,
                toStartTime: org.time,
              })
                .then((r) =>
                  toast.success(
                    r?.trackedLate
                      ? "Lesson moved — under 12h notice, make sure the student agreed"
                      : "Lesson moved"
                  )
                )
                .catch((e) => toast.error((e as Error).message));
            }}
            openSlotKeys={openSlotKeys}
            openRanges={zoned.openRanges}
            moveMode={!!movingEventId}
            headerExtra={viewSwitcher}
            timeFormat={timeFmt}
            renderEventHover={renderEventHover}
          />
        )}
        {view === "month" && (
          <div className="body-sm" style={{ marginTop: 8 }}>
            Slot painting works in Day and Week views. Click a day to zoom in.
          </div>
        )}
      </div>

      {/* Bulk paint dialog */}
      <Dialog open={!!bulkSlots} onOpenChange={(o) => !o && setBulkSlots(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bulkSlots?.length ?? 0} slots selected</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            <p className="text-sm text-zinc-500">
              {bulkSlots?.[0] && bulkSlots[bulkSlots.length - 1]
                ? `${bulkSlots[0].date} ${formatTime(bulkSlots[0].time, timeFmt)} → ${bulkSlots[bulkSlots.length - 1].date} ${formatTime(bulkSlots[bulkSlots.length - 1].time, timeFmt)}`
                : ""}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={bulkBusy} onClick={() => applyBulk(true, "date")}>
                Open — these dates
              </Button>
              <Button disabled={bulkBusy} variant="outline" onClick={() => applyBulk(true, "weekly")}>
                Open — every week
              </Button>
              <Button disabled={bulkBusy} variant="destructive" onClick={() => applyBulk(false, "date")}>
                Block — these dates
              </Button>
              <Button disabled={bulkBusy} variant="outline" onClick={() => applyBulk(false, "weekly")}>
                Block — every week
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* One-time lesson — any time, including outside published hours */}
      <Dialog open={oneTimeOpen} onOpenChange={(o) => !o && setOneTimeOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>One-time lesson</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-zinc-500">
              A lesson at any time — it does not have to sit inside your open
              hours. It appears on the calendar like any other lesson and can be
              moved or cancelled the same way.
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
                {/* step=300 → the picker offers minute-level control, so
                    16:15 and 10:30 are first-class start times. */}
                <Input
                  type="time"
                  step={300}
                  value={oneTimeTime}
                  onChange={(e) => setOneTimeTime(e.target.value)}
                />
              </div>
              <div style={{ flex: "1 1 110px" }}>
                <label className="text-sm font-medium">Minutes</label>
                <Input
                  type="number"
                  min={15}
                  step={15}
                  value={oneTimeDuration}
                  onChange={(e) => setOneTimeDuration(e.target.value)}
                />
              </div>
            </div>

            {oneTimeDate && oneTimeTime && viewerTz !== orgTz && (
              <p className="text-xs text-zinc-500">
                {dualTime(
                  convertZoned(oneTimeDate, oneTimeTime, viewerTz, orgTz).date,
                  convertZoned(oneTimeDate, oneTimeTime, viewerTz, orgTz).time,
                  orgTz,
                  viewerTz,
                  timeFmt
                )}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Button disabled={oneTimeBusy} onClick={() => submitOneTime(false)}>
                {oneTimeBusy ? "Adding…" : "Add to calendar"}
              </Button>
              <Button
                variant="outline"
                disabled={oneTimeBusy}
                onClick={() => submitOneTime(true)}
              >
                Add and start the session now
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Meeting room dialog (C-8) */}
      <Dialog open={roomOpen} onOpenChange={setRoomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your meeting room</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-zinc-500">
              Every new lesson gets this link automatically, so neither you nor your
              students have to paste one each time. Leave empty to add links per lesson.
            </p>
            <Input
              value={roomLink}
              onChange={(e) => setRoomLink(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
            />
            <Button
              className="w-full"
              onClick={async () => {
                try {
                  await setMeetLink({ meetLink: roomLink });
                  toast.success(roomLink ? "Meeting room saved" : "Meeting room cleared");
                  setRoomOpen(false);
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Time off dialog */}
      <Dialog open={timeOffOpen} onOpenChange={setTimeOffOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Time off</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-zinc-500">
              Blocks every slot in the range so nothing can be booked. Lessons
              already scheduled inside stay — move or cancel them yourself.
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

      {/* Slot toggle dialog */}
      <Dialog open={!!pendingSlot} onOpenChange={(o) => !o && setPendingSlot(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingSlot?.isOpen ? "Block" : "Open"}{" "}
              {pendingSlot ? formatTime(pendingSlot.time, timeFmt) : ""} slot
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
                  {(() => {
                    // Resolve from the academy-tz values: the display values
                    // are in the viewer's chosen zone, which need not be the
                    // browser's, and `new Date("...")` assumes browser-local.
                    const startMs = zonedToInstant(
                      selectedEvent.orgDate,
                      selectedEvent.orgStartTime,
                      orgTz
                    ).getTime();
                    const minsUntil = (startMs - Date.now()) / 60_000;
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
                    const canStart = !terminal && minsUntil < 15 && minsUntil > -120;
                    return canStart ? (
                      <Button
                        disabled={starting}
                        onClick={() => startSession(selectedEvent)}
                        style={{ background: "#059669" }}
                      >
                        {starting ? "Starting…" : "Start session"}
                      </Button>
                    ) : null;
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
