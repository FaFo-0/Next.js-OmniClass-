"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { addDays } from "date-fns";
import { SlotCalendar } from "@/components/calendar/SlotCalendar";
import {
  calendarRange,
  useViewerTz,
  useTimeFormat,
  useZonedCalendar,
  useCalendarSnapshot,
  TimezoneSelect,
  TimeFormatToggle,
  CalendarSkeleton,
  type DisplayEvent,
} from "@/components/calendar/calendarShared";
import {
  projectCalendarSlots,
  type ProjectedCalendarSlot,
} from "@/lib/calendarSlots";
import { convertZoned } from "@/lib/tz";
import { formatTime } from "@/lib/timeFormat";
import { usePolicyText } from "@/lib/policyText";
import { errText } from "@/lib/convexError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Booking = { date: string; startTime: string };
type ReviewContext = {
  teacherId: string;
  activityTypeId: string;
  lessonMinutes: number;
  pointCost: number;
  academyTimezone: string;
  policyVersion: string;
};
export default function StudentCalendarPage() {
  const t = useTranslations("app.calendar.direct");
  const policyText = usePolicyText();
  const me = useQuery(api.users.getMe);
  const [viewerTz, setViewerTz] = useViewerTz(me?.timezone),
    [clock, setClock] = useTimeFormat(me?.timeFormat);
  const [date, setDate] = useState(() => new Date()),
    [mode, setMode] = useState<"day" | "week">("week");
  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) setMode("day");
  }, []);
  const range = calendarRange(mode, date);
  const freshCal = useQuery(api.calendar.getStudentCalendar, range);
  const scope = `${me?.externalId ?? "loading"}:${me?.teacherId ?? "unassigned"}`;
  const cal = useCalendarSnapshot(freshCal, scope);
  const balance = useQuery(api.points.getBalance, {});
  const orgTz = cal?.orgTz ?? "Asia/Almaty";
  const [event, setEvent] = useState<DisplayEvent | null>(null),
    [moving, setMoving] = useState<DisplayEvent | null>(null);
  const [selected, setSelected] = useState<ProjectedCalendarSlot | null>(null),
    [target, setTarget] = useState<ProjectedCalendarSlot | null>(null);
  const [weekly, setWeekly] = useState(false),
    [until, setUntil] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [preferences, setPreferences] = useState(false),
    [showCancelled, setShowCancelled] = useState(false),
    [cancelConfirm, setCancelConfirm] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const freshCells = useQuery(api.calendarAvailability.getCells, {
    ...range,
    nowTick: Math.floor(now / 60000),
    eventId: moving ? (moving._id as Id<"scheduleEvents">) : undefined,
  });
  const cellScope = `${scope}:${moving?.teacherId ?? me?.teacherId ?? "unassigned"}`;
  const cellData = useCalendarSnapshot(freshCells, cellScope);
  const refreshing = !freshCal || !freshCells;
  const cells = useMemo(
    () =>
      projectCalendarSlots(cellData?.cells ?? [], orgTz, viewerTz).map(
        (cell) => ({ ...cell, open: moving ? !!cell.canMove : !!cell.canBook }),
      ),
    [cellData, orgTz, viewerTz, moving],
  );
  const { events } = useZonedCalendar(cal, viewerTz);
  const action = useQuery(
    api.calendar.actionPreview,
    event ? { eventId: event._id as Id<"scheduleEvents"> } : "skip",
  );
  const movePreview = useQuery(
    api.calendar.previewMove,
    moving && target
      ? {
          eventId: moving._id as Id<"scheduleEvents">,
          toDate: target.date,
          toStartTime: target.startTime,
        }
      : "skip",
  );
  // A repeat is a finite list of dates in the viewer's timezone. Convert every
  // occurrence separately so DST does not drift their usual local lesson time.
  const bookings = useMemo(() => {
    if (!selected) return [];
    if (!weekly)
      return [{ date: selected.date, startTime: selected.startTime }];
    if (!until || until < selected.viewerDate) return [];
    const out: Booking[] = [];
    for (
      let day = selected.viewerDate;
      day <= until && out.length < 60;
      day = new Date(Date.parse(`${day}T00:00:00Z`) + 7 * 86400000)
        .toISOString()
        .slice(0, 10)
    ) {
      const academy = convertZoned(
        day,
        selected.viewerStartTime,
        viewerTz,
        orgTz,
      );
      out.push({ date: academy.date, startTime: academy.time });
    }
    return out.filter(
      (booking) => !excluded.includes(`${booking.date}|${booking.startTime}`),
    );
  }, [selected, weekly, until, viewerTz, orgTz, excluded]);
  const bookingPreview = useQuery(
    api.calendar.previewBookingBatch,
    bookings.length ? { bookings } : "skip",
  );
  const confirm = useMutation(api.calendar.confirmBookingBatch),
    cancel = useMutation(api.calendar.cancelEvent),
    move = useMutation(api.calendar.rescheduleEvent);
  const [, setRequestVersion] = useState(0);
  const [busy, setBusy] = useState(false),
    lock = useRef(false);
  const request = useRef<{ id: string; context: ReviewContext | null }>({
    id: "",
    context: null,
  });
  function freshRequest() {
    request.current = { id: crypto.randomUUID(), context: null };
    setRequestVersion((value) => value + 1);
  }
  function selectCell(cell: ProjectedCalendarSlot) {
    if (refreshing) return;
    if (moving) {
      if (cell.canMove) setTarget(cell);
      return;
    }
    if (cell.canBook) {
      setSelected(cell);
      setExcluded([]);
      setWeekly(false);
      setUntil(cell.viewerDate);
      freshRequest();
    }
  }
  async function run(action: () => Promise<unknown>, message: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
      toast.success(message);
    } catch (error) {
      toast.error(errText(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function book() {
    if (!bookingPreview || bookingPreview.conflicts.length) return;
    request.current.context ??= bookingPreview.reviewContext;
    const context = request.current.context;
    await run(async () => {
      await confirm({
        bookings,
        requestId: request.current.id,
        expectedTeacherId: context.teacherId,
        expectedActivityTypeId: context.activityTypeId,
        expectedDurationMinutes: context.lessonMinutes,
        expectedPointCost: context.pointCost,
        expectedAcademyTimezone: context.academyTimezone,
        expectedPolicyVersion: context.policyVersion,
      });
      setSelected(null);
    }, t("booked"));
  }
  function lessonTime(booking: Booking) {
    const local = convertZoned(
      booking.date,
      booking.startTime,
      orgTz,
      viewerTz,
    );
    return `${local.date} · ${formatTime(local.time, clock)}`;
  }
  const changedContext =
    !!bookingPreview &&
    !!request.current.context &&
    Object.entries(request.current.context).some(
      ([key, value]) =>
        bookingPreview.reviewContext[key as keyof ReviewContext] !== value,
    );
  if (!cal || !cellData) return <CalendarSkeleton />;
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {moving ? t("chooseMove") : t("chooseTime")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/student/billing" className="text-sm underline">
            {t("balance", { count: balance?.balance ?? 0 })}
          </Link>
          <Button
            variant="outline"
            onClick={() => setPreferences((value) => !value)}
          >
            {t("preferences")}
          </Button>
        </div>
      </div>
      {preferences && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-background p-3">
          <TimezoneSelect value={viewerTz} onChange={setViewerTz} />
          <TimeFormatToggle value={clock} onChange={setClock} />
          <label className="text-sm">
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
            />{" "}
            {t("showCancelled")}
          </label>
        </div>
      )}
      {!cal.teacherId && (
        <p className="rounded-xl border bg-background p-4">{t("noTeacher")}</p>
      )}
      {cal.teacherName && (
        <p className="text-sm text-muted-foreground">
          {moving?.teacherName ?? cal.teacherName} · {viewerTz}
        </p>
      )}
      {moving && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <span>
            {t("moving", {
              time: lessonTime({
                date: moving.orgDate,
                startTime: moving.orgStartTime,
              }),
            })}
          </span>
          <Button
            variant="ghost"
            onClick={() => {
              setMoving(null);
              setTarget(null);
            }}
          >
            {t("exitMove")}
          </Button>
        </div>
      )}
      <SlotCalendar
        cells={cells}
        events={events
          .filter((e) => showCancelled || e.status !== "cancelled")
          .map((e) => ({ ...e, studentName: e.teacherName ?? e.title }))}
        users={[]}
        currentDate={date}
        mode={mode}
        viewerTz={viewerTz}
        timeFormat={clock}
        preferenceKey={`student:${me?.externalId}`}
        onPrevWeek={() =>
          setDate((value) => addDays(value, mode === "day" ? -1 : -7))
        }
        onNextWeek={() =>
          setDate((value) => addDays(value, mode === "day" ? 1 : 7))
        }
        onToday={() => setDate(new Date())}
        onJumpToDate={setDate}
        headerExtra={
          <div className="flex gap-1">
            {(["day", "week"] as const).map((view) => (
              <Button
                key={view}
                size="sm"
                variant={mode === view ? "default" : "outline"}
                onClick={() => setMode(view)}
              >
                {t(view)}
              </Button>
            ))}
          </div>
        }
        onCellClick={selectCell}
        onEventClick={(ev) => {
          setEvent(ev);
          setCancelConfirm(false);
        }}
        moveMode={!!moving}
        selected={selected ? [selected] : []}
        proposed={target ?? undefined}
        disabled={busy || refreshing}
      />
      <Dialog
        open={!!selected}
        onOpenChange={(value) => !value && !busy && setSelected(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmBooking")}</DialogTitle>
          </DialogHeader>
          {selected && (
            <>
              <p>{lessonTime(selected)}</p>
              <p className="text-sm text-muted-foreground">{t("duration")}</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={weekly}
                  disabled={busy}
                  onChange={(e) => {
                    setExcluded([]);
                    setWeekly(e.target.checked);
                    setUntil(
                      e.target.checked
                        ? new Date(
                            Date.parse(`${selected.viewerDate}T00:00:00Z`) +
                              21 * 86400000,
                          )
                            .toISOString()
                            .slice(0, 10)
                        : selected.viewerDate,
                    );
                    freshRequest();
                  }}
                />
                {t("repeatWeekly")}
              </label>
              {weekly && (
                <>
                  <label className="text-sm">
                    {t("through")}
                    <Input
                      type="date"
                      min={selected.viewerDate}
                      value={until}
                      disabled={busy}
                      onChange={(e) => {
                        setExcluded([]);
                        setUntil(e.target.value);
                        freshRequest();
                      }}
                    />
                  </label>
                  <ul className="max-h-44 overflow-auto text-sm space-y-1">
                    {bookings.map((booking) => (
                      <li key={`${booking.date}|${booking.startTime}`}>
                        <span>{lessonTime(booking)}</span>
                        <button
                          className="ms-3 text-xs underline"
                          disabled={busy}
                          onClick={() => {
                            setExcluded((values) => [
                              ...values,
                              `${booking.date}|${booking.startTime}`,
                            ]);
                            freshRequest();
                          }}
                        >
                          {t("removeDate")}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {bookingPreview?.conflicts.map((conflict, index) => (
                <p className="text-sm text-destructive" key={index}>
                  {lessonTime(conflict)} ·{" "}
                  {conflict.reasonKey ? policyText(conflict) : conflict.reason}
                </p>
              ))}
              {changedContext && (
                <Button
                  variant="outline"
                  onClick={() => {
                    freshRequest();
                    setUntil((value) => value);
                    toast.info(t("reviewAgain"));
                  }}
                >
                  {t("reviewAgain")}
                </Button>
              )}
              {bookingPreview && (
                <p className="text-sm">
                  {t("cost", {
                    count: bookingPreview.items.filter(
                      (item) => item.ok && !item.alreadyBooked,
                    ).length,
                    left: bookingPreview.lessonsLeft,
                  })}
                </p>
              )}
              <Button
                disabled={
                  busy ||
                  !bookingPreview ||
                  !!bookingPreview.conflicts.length ||
                  changedContext ||
                  !bookings.length
                }
                onClick={() => void book()}
              >
                {busy ? t("saving") : t("confirm")}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!event}
        onOpenChange={(value) => !value && !busy && setEvent(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{event?.title}</DialogTitle>
          </DialogHeader>
          {event && (
            <>
              <p>
                {lessonTime({
                  date: event.orgDate,
                  startTime: event.orgStartTime,
                })}
              </p>
              <p className="text-sm">{event.teacherName ?? cal.teacherName}</p>
              {event.googleMeetLink && (
                <a
                  href={event.googleMeetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {t("meetingRoom")}
                </a>
              )}
              {action && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {cancelConfirm
                      ? policyText(action.cancel)
                      : policyText(action.reschedule)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy || !action.reschedule.allowed}
                      onClick={() => {
                        setMoving(event);
                        setEvent(null);
                        setTarget(null);
                      }}
                    >
                      {t("move")}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || !action.cancel.allowed}
                      onClick={() =>
                        cancelConfirm
                          ? void run(async () => {
                              await cancel({
                                eventId: event._id as Id<"scheduleEvents">,
                              });
                              setEvent(null);
                            }, t("cancelled"))
                          : setCancelConfirm(true)
                      }
                    >
                      {cancelConfirm ? t("confirmCancel") : t("cancel")}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!target}
        onOpenChange={(value) => !value && !busy && setTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmMove")}</DialogTitle>
          </DialogHeader>
          {moving && target && (
            <>
              <p>{lessonTime(target)}</p>
              <p className="text-sm">{movePreview?.reason || t("duration")}</p>
              {movePreview?.charged && (
                <p className="text-sm">{t("lateMove")}</p>
              )}
              <Button
                disabled={busy || !movePreview?.allowed}
                onClick={() =>
                  void run(async () => {
                    await move({
                      eventId: moving._id as Id<"scheduleEvents">,
                      toDate: target.date,
                      toStartTime: target.startTime,
                    });
                    setMoving(null);
                    setTarget(null);
                  }, t("moved"))
                }
              >
                {busy ? t("saving") : t("confirm")}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
