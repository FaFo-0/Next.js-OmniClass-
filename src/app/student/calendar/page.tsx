"use client";

// §13.10 — Student calendar: own lessons + assigned teacher's open slots.
// Click a green slot → book (uses 1 lesson credit, ≥12h notice, ≤28 days
// ahead). Click own lesson → policy-aware Cancel (2 free/30 days, ≥6h
// notice) or Move to another open slot.

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePolicyText } from "@/lib/policyText";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
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
import { errText } from "@/lib/convexError";
import { formatTime } from "@/lib/timeFormat";
import { convertZoned } from "@/lib/tz";
import {
  calendarRange,
  useViewerTz,
  useZonedCalendar,
  useRememberedView,
  ViewSwitcher,
  dualTime,
  TimezoneSelect,
  TimeFormatToggle,
  useTimeFormat,
  CalendarSkeleton,
  bookableStarts,
  type DisplayEvent,
} from "@/components/calendar/calendarShared";

type CalEvent = DisplayEvent;

export default function StudentCalendarPage() {
  const t = useTranslations("app.calendar");
  const policyText = usePolicyText();
  const [view, setView] = useRememberedView("omnic.cal.view.student");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [movingEventId, setMovingEventId] = useState<Id<"scheduleEvents"> | null>(null);
  // §13.2 → 2026-09-07 rebuild: open window clicked for a MOVE (consequence
  // flow — the picker stays for moves; ordinary bookings are staged inline).
  const [pickWindow, setPickWindow] = useState<{
    date: string;
    startTime: string;
    endTime: string;
    mode: "move";
    eventId?: Id<"scheduleEvents">;
  } | null>(null);
  const [chosenStart, setChosenStart] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  // Staged bookings (viewer-tz — the grid renders in the viewer's zone).
  const [staged, setStaged] = useState<{ date: string; startTime: string }[]>([]);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const { fromDate, toDate } = useMemo(
    () => calendarRange(view, currentDate),
    [currentDate, view]
  );

  const me = useQuery(api.users.getMe);
  const [viewerTz, setViewerTz] = useViewerTz(me?.timezone);
  const [timeFmt, setTimeFmt] = useTimeFormat(me?.timeFormat);
  const cal = useQuery(api.calendar.getStudentCalendar, { fromDate, toDate });
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const supportEmail = tenant?.supportEmail;
  const orgTz = cal?.orgTz ?? viewerTz;
  const balance = useQuery(api.points.getBalance, {});
  const preview = useQuery(
    api.calendar.actionPreview,
    selectedEvent ? { eventId: selectedEvent._id as Id<"scheduleEvents"> } : "skip"
  );

  const cancelEvent = useMutation(api.calendar.cancelEvent);
  const rescheduleEvent = useMutation(api.calendar.rescheduleEvent);
  const endRecurring = useMutation(api.calendar.endRecurring);
  const confirmBatch = useMutation(api.calendar.confirmBookingBatch);

  const zoned = useZonedCalendar(cal, viewerTz);
  const events = zoned.events as CalEvent[];
  const lessonMin = cal?.lessonMinutes ?? 60;
  const bufferMin = cal?.bufferMinutes ?? 10;
  const gran = cal?.granularity ?? 15;

  // Live batch preview: same server validation as confirm, recomputed as the
  // student stages. Converted to academy wall-clock for the server.
  const stagedOrg = useMemo(
    () =>
      staged.map((s) => {
        const org = convertZoned(s.date, s.startTime, viewerTz, orgTz);
        return { date: org.date, startTime: org.time };
      }),
    [staged, viewerTz, orgTz]
  );
  const batchPreview = useQuery(
    api.calendar.previewBookingBatch,
    stagedOrg.length > 0 ? { bookings: stagedOrg, repeat: repeatWeekly } : "skip"
  );
  const batchConflicts = batchPreview?.conflicts ?? [];

  // The student's own upcoming lessons were the opaque `busy` list for the
  // picker; moves ignore the lesson itself so it can land next to its time.
  const startOptions = useMemo(() => {
    if (!pickWindow) return [];
    const ownBusy = events
      .filter(
        (e) =>
          (e.status === "scheduled" || e.status === "makeup") &&
          e._id !== pickWindow.eventId
      )
      .map((e) => ({ date: e.date, startTime: e.startTime, endTime: e.endTime }));
    return bookableStarts(
      pickWindow,
      [...zoned.busy, ...ownBusy],
      lessonMin,
      bufferMin,
      gran,
      { viewerTz, now: Date.now(), minNoticeHours: 0, horizonDays: 3650 }
    );
  }, [pickWindow, zoned.busy, events, lessonMin, bufferMin, gran, viewerTz]);
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
      activeEvents
        .filter((e) => e.studentId)
        .map((e) => ({ externalId: e.studentId!, name: t("myLessonTitle") })),
    [activeEvents, t]
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

  // Open window clicked while MOVING a lesson (consequence flow — the
  // picker asks which start and previews the policy verdict). Ordinary
  // bookings never open a popup: they are staged directly on the grid.
  function onRangeClick(date: string, startTime: string, endTime: string) {
    if (!movingEventId) return;
    setSelectedEvent(null);
    setChosenStart(null);
    setPickWindow({ date, startTime, endTime, mode: "move", eventId: movingEventId });
  }

  // ── Staging (2026-09-07 rebuild) ──────────────────────────────────
  const stagedKey = (date: string, time: string) => `${date}|${time}`;

  function toggleStage(date: string, startTime: string) {
    setStaged((prev) => {
      const key = stagedKey(date, startTime);
      const existing = prev.some((s) => stagedKey(s.date, s.startTime) === key);
      return existing
        ? prev.filter((s) => stagedKey(s.date, s.startTime) !== key)
        : [...prev, { date, startTime }];
    });
  }

  function clearStaged() {
    setStaged([]);
    setRepeatWeekly(false);
  }

  async function confirmStaged() {
    if (stagedOrg.length === 0) return;
    setConfirming(true);
    try {
      const r = await confirmBatch({
        bookings: stagedOrg,
        repeat: repeatWeekly,
        requestId: crypto.randomUUID(),
      });
      toast.success(
        repeatWeekly
          ? t("bookedWeeklyToast", { count: r.booked.length })
          : t("bookedToast", { count: r.booked.length })
      );
      clearStaged();
    } catch (e) {
      // Structured per-item conflicts from the server — keep the valid
      // staged choices and name the conflicts inline.
      const text = errText(e);
      let conflicts: { date: string; startTime: string; reason: string }[] | null = null;
      try {
        const parsed = JSON.parse(text);
        if (parsed && Array.isArray(parsed.conflicts)) conflicts = parsed.conflicts;
      } catch {
        conflicts = null;
      }
      if (conflicts && conflicts.length > 0) {
        // Conflicts arrive in academy wall-clock — match against the staged
        // items via their converted values and drop only the invalid ones.
        const conflictKeys = new Set(
          conflicts.map((c) => `${c.date}|${c.startTime}`)
        );
        setStaged((prev) =>
          prev.filter((s) => {
            const org = convertZoned(s.date, s.startTime, viewerTz, orgTz);
            return !conflictKeys.has(`${org.date}|${org.time}`);
          })
        );
        toast.error(
          conflicts.length === 1
            ? `${t("notBooked")} — ${conflicts[0].reason}`
            : t("notBookedSome", { count: conflicts.length })
        );
      } else {
        toast.error(text);
      }
    } finally {
      setConfirming(false);
    }
  }

  async function doMove() {
    if (!pickWindow || !chosenStart || !pickWindow.eventId) return;
    // The picker works in viewer tz; the server stores academy wall-clock.
    const org = convertZoned(pickWindow.date, chosenStart, viewerTz, orgTz);
    setMoving(true);
    try {
      await rescheduleEvent({
        eventId: pickWindow.eventId,
        toDate: org.date,
        toStartTime: org.time,
      });
      toast.success(t("movedToast"));
      setMovingEventId(null);
      setPickWindow(null);
      setChosenStart(null);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setMoving(false);
    }
  }

  async function doStopWeekly() {
    const rbId = (selectedEvent as any)?.recurringBookingId;
    if (!rbId) return;
    try {
      await endRecurring({ recurringId: rbId });
      toast.success(t("weeklyStopped"));
    } catch (e) {
      toast.error(errText(e));
    }
  }

  async function doCancel() {
    if (!selectedEvent) return;
    try {
      const r = await cancelEvent({ eventId: selectedEvent._id as Id<"scheduleEvents"> });
      toast.success(
        r?.charged
          ? t("cancelledCharged")
          : t("cancelledCredited")
      );
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setSelectedEvent(null);
      setConfirmingCancel(false);
    }
  }

  const viewSwitcher = <ViewSwitcher view={view} onChange={setView} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <h1 className="h1" style={{ margin: 0 }}>{t("title")}</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {cal?.teacherName
              ? t("yourTeacher", { name: cal.teacherName })
              : t("noTeacherYet")}
          </div>
        </div>
        <span className="pill pill-tenant" style={{ fontSize: 14, fontWeight: 700 }}>
          {t("lessonsLeftPill", { count: lessonsLeft })}
          {balanceHorizon ? t("coveredTo", { date: balanceHorizon }) : ""}
        </span>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <LegendSwatch color="rgba(16,185,129,0.25)" label={t("available")} />
        <LegendSwatch color="var(--brand-purple-tint, rgba(103,22,164,0.15))" label={t("myLesson")} />
        <span className="body-sm" style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          {t("myTimezone")} <TimezoneSelect value={viewerTz} onChange={setViewerTz} />
          <TimeFormatToggle value={timeFmt} onChange={setTimeFmt} />
        </span>
        {movingEventId && (
          <span className="pill" style={{ background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>
            {t("pickGreen")}{" "}
            <button style={{ textDecoration: "underline", border: "none", background: "none", cursor: "pointer", color: "inherit", padding: 0 }} onClick={() => setMovingEventId(null)}>
              {t("cancelMove")}
            </button>
          </span>
        )}
      </div>

      {/* Staging bar (2026-09-07 rebuild) — plan several lessons, confirm once */}
      {cal?.teacherName && (
        <div
          className="card"
          style={{
            padding: 14,
            marginBottom: 16,
            borderColor: staged.length > 0 ? "var(--omnic-tenant-primary)" : undefined,
            background: staged.length > 0 ? "var(--omnic-tenant-primary-soft, rgba(103,22,164,0.05))" : undefined,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <div className="body-sm" style={{ marginBottom: 2 }}>
                {staged.length > 0
                  ? t("stagedCount", { count: staged.length })
                  : t("stagedHint")}
              </div>
              {staged.length > 0 && (
                <div className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
                  {batchPreview?.lessonsLeft !== undefined && (
                    <span>{t("lessonsLeftPill", { count: batchPreview.lessonsLeft })} · </span>
                  )}
                  {repeatWeekly && batchPreview?.cutoffDate && (
                    <span>{t("fitsUntil", { date: batchPreview.cutoffDate })}</span>
                  )}
                </div>
              )}
              {batchConflicts.length > 0 && (
                <div className="body-sm" style={{ color: "var(--omnic-red)" }}>
                  {t("conflictSummary", { count: batchConflicts.length })}
                  {batchConflicts.slice(0, 2).map((c) => (
                    <div key={`${c.date}|${c.startTime}`} className="body-sm">
                      {formatTime(c.startTime, timeFmt)} — {c.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {staged.length > 0 && (
              <>
                <label className="body-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={repeatWeekly}
                    onChange={(e) => setRepeatWeekly(e.target.checked)}
                  />
                  {t("repeatFinite")}
                </label>
                <Button variant="outline" size="sm" onClick={clearStaged}>
                  {t("clearStaged")}
                </Button>
                <Button
                  size="sm"
                  disabled={confirming || batchConflicts.length > 0}
                  onClick={() => void confirmStaged()}
                >
                  {confirming
                    ? t("saving")
                    : t("confirmStaged", { count: staged.length - batchConflicts.length })}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* No teacher yet — nothing on this grid can be booked, so say what
          happens next instead of showing an empty week (§14.6). */}
      {cal && !cal.teacherName && (
        <div className="card" style={{ padding: 32, marginBottom: 24, textAlign: "center" }}>
          <div className="h3" style={{ marginBottom: 8 }}>{t("noTeacherTitle")}</div>
          <p className="body" style={{ marginBottom: 16, maxWidth: 420, marginInline: "auto" }}>
            {t("noTeacherBody")}
          </p>
          {supportEmail ? (
            <a className="btn btn-secondary" href={`mailto:${supportEmail}`}>
              {t("emailAcademy", { name: tenant?.name ?? "" })}
            </a>
          ) : (
            <span className="body-sm">{t("reachOut")}</span>
          )}
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
                setPickWindow(null);
                setSelectedEvent(e as CalEvent);
              }
            }}
            onJumpToDate={(d) => setCurrentDate(d)}
            openRanges={zoned.openRanges}
            busyBlocks={zoned.busy}
            onRangeClick={onRangeClick}
            moveMode={!!movingEventId}
            selectable={!movingEventId}
            staged={staged}
            onStageToggle={toggleStage}
            lessonMinutes={lessonMin}
            granularity={gran}
            headerExtra={viewSwitcher}
            timeFormat={timeFmt}
          />
        )}
      </div>

      {/* Move picker (consequence flow) — ordinary bookings are staged inline */}
      <Dialog
        open={!!pickWindow}
        onOpenChange={(o) => {
          if (!o) {
            setPickWindow(null);
            setChosenStart(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("moveLesson")} —{" "}
              {pickWindow
                ? format(new Date(`${pickWindow.date}T12:00:00`), "EEE, MMM d")
                : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-zinc-500">
              {t("pickNewStart")}
              {t("openRange")}{" "}
              {pickWindow
                ? `${formatTime(pickWindow.startTime, timeFmt)}–${formatTime(
                    pickWindow.endTime === "24:00" ? "00:00" : pickWindow.endTime,
                    timeFmt
                  )}`
                : ""}
              {" "}{t("lessonShape", { lesson: lessonMin, buffer: bufferMin })}
            </p>

            {startOptions.length === 0 ? (
              <p className="text-sm text-amber-600">
                {`No ${lessonMin}-minute start fits in this window with the required break. Try another open time.`}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {startOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setChosenStart(s)}
                    className={`rounded-md border px-2 py-1.5 text-sm tabular-nums transition-colors ${
                      chosenStart === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-accent"
                    }`}
                  >
                    {formatTime(s, timeFmt)}
                  </button>
                ))}
              </div>
            )}

            {chosenStart && pickWindow && (
              <p className="text-sm text-zinc-500">
                {dualTime(
                  convertZoned(pickWindow.date, chosenStart, viewerTz, orgTz).date,
                  convertZoned(pickWindow.date, chosenStart, viewerTz, orgTz).time,
                  orgTz,
                  viewerTz,
                  timeFmt
                )}
              </p>
            )}

            <Button
              className="w-full"
              onClick={doMove}
              disabled={moving || !chosenStart}
            >
              {moving ? t("saving") : t("moveToThis")}
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
                {cal?.teacherName ? t("withTeacherLine", { name: cal.teacherName }) : ""}
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
                  {t("joinMeet")}
                </a>
              )}
              {(selectedEvent as any).recurringBookingId && (
                <p className="text-xs font-medium text-purple-700">
                  {t("partOfWeekly")}
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
                    {t("moveLessonBtn")}
                  </Button>
                  {preview && !preview.reschedule.allowed && (
                    <p className="text-xs text-zinc-500">{policyText(preview.reschedule)}</p>
                  )}
                  <Button
                    variant="destructive"
                    disabled={!preview?.cancel.allowed}
                    onClick={() => setConfirmingCancel(true)}
                  >
                    {t("cancelLessonBtn")}
                  </Button>
                  <p className="text-xs text-zinc-500">{policyText(preview?.cancel)}</p>
                  {(selectedEvent as any).recurringBookingId && (
                    <Button variant="outline" onClick={doStopWeekly}>
                      {t("stopWeekly")}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-sm font-medium">
                    {t("confirmCancel")} {policyText(preview?.cancel)}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="destructive" onClick={doCancel}>
                      {t("yesCancel")}
                    </Button>
                    <Button variant="outline" onClick={() => setConfirmingCancel(false)}>
                      {t("keepIt")}
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
