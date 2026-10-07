"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { addDays } from "date-fns";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { userHasPermission } from "../../../convex/lib/permissions";
import { SlotCalendar } from "./SlotCalendar";
import {
  calendarRange,
  useViewerTz,
  useTimeFormat,
  useZonedCalendar,
  useCalendarSnapshot,
  TimezoneSelect,
  TimeFormatToggle,
  type DisplayEvent,
  CalendarSkeleton,
} from "./calendarShared";
import {
  projectCalendarSlots,
  calendarSlotKey,
  calendarSlotTime,
  type CalendarSlot,
  type ProjectedCalendarSlot,
} from "@/lib/calendarSlots";
import { zonedToInstant, instantToZoned } from "@/lib/tz";
import { sessionStartWindow } from "@/lib/sessionStart";
import { errText } from "@/lib/convexError";
import { formatTime } from "@/lib/timeFormat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function StaffCalendar({
  teacherId,
  admin = false,
  header,
  initialDate,
  initialEventId,
}: {
  teacherId: string;
  admin?: boolean;
  header?: ReactNode;
  initialDate?: Date;
  initialEventId?: string;
}) {
  const me = useQuery(api.users.getMe);
  const [viewerTz, setViewerTz] = useViewerTz(me?.timezone);
  const [clock, setClock] = useTimeFormat(me?.timeFormat);
  const [date, setDate] = useState(() => initialDate ?? new Date());
  const [mode, setMode] = useState<"day" | "week">("week");
  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) setMode("day");
  }, []);
  const range = calendarRange(mode, date);
  const ownCal = useQuery(
    api.calendar.getTeacherCalendar,
    admin ? "skip" : range,
  );
  const adminCal = useQuery(
    api.calendar.getAdminCalendar,
    admin ? { ...range, teacherId } : "skip",
  );
  const freshCal = admin ? adminCal : ownCal;
  const scope = `${me?.externalId ?? "loading"}:${teacherId}`;
  const cal = useCalendarSnapshot(freshCal, scope);
  const orgTz = cal?.orgTz ?? "Asia/Almaty";
  const [event, setEvent] = useState<DisplayEvent | null>(null);
  const [moving, setMoving] = useState<DisplayEvent | null>(null);
  const [target, setTarget] = useState<ProjectedCalendarSlot | null>(null);
  const [adding, setAdding] = useState(false);
  const [studentId, setStudentId] = useState("");
  const allUsers = useQuery(api.users.listAllUsers, admin ? {} : "skip");
  const roster = useQuery(
    api.users.getStudentsForTeacher,
    admin ? "skip" : { teacherId },
  );
  const students = admin
    ? (allUsers ?? []).filter((u) => u.role === "student")
    : (roster ?? []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const freshCells = useQuery(api.calendarAvailability.getCells, {
    ...range,
    teacherId,
    nowTick: Math.floor(now / 60000),
    eventId: moving ? (moving._id as Id<"scheduleEvents">) : undefined,
    studentId: adding && studentId ? studentId : undefined,
  });
  const cellData = useCalendarSnapshot(freshCells, scope);
  const refreshing = !freshCal || !freshCells;
  const cells = useMemo(
    () => projectCalendarSlots(cellData?.cells ?? [], orgTz, viewerTz),
    [cellData, orgTz, viewerTz],
  );
  const { events } = useZonedCalendar(cal, viewerTz);
  const openedInitial = useRef<string | null>(null);
  useEffect(() => {
    if (!initialEventId || openedInitial.current === initialEventId) return;
    const found = events.find((row) => row._id === initialEventId);
    if (found) {
      openedInitial.current = initialEventId;
      setEvent(found);
      setTitle(found.title);
    }
  }, [initialEventId, events]);
  const [showCancelled, setShowCancelled] = useState(false);
  const attention = useQuery(api.calendar.needsAttention, admin ? "skip" : {});
  const source = useQuery(api.vacancies.getSourceForTeacher, { teacherId });
  const preview = useQuery(
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
  const edit = useMutation(api.calendarAvailability.editCells),
    undo = useMutation(api.calendarAvailability.undo);
  const replaceWeekly = useMutation(api.vacancies.replaceForTeacher);
  const reschedule = useMutation(api.calendar.rescheduleEvent),
    cancel = useMutation(api.calendar.cancelEvent);
  const addLesson = useMutation(api.calendar.createOneTimeLesson),
    rename = useMutation(api.calendar.renameEvent),
    start = useMutation(api.lessons.create);
  const timeOff = useMutation(api.calendar.blockTimeOff),
    removeTimeOff = useMutation(api.calendar.unblockTimeOff);
  const [saving, setSaving] = useState(false),
    lock = useRef(false);
  const [undoStack, setUndoStack] = useState<
    Id<"calendarAvailabilityChanges">[]
  >([]);
  const [lastGesture, setLastGesture] = useState<CalendarSlot[]>([]);
  const [tools, setTools] = useState(false),
    [off, setOff] = useState(false),
    [repeat, setRepeat] = useState(false),
    [copy, setCopy] = useState(false);
  const [from, setFrom] = useState(""),
    [until, setUntil] = useState("");
  const [copyDate, setCopyDate] = useState("");
  const [title, setTitle] = useState("");
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const canEdit =
    !!me &&
    userHasPermission(me, admin ? "scheduling.edit" : "calendar.edit.full");
  const canAssign = !!me && userHasPermission(me, "calendar.edit.full");
  async function run(action: () => Promise<unknown>, message?: string) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    try {
      await action();
      if (message) toast.success(message);
    } catch (error) {
      toast.error(errText(error));
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  async function paint(painted: CalendarSlot[], open: boolean | null) {
    if (!cellData || !freshCells || refreshing) return;
    const lookup = new Map(
      cellData.cells.map((cell) => [calendarSlotKey(cell), cell]),
    );
    const changes = painted
      .map((cell) => ({
        ...cell,
        expectedState: lookup.get(calendarSlotKey(cell))?.expectedState,
      }))
      .filter((cell) => cell.editable && cell.expectedState);
    if (!changes.length) return;
    await run(
      async () => {
        const id = await edit({
          teacherId,
          requestId: crypto.randomUUID(),
          changes: changes.map((cell) => ({
            date: cell.date,
            startTime: cell.startTime,
            open,
            expectedState: cell.expectedState!,
          })),
        });
        setUndoStack((previous) => [...previous, id]);
        setLastGesture(
          changes.map((cell) => ({ ...cell, open: open ?? cell.open })),
        );
      },
      open === null ? "Usual hours restored" : "Availability saved",
    );
  }
  function selectCell(cell: ProjectedCalendarSlot) {
    if (refreshing) return;
    if (moving || (adding && studentId)) {
      if (cell.canMove) setTarget(cell);
      return;
    }
    if (cell.editable) void paint([cell], !cell.open);
  }
  const lessonRequest = useRef({ key: "", id: "" });
  async function saveLesson() {
    if (!target || !studentId) return;
    const key = `${studentId}|${target.date}|${target.startTime}`;
    if (lessonRequest.current.key !== key)
      lessonRequest.current = { key, id: crypto.randomUUID() };
    const requestId = lessonRequest.current.id;
    await run(async () => {
      const result = await addLesson({
        teacherId,
        studentId,
        date: target.date,
        startTime: target.startTime,
        requestId,
      });
      setAdding(false);
      setTarget(null);
      setStudentId("");
      toast.success(
        result.unpaid
          ? "Lesson scheduled · payment needs admin follow-up"
          : "Lesson scheduled",
      );
    });
  }
  const offGroups = new Map<string, { from: string; until: string }>();
  for (const row of source?.exceptions ?? []) {
    if (!row.timeOffGroupId) continue;
    const existing = offGroups.get(row.timeOffGroupId);
    offGroups.set(row.timeOffGroupId, {
      from: existing && existing.from < row.date ? existing.from : row.date,
      until: existing && existing.until > row.date ? existing.until : row.date,
    });
  }
  const activeLessonId = event
    ? cal?.events.find((e) => e._id === event._id)?.activeLessonId
    : null;
  const startReady =
    event &&
    sessionStartWindow({
      nowMs: now,
      startMs: zonedToInstant(
        event.orgDate,
        event.orgStartTime,
        orgTz,
      ).getTime(),
      lessonMinutes: 60,
    }).kind === "ready";
  if (!cal || !cellData) return <CalendarSkeleton />;
  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>{header ?? <h1 className="h1">Calendar</h1>}</div>
        <div className="flex flex-wrap gap-2">
          {undoStack.length > 0 && (
            <Button
              variant="outline"
              disabled={saving}
              onClick={() =>
                void run(async () => {
                  await undo({ changeId: undoStack.at(-1)! });
                  setUndoStack((stack) => stack.slice(0, -1));
                  setLastGesture([]);
                }, "Change undone")
              }
            >
              Undo
            </Button>
          )}
          {canAssign && (
            <Button
              onClick={() => {
                setAdding(true);
                setMoving(null);
                setTarget(null);
              }}
            >
              Add lesson
            </Button>
          )}
          <Button variant="outline" onClick={() => setTools((value) => !value)}>
            More
          </Button>
        </div>
      </div>
      {tools && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-background p-3">
          <TimezoneSelect value={viewerTz} onChange={setViewerTz} />
          <TimeFormatToggle value={clock} onChange={setClock} />
          <label className="text-sm">
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
            />{" "}
            Show cancelled
          </label>
          {canEdit && (
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setFrom(instantToZoned(new Date(), orgTz).date);
                  setUntil(instantToZoned(new Date(), orgTz).date);
                  setOff(true);
                }}
              >
                Time off
              </Button>
              <Button
                variant="ghost"
                disabled={!lastGesture.length}
                onClick={() => setRepeat(true)}
              >
                Repeat these slots weekly
              </Button>
              <Button
                variant="ghost"
                disabled={!lastGesture.length}
                onClick={() => setCopy(true)}
              >
                Copy these slots to a date
              </Button>
              <Button
                variant="ghost"
                disabled={!lastGesture.length || saving}
                onClick={() => void paint(lastGesture, null)}
              >
                Restore usual hours
              </Button>
            </>
          )}
          {!admin && (
            <Link className="text-sm underline" href="/teacher/profile">
              Meeting room
            </Link>
          )}
        </div>
      )}
      {(moving || adding) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <strong>{moving ? "Choose the new time" : "Add lesson"}</strong>
          {adding && (
            <select
              aria-label="Student"
              className="rounded-md border bg-background p-2 max-w-full"
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                setTarget(null);
              }}
            >
              <option value="">Choose student</option>
              {students.map((s) => (
                <option key={s.externalId} value={s.externalId}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <span className="text-sm">
            {adding && !studentId
              ? "Choose a student first."
              : "Select two free half-hour cells. Published availability is optional."}
          </span>
          <Button
            variant="ghost"
            onClick={() => {
              setMoving(null);
              setAdding(false);
              setTarget(null);
            }}
          >
            Exit
          </Button>
        </div>
      )}
      {!admin &&
        !!(
          (attention?.unreviewedHomework.length ?? 0) +
          (attention?.unpublishedNotes.length ?? 0)
        ) && (
          <details className="rounded-xl border bg-background p-3">
            <summary className="text-sm cursor-pointer">Work to review</summary>
            {attention?.unreviewedHomework.map((row) => (
              <Link
                key={row._id}
                href={
                  row.lessonId
                    ? `/teacher/sessions/${row.lessonId}`
                    : "/teacher/students"
                }
                className="block py-1 text-sm underline"
              >
                {row.studentName} · Homework awaiting review
              </Link>
            ))}
            {attention?.unpublishedNotes.map((row) => (
              <Link
                key={row._id}
                href={`/teacher/sessions/${row._id}`}
                className="block py-1 text-sm underline"
              >
                {row.title} · Lesson notes to publish
              </Link>
            ))}
          </details>
        )}
      <SlotCalendar
        cells={cells}
        events={events.filter((e) => showCancelled || e.status !== "cancelled")}
        users={students}
        currentDate={date}
        mode={mode}
        viewerTz={viewerTz}
        timeFormat={clock}
        preferenceKey={`${admin ? "admin" : "teacher"}:${me?.externalId}:${teacherId}`}
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
                {view === "day" ? "Day" : "Week"}
              </Button>
            ))}
          </div>
        }
        staffPaint={canEdit && !moving && !adding}
        onPaint={(slots, open) => void paint(slots, open)}
        onCellClick={selectCell}
        onEventClick={(ev) => {
          setEvent(ev);
          setTitle(ev.title);
          setCancelConfirm(false);
        }}
        canDragEvent={(ev) => {
          const row = cal.events.find((e) => e._id === ev._id);
          return (
            !row?.teacherStartedAt &&
            !row?.endedAt &&
            !row?.completedAt &&
            !row?.activeLessonId &&
            zonedToInstant(ev.orgDate, ev.orgStartTime, orgTz).getTime() > now
          );
        }}
        onEventDrop={
          canAssign
            ? (ev, cell) => {
                setMoving(ev);
                setTarget(cell);
                setAdding(false);
              }
            : undefined
        }
        moveMode={!!moving || (adding && !!studentId)}
        proposed={target ?? undefined}
        disabled={saving || refreshing || (adding && !studentId)}
      />
      <Dialog open={!!event} onOpenChange={(value) => !value && setEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{event?.studentName ?? event?.title}</DialogTitle>
          </DialogHeader>
          {event && (
            <>
              <p>
                {event.date} · {formatTime(event.startTime, clock)}–
                {formatTime(event.endTime, clock)}
              </p>
              {event.googleMeetLink && (
                <a
                  href={event.googleMeetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Meeting room
                </a>
              )}
              {!admin &&
                (event.status === "scheduled" || event.status === "makeup") && (
                  <Button
                    disabled={saving || (!activeLessonId && !startReady)}
                    onClick={() =>
                      void run(async () => {
                        if (activeLessonId) {
                          window.location.href = `/teacher/sessions/${activeLessonId}/live`;
                          return;
                        }
                        if (!event.studentId) return;
                        const id = await start({
                          studentId: event.studentId,
                          title: event.title,
                          scheduledFor: zonedToInstant(
                            event.orgDate,
                            event.orgStartTime,
                            orgTz,
                          ).toISOString(),
                          recordingMode: "live",
                          scheduleEventId: event._id as Id<"scheduleEvents">,
                        });
                        window.location.href = `/teacher/sessions/${id}/live`;
                      })
                    }
                  >
                    {activeLessonId
                      ? "Resume lesson"
                      : startReady
                        ? "Start lesson"
                        : "Start opens 10 minutes before"}
                  </Button>
                )}
              {canAssign && (
                <div className="flex gap-2">
                  <Input
                    aria-label="Lesson title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={saving || !title.trim()}
                    onClick={() =>
                      void run(async () => {
                        await rename({
                          eventId: event._id as Id<"scheduleEvents">,
                          title,
                        });
                        setEvent(null);
                      }, "Lesson renamed")
                    }
                  >
                    Rename
                  </Button>
                </div>
              )}
              {preview && (
                <>
                  <p className="text-sm text-muted-foreground">
                    {cancelConfirm
                      ? preview.cancel.reason
                      : preview.reschedule.reason}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={!preview.reschedule.allowed || saving}
                      onClick={() => {
                        setMoving(event);
                        setEvent(null);
                        setAdding(false);
                        setTarget(null);
                      }}
                    >
                      Move lesson
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!preview.cancel.allowed || saving}
                      onClick={() =>
                        cancelConfirm
                          ? void run(async () => {
                              await cancel({
                                eventId: event._id as Id<"scheduleEvents">,
                              });
                              setEvent(null);
                            }, "Lesson cancelled")
                          : setCancelConfirm(true)
                      }
                    >
                      {cancelConfirm ? "Confirm cancellation" : "Cancel lesson"}
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
        onOpenChange={(value) => !value && setTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {moving ? "Move lesson" : "Confirm lesson"}
            </DialogTitle>
          </DialogHeader>
          {target && (
            <>
              <p>
                {target.viewerDate} ·{" "}
                {formatTime(target.viewerStartTime, clock)} · 60-minute
                reservation
              </p>
              {moving && (
                <p className="text-sm">
                  {movePreview?.reason ?? "Checking this time…"}
                </p>
              )}
              {adding && (
                <p className="text-sm">
                  {students.find((s) => s.externalId === studentId)?.name} ·{" "}
                  {cellData.studentBalance < (cellData.lessonCost ?? 1)
                    ? "No lesson credit available. This booking will need payment follow-up."
                    : "Uses one lesson credit."}
                </p>
              )}
              <Button
                disabled={saving || (!!moving && !movePreview?.allowed)}
                onClick={() =>
                  moving
                    ? void run(async () => {
                        await reschedule({
                          eventId: moving._id as Id<"scheduleEvents">,
                          toDate: target.date,
                          toStartTime: target.startTime,
                        });
                        setMoving(null);
                        setTarget(null);
                      }, "Lesson moved")
                    : void saveLesson()
                }
              >
                {saving ? "Saving…" : "Confirm"}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={off} onOpenChange={setOff}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Time off</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Move or cancel lessons first. Removing time off restores your custom
            slots.
          </p>
          <label>
            From
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Through
            <Input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
          </label>
          <Button
            disabled={saving || !from || !until}
            onClick={() =>
              void run(async () => {
                await timeOff({ teacherId, fromDate: from, toDate: until });
                setOff(false);
              }, "Time off saved")
            }
          >
            Block these dates
          </Button>
          {[...offGroups.entries()].map(([id, group]) => (
            <div
              key={id}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span>
                {group.from}–{group.until}
              </span>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() =>
                  void run(
                    () =>
                      removeTimeOff({
                        groupId: id,
                        teacherId,
                        fromDate: group.from,
                        toDate: group.until,
                      }),
                    "Time off removed",
                  )
                }
              >
                Remove
              </Button>
            </div>
          ))}
        </DialogContent>
      </Dialog>
      <Dialog open={repeat} onOpenChange={setRepeat}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Repeat these slots weekly</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Apply the {lastGesture.length} cells you last edited to your usual
            weekly hours from today. Other weekdays and dated exceptions stay in
            place.
          </p>
          <Button
            disabled={saving || !source}
            onClick={() =>
              void run(async () => {
                if (!source) return;
                const effective = source.academyDate;
                const weekly = new Map<
                  string,
                  { dayOfWeek: number; startTime: string; endTime: string }
                >();
                for (const row of source.rows.filter(
                  (r) =>
                    r.isActive &&
                    r.validFrom <= effective &&
                    (!r.validUntil || r.validUntil >= effective),
                ))
                  for (
                    let minute =
                      Number(row.startTime.slice(0, 2)) * 60 +
                      Number(row.startTime.slice(3));
                    minute <
                    Number(row.endTime.slice(0, 2)) * 60 +
                      Number(row.endTime.slice(3));
                    minute += 30
                  )
                    weekly.set(`${row.dayOfWeek}|${calendarSlotTime(minute)}`, {
                      dayOfWeek: row.dayOfWeek,
                      startTime: calendarSlotTime(minute),
                      endTime: calendarSlotTime(minute + 30),
                    });
                for (const cell of lastGesture) {
                  const dayOfWeek = new Date(
                      `${cell.date}T00:00:00Z`,
                    ).getUTCDay(),
                    key = `${dayOfWeek}|${cell.startTime}`;
                  const latest = cellData.cells.find(
                    (c) => calendarSlotKey(c) === calendarSlotKey(cell),
                  );
                  if (latest?.open)
                    weekly.set(key, {
                      dayOfWeek,
                      startTime: cell.startTime,
                      endTime: calendarSlotTime(
                        Number(cell.startTime.slice(0, 2)) * 60 +
                          Number(cell.startTime.slice(3)) +
                          30,
                      ),
                    });
                  else weekly.delete(key);
                }
                await replaceWeekly({
                  teacherId,
                  slots: [...weekly.values()],
                  effectiveFrom: effective,
                  expectedSourceState: source.sourceState,
                });
                setRepeat(false);
                setUndoStack([]);
              }, "Usual weekly hours updated")
            }
          >
            Repeat weekly
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={copy} onOpenChange={setCopy}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy these slots</DialogTitle>
          </DialogHeader>
          <label>
            To date
            <Input
              type="date"
              value={copyDate}
              onChange={(e) => setCopyDate(e.target.value)}
            />
          </label>
          <p className="text-sm">
            Copies your last edited cells. Existing lessons and time off stay
            protected.
          </p>
          <CopyAvailability
            teacherId={teacherId}
            date={copyDate}
            from={lastGesture}
            saving={saving}
            onCopy={(changes) =>
              void run(async () => {
                const id = await edit({
                  teacherId,
                  requestId: crypto.randomUUID(),
                  changes,
                });
                setUndoStack((stack) => [...stack, id]);
                setCopy(false);
              }, "Slots copied")
            }
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
function CopyAvailability({
  teacherId,
  date,
  from,
  saving,
  onCopy,
}: {
  teacherId: string;
  date: string;
  from: CalendarSlot[];
  saving: boolean;
  onCopy: (
    changes: {
      date: string;
      startTime: string;
      open: boolean;
      expectedState: string;
    }[],
  ) => void;
}) {
  const data = useQuery(
    api.calendarAvailability.getCells,
    date ? { teacherId, fromDate: date, toDate: date } : "skip",
  );
  const changes = [
    ...new Map(from.map((cell) => [cell.startTime, cell])).values(),
  ].map((cell) => {
    const target = data?.cells.find((c) => c.startTime === cell.startTime);
    return target?.editable
      ? {
          date,
          startTime: cell.startTime,
          open: cell.open,
          expectedState: target.expectedState,
        }
      : null;
  });
  const valid = changes.filter(
    (cell): cell is NonNullable<typeof cell> => !!cell,
  );
  return (
    <Button
      disabled={
        saving || !data || valid.length !== changes.length || !valid.length
      }
      onClick={() => onCopy(valid)}
    >
      Copy {valid.length} slots
    </Button>
  );
}
