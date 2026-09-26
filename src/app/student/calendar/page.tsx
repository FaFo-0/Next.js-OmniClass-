"use client";

// §13.10 — Student calendar: own lessons + assigned teacher's open slots.
// Click a green slot → book (uses 1 lesson credit, ≥12h notice, ≤28 days
// ahead). Click own lesson → policy-aware Cancel (2 free/30 days, ≥6h
// notice) or Move to another open slot.

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePolicyText } from "@/lib/policyText";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { addDays, addMonths, format, parseISO } from "date-fns";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { WeeklyCalendar } from "@/components/calendar/WeeklyCalendar";
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
  canonicalizeBookings,
  canonicalizeViewerBooking,
  draftKey,
  generateWeeklyOccurrencesInZone,
  periodForAcademyMonth,
  projectBookingForViewer,
  type BookingStart,
  type WeeklyPattern,
} from "@/lib/calendarBookingPlan";
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

  // Canonical academy wall-clock values are the source of truth. Viewer
  // projections are derived for display and never written back into this draft.
  const [staged, setStaged] = useState<BookingStart[]>([]);
  const [bookingMode, setBookingMode] = useState<"flexible" | "weekly">("flexible");
  const [weeklyPatterns, setWeeklyPatterns] = useState<({ id: string } & WeeklyPattern)[]>([
    { id: "pattern-1", dayOfWeek: 1, startTime: "18:00" },
  ]);
  const patternSequence = useRef(2);
  const [weeklyMonthOffset, setWeeklyMonthOffset] = useState<0 | 1>(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // A network retry must reuse the exact server idempotency key. It is reset
  // only when this staged batch is cleared or confirmed successfully.
  const bookingRequestId = useRef<string | null>(null);

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
  const confirmBatch = useMutation(api.calendar.confirmBookingBatch);

  const zoned = useZonedCalendar(cal, viewerTz);
  const events = zoned.events as CalEvent[];
  const lessonMin = cal?.lessonMinutes ?? 60;
  const bufferMin = cal?.bufferMinutes ?? 10;
  const gran = cal?.granularity ?? 15;
  const bookingContext = cal?.bookingContext ?? null;

  const weeklyPeriod = useMemo(
    () => periodForAcademyMonth(new Date(), orgTz, weeklyMonthOffset),
    [orgTz, weeklyMonthOffset]
  );
  const stagedViewer = useMemo(
    () => staged.map((booking) => projectBookingForViewer(booking, orgTz, viewerTz)),
    [staged, orgTz, viewerTz]
  );
  const batchPreview = useQuery(
    api.calendar.previewBookingBatch,
    staged.length > 0 ? { bookings: staged, repeat: false } : "skip"
  );
  const previewItems = batchPreview?.items ?? [];
  const previewMatchesDraft =
    batchPreview !== undefined &&
    JSON.stringify(canonicalizeBookings(previewItems)) === JSON.stringify(staged) &&
    batchPreview.reviewContext.teacherId === (bookingContext?.teacherId ?? "") &&
    batchPreview.reviewContext.activityTypeId === bookingContext?.activityTypeId &&
    batchPreview.reviewContext.lessonMinutes === bookingContext?.lessonMinutes &&
    batchPreview.reviewContext.pointCost === bookingContext?.pointCost &&
    batchPreview.reviewContext.academyTimezone === bookingContext?.academyTimezone &&
    batchPreview.reviewContext.policyVersion === bookingContext?.policyVersion;
  const batchConflicts = previewMatchesDraft ? batchPreview.conflicts : [];

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

  // ── Staging ────────────────────────────────────────────────────────
  function setDraft(next: BookingStart[]) {
    setStaged(canonicalizeBookings(next));
    // A changed draft is a new operation. Unknown network outcomes are kept
    // frozen by confirmStaged and do not call this helper.
    bookingRequestId.current = null;
  }

  function toggleStage(viewerDate: string, viewerStartTime: string) {
    const canonical = canonicalizeViewerBooking(
      { date: viewerDate, startTime: viewerStartTime },
      viewerTz,
      orgTz
    );
    const key = draftKey(canonical);
    const exists = staged.some((item) => draftKey(item) === key);
    setDraft(exists ? staged.filter((item) => draftKey(item) !== key) : [...staged, canonical]);
  }

  function removeStaged(booking: BookingStart) {
    setDraft(staged.filter((item) => draftKey(item) !== draftKey(booking)));
  }

  function replaceStaged(
    original: BookingStart,
    viewerDate: string,
    viewerStartTime: string
  ) {
    if (viewerDate.length !== 10 || viewerStartTime.length !== 5) return;
    const replacement = canonicalizeViewerBooking(
      { date: viewerDate, startTime: viewerStartTime },
      viewerTz,
      orgTz
    );
    setDraft([
      ...staged.filter((item) => draftKey(item) !== draftKey(original)),
      replacement,
    ]);
  }

  function clearStaged() {
    setStaged([]);
    setBookingMode("flexible");
    bookingRequestId.current = null;
  }

  function addWeeklyPair() {
    setWeeklyPatterns((prev) => [
      ...prev,
      { id: `pattern-${patternSequence.current++}`, dayOfWeek: 1, startTime: "18:00" },
    ]);
  }

  function updateWeeklyPair(id: string, patch: Partial<WeeklyPattern>) {
    setWeeklyPatterns((prev) => prev.map((pattern) => (pattern.id === id ? { ...pattern, ...patch } : pattern)));
  }

  function removeWeeklyPair(id: string) {
    setWeeklyPatterns((prev) => prev.length <= 1 ? prev : prev.filter((pattern) => pattern.id !== id));
  }

  function addWeeklyPattern() {
    const occurrences = generateWeeklyOccurrencesInZone(
      weeklyPeriod,
      weeklyPatterns,
      viewerTz,
      orgTz
    );
    if (occurrences.length === 0) {
      toast.error(t("weeklyNoDates"));
      return;
    }
    setDraft([...staged, ...occurrences]);
    setBookingMode("weekly");
  }

  async function confirmStaged() {
    if (staged.length === 0 || !bookingContext || !previewMatchesDraft || batchConflicts.length > 0) return;
    setConfirming(true);
    try {
      const r = await confirmBatch({
        bookings: staged,
        repeat: false,
        requestId: bookingRequestId.current ?? (bookingRequestId.current = crypto.randomUUID()),
        expectedTeacherId: bookingContext.teacherId ?? "",
        expectedActivityTypeId: bookingContext.activityTypeId,
        expectedDurationMinutes: bookingContext.lessonMinutes,
        expectedPointCost: bookingContext.pointCost,
        expectedAcademyTimezone: bookingContext.academyTimezone,
        expectedPolicyVersion: bookingContext.policyVersion,
      });
      toast.success(t("bookedToast", { count: r.booked.length }));
      setReviewOpen(false);
      clearStaged();
    } catch (e) {
      // A rejected commit preserves every intention for repair. A structured
      // conflict means no receipt was written, so the repaired draft gets a
      // fresh request identity; unknown outcomes retain the frozen identity.
      const text = errText(e);
      let conflicts: { date: string; startTime: string; reason: string }[] | null = null;
      try {
        const parsed = JSON.parse(text);
        if (parsed && Array.isArray(parsed.conflicts)) conflicts = parsed.conflicts;
      } catch {
        conflicts = null;
      }
      if (conflicts && conflicts.length > 0) {
        bookingRequestId.current = null;
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
    <div className="student-calendar-page">
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

      {/* Staging bar — one draft for flexible dates or a finite weekly pattern */}
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
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }} role="tablist" aria-label={t("bookingMethodLabel")}>
            <button className="chip" aria-pressed={bookingMode === "flexible"} onClick={() => setBookingMode("flexible")}>
              {t("flexibleDates")}
            </button>
            <button className="chip" aria-pressed={bookingMode === "weekly"} onClick={() => setBookingMode("weekly")}>
              {t("weeklyPattern")}
            </button>
          </div>
          {bookingMode === "weekly" && (
            <div className="card" style={{ padding: 10, marginBottom: 12, background: "var(--omnic-gray-50, #fafafa)" }}>
              <div className="body-sm" style={{ marginBottom: 8 }}>
                {t("weeklyPatternHelp")} {weeklyPeriod.fromDate} → {weeklyPeriod.toDate} · {t("patternTimezone", { timezone: viewerTz })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {weeklyPatterns.map((pattern, index) => (
                  <div key={pattern.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <span className="body-sm" style={{ minWidth: 24 }}>{index + 1}.</span>
                    <label className="body-sm">{t("weekday")} <select className="select" value={pattern.dayOfWeek} onChange={(e) => updateWeeklyPair(pattern.id, { dayOfWeek: Number(e.target.value) })}>
                      {[[1, t("monday")], [2, t("tuesday")], [3, t("wednesday")], [4, t("thursday")], [5, t("friday")], [6, t("saturday")], [0, t("sunday")]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select></label>
                    <label className="body-sm">{t("startTime")} <input className="input" type="time" step={gran * 60} value={pattern.startTime} onChange={(e) => updateWeeklyPair(pattern.id, { startTime: e.target.value })} /></label>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeWeeklyPair(pattern.id)} disabled={weeklyPatterns.length <= 1}>{t("removePattern")}</button>
                  </div>
                ))}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <Button size="sm" variant="outline" onClick={addWeeklyPair}>{t("addPattern")}</Button>
                  <label className="body-sm">{t("bookingMonth")} <select className="select" value={weeklyMonthOffset} onChange={(e) => setWeeklyMonthOffset(Number(e.target.value) as 0 | 1)}>
                    <option value={0}>{t("thisMonth")}</option><option value={1}>{t("nextMonth")}</option>
                  </select></label>
                  <Button size="sm" variant="outline" onClick={addWeeklyPattern}>{t("addWeeklyDates")}</Button>
                </div>
              </div>
            </div>
          )}
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
                  {bookingMode === "weekly" && <span>{t("finitePlan")}</span>}
                </div>
              )}
              {batchConflicts.length > 0 && (
                <div className="body-sm" style={{ color: "var(--omnic-red)" }}>
                  {t("conflictSummary", { count: batchConflicts.length })}
                  {batchConflicts.slice(0, 2).map((c) => {
                    // Conflicts arrive in academy wall-clock; the grid shows
                    // the viewer's tz, so convert for the message.
                    const v = convertZoned(c.date, c.startTime, orgTz, viewerTz);
                    return (
                      <div key={`${c.date}|${c.startTime}`} className="body-sm">
                        {formatTime(v.time, timeFmt)} — {c.reason}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {staged.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={clearStaged}>
                  {t("clearStaged")}
                </Button>
                <Button
                  size="sm"
                  disabled={confirming || !previewMatchesDraft || !bookingContext}
                  onClick={() => setReviewOpen(true)}
                >
                  {t("reviewStaged", { count: staged.length - batchConflicts.length })}
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
      <div className="card student-calendar-surface" style={{ padding: 16, marginBottom: 24 }}>
        {cal === undefined ? (
          <CalendarSkeleton columns={view === "day" ? 1 : 7} />
        ) : view === "month" ? (
          <MonthCalendar
            events={activeEvents}
            planned={stagedViewer}
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
            staged={stagedViewer}
            onStageToggle={toggleStage}
            lessonMinutes={lessonMin}
            granularity={gran}
            headerExtra={viewSwitcher}
            timeFormat={timeFmt}
          />
        )}
      </div>

      {/* The grid deliberately uses normal page scrolling. Repeat the staged
          booking controls after it so confirmation is always visible when a
          student reaches the slots they selected. */}
      {cal?.teacherName && (
        <div
          className="card"
          data-testid="student-calendar-booking-actions-bottom"
          aria-label="Staged lesson booking actions"
          style={{
            padding: 14,
            marginBottom: 24,
            borderColor: staged.length > 0 ? "var(--omnic-tenant-primary)" : undefined,
            background: staged.length > 0 ? "var(--omnic-tenant-primary-soft, rgba(103,22,164,0.05))" : undefined,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <div className="body-sm" style={{ flex: "1 1 240px" }}>
              {staged.length > 0
                ? t("stagedCount", { count: staged.length })
                : t("stagedHint")}
            </div>
            {batchConflicts.length > 0 && (
              <div className="body-sm" data-testid="student-calendar-booking-conflicts-bottom" style={{ flex: "1 1 100%", color: "var(--omnic-red)" }}>
                {t("conflictSummary", { count: batchConflicts.length })}
                {batchConflicts.slice(0, 2).map((c) => {
                  const v = convertZoned(c.date, c.startTime, orgTz, viewerTz);
                  return <div key={`${c.date}|${c.startTime}`}>{formatTime(v.time, timeFmt)} — {c.reason}</div>;
                })}
              </div>
            )}
            {staged.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={clearStaged}>
                  {t("clearStaged")}
                </Button>
                <Button
                  size="sm"
                  disabled={confirming || !previewMatchesDraft || !bookingContext}
                  onClick={() => setReviewOpen(true)}
                >
                  {t("reviewStaged", { count: staged.length - batchConflicts.length })}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <Dialog
        open={reviewOpen}
        onOpenChange={(open) => setReviewOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reviewBookingTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-zinc-600">{t("reviewBookingHelp")}</p>
            {bookingContext && (
              <div className="rounded-md border p-3 text-sm">
                <div>{t("reviewTeacher", { name: cal?.teacherName ?? "" })}</div>
                <div>{t("reviewLessonShape", { minutes: bookingContext.lessonMinutes })}</div>
                <div>{t("reviewTimezone", { timezone: bookingContext.academyTimezone })}</div>
                <div>{t("reviewWindow", { date: bookingContext.bookingUpperExclusiveDate })}</div>
              </div>
            )}
            <div className="max-h-64 overflow-auto space-y-1" aria-label={t("reviewOccurrences")}>
              {staged.map((item) => {
                const viewer = projectBookingForViewer(item, orgTz, viewerTz);
                const result = batchPreview?.items?.find((candidate) => candidate.date === item.date && candidate.startTime === item.startTime);
                const conflict = batchConflicts.find((candidate) => candidate.date === item.date && candidate.startTime === item.startTime);
                const label = result?.alreadyBooked
                  ? t("alreadyBooked")
                  : conflict?.reasonKey === "booking.horizon"
                    ? t("outsideBookingWindow")
                    : conflict
                      ? t("conflictState")
                      : batchPreview
                        ? t("selectedState")
                        : t("checkingState");
                return (
                  <div key={`${item.date}|${item.startTime}`} className="rounded border px-2 py-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {viewer.date} · {formatTime(viewer.startTime, timeFmt)}
                        {viewer.date !== item.date || viewer.startTime !== item.startTime ? (
                          <span className="ms-2 text-xs text-zinc-500">({item.date} · {item.startTime} {t("academyTimeShort")})</span>
                        ) : null}
                      </span>
                      <span className={conflict ? "text-red-600" : result?.alreadyBooked ? "text-zinc-500" : "text-emerald-700"}>{label}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                      {conflict && (
                        <>
                          <label className="text-xs">{t("replaceDate")}
                            <input className="input ms-1 text-xs" type="date" defaultValue={viewer.date} data-replace-date={item.date} />
                          </label>
                          <label className="text-xs">{t("startTime")}
                            <input className="input ms-1 text-xs" type="time" defaultValue={viewer.startTime} data-replace-time={item.date} />
                          </label>
                          <Button size="sm" variant="outline" onClick={(event) => {
                            const row = event.currentTarget.closest("div.rounded.border");
                            const date = row?.querySelector<HTMLInputElement>(`[data-replace-date="${item.date}"]`)?.value ?? viewer.date;
                            const time = row?.querySelector<HTMLInputElement>(`[data-replace-time="${item.date}"]`)?.value ?? viewer.startTime;
                            replaceStaged(item, date, time);
                          }}>{t("replaceOccurrence")}</Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => removeStaged(item)}>{t("removeOccurrence")}</Button>
                    </div>
                  </div>
                );
              })}
            </div>
            {batchConflicts.length > 0 && <p className="text-sm text-red-600">{t("reviewFixConflicts")}</p>}
            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="outline" onClick={() => setReviewOpen(false)}>{t("keepEditing")}</Button>
              <Button disabled={confirming || !previewMatchesDraft || batchConflicts.length > 0 || !bookingContext} onClick={() => void confirmStaged()}>
                {confirming ? t("saving") : t("confirmStaged", { count: staged.length - batchConflicts.length })}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                ? format(parseISO(pickWindow.date), "EEE, MMM d")
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
                {t("noFit", { minutes: lessonMin })}
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
