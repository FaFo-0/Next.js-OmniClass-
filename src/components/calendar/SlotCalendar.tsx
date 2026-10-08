"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { arSA, enUS, kk, ru } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { instantToZoned } from "@/lib/tz";
import { formatTime, type TimeFormat } from "@/lib/timeFormat";
import {
  calendarSlotKey,
  calendarSlotMinutes,
  calendarSlotTime,
  nextCalendarSlot,
  type CalendarSlot,
  type ProjectedCalendarSlot,
} from "@/lib/calendarSlots";
import {
  eventStatusStyle,
  studentBgColor,
  studentColor,
  type CalendarUser,
} from "./WeeklyCalendar";
import { CalendarWeekStartSelect, type CalendarWeekStart, type CalendarWeekday, type DisplayEvent } from "./calendarShared";

export interface SlotCalendarProps {
  cells: ProjectedCalendarSlot[];
  events: DisplayEvent[];
  users: CalendarUser[];
  currentDate: Date;
  mode?: "day" | "week";
  weekStartsOn?: CalendarWeekday;
  weekStartPreference?: CalendarWeekStart;
  onWeekStartChange?: (value: CalendarWeekStart) => void;
  viewerTz: string;
  preferenceKey?: string;
  timeFormat?: TimeFormat;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onJumpToDate?: (date: Date) => void;
  headerExtra?: ReactNode;
  onCellClick?: (cell: ProjectedCalendarSlot) => void;
  /** One callback per completed gesture; no mutation during pointer movement. */
  onPaint?: (cells: CalendarSlot[], open: boolean) => void;
  staffPaint?: boolean;
  onEventClick?: (event: DisplayEvent) => void;
  /** Caller previews/confirms the complete reservation before writing. */
  onEventDrop?: (event: DisplayEvent, cell: ProjectedCalendarSlot) => void;
  /** Staff policy eligibility; running and finished lessons remain click-only. */
  canDragEvent?: (event: DisplayEvent) => boolean;
  moveMode?: boolean;
  selected?: { date: string; startTime: string }[];
  proposed?: { date: string; startTime: string };
  disabled?: boolean;
}

const HOUR_HEIGHT = 72;
const activeEvent = (event: DisplayEvent) =>
  event.status === "scheduled" || event.status === "makeup";

/** Discrete dated half-hour cells shared by all three portals. */
export function SlotCalendar({
  cells,
  events,
  users,
  currentDate,
  mode = "week",
  weekStartsOn = 1,
  weekStartPreference = "1",
  onWeekStartChange,
  viewerTz,
  preferenceKey = "default",
  timeFormat = "24h",
  onPrevWeek,
  onNextWeek,
  onToday,
  onJumpToDate,
  headerExtra,
  onCellClick,
  onPaint,
  staffPaint = false,
  onEventClick,
  onEventDrop,
  canDragEvent = () => true,
  moveMode = false,
  selected = [],
  proposed,
  disabled = false,
}: SlotCalendarProps) {
  const locale = useLocale();
  const dateLocale =
    locale === "ru" ? ru : locale === "ar" ? arSA : locale === "kk" ? kk : enUS;
  const t = useTranslations("components.calendar");
  // English fallback keeps this shared renderer usable during staff-copy rollout.
  const label = (key: string, fallback: string) =>
    t.has(key) ? t(key) : fallback;
  const weekStart =
    mode === "day"
      ? currentDate
      : startOfWeek(currentDate, { weekStartsOn });
  const dateStart = format(weekStart, "yyyy-MM-dd");
  const days = Array.from({ length: mode === "day" ? 1 : 7 }, (_, index) =>
    addDays(weekStart, index),
  );
  const dayKeys = days.map((day) => format(day, "yyyy-MM-dd"));
  const visibleCells = cells.filter((cell) =>
    dayKeys.includes(cell.viewerDate),
  );
  const visibleEvents = events.filter((event) => dayKeys.includes(event.date));
  const userNames = new Map(users.map((user) => [user.externalId, user.name]));
  const cellMap = useMemo(
    () =>
      new Map(cells.map((cell) => [`${cell.key}@${cell.viewerDate}`, cell])),
    [cells],
  );
  const storageKey = `calendar-start:v2:${preferenceKey}`;
  const [preference, setPreference] = useState("600");
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [earlierContext, setEarlierContext] = useState<string | null>(null);
  useEffect(() => {
    let next = "600";
    try {
      const saved = localStorage.getItem(storageKey) ?? localStorage.getItem(`calendar-start:${preferenceKey}`);
      if (
        (saved === "auto" && localStorage.getItem(storageKey) !== null) ||
        (saved !== null &&
          /^\d+$/.test(saved) &&
          Number(saved) < 1440 &&
          Number(saved) % 30 === 0)
      )
        next = saved;
    } catch {
      /* Private browsing still has a usable default. */
    }
    // Hydrate an external preference once per user.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreference(next);
    setLoadedKey(storageKey);
  }, [storageKey, preferenceKey]);
  useEffect(() => {
    if (loadedKey !== storageKey) return;
    try {
      localStorage.setItem(storageKey, preference);
    } catch {
      /* Optional preference. */
    }
  }, [loadedKey, storageKey, preference]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const viewerNow = instantToZoned(new Date(now), viewerTz);
  const lessonStarts = visibleEvents.map((event) =>
    calendarSlotMinutes(event.startTime),
  );
  const firstLesson = lessonStarts.length ? Math.min(...lessonStarts) : null;
  const availableStarts = visibleCells
    .filter((cell) => cell.open)
    .map((cell) => calendarSlotMinutes(cell.viewerStartTime));
  // Leave a full hour of context before the first lesson. Both lessons and
  // availability are shown inside hourly rows; their canonical starts stay exact.
  const autoStart =
    firstLesson !== null
      ? Math.max(0, (Math.floor(firstLesson / 60) - 1) * 60)
      : Math.floor(
          (availableStarts.length ? Math.min(...availableStarts) : 540) / 60,
        ) * 60;
  const context = `${mode}:${dateStart}:${preference}:${viewerTz}`;
  const requestedStart = preference === "auto" ? autoStart : Number(preference);
  const wantedStart = Math.min(requestedStart, firstLesson ?? 1440);
  // Viewer slots may be :15/:45. Begin at a complete projected cell boundary.
  const boundaries = [
    ...new Set([
      0,
      1440,
      ...Array.from({ length: 48 }, (_, index) => index * 30 + (visibleCells.length ? calendarSlotMinutes(visibleCells[0].viewerStartTime) % 30 : 0)),
      ...(visibleCells.length
        ? visibleCells.flatMap((cell) => [
            calendarSlotMinutes(cell.viewerStartTime),
            calendarSlotMinutes(cell.viewerEndTime),
          ])
        : Array.from({ length: 48 }, (_, index) => index * 30)),
    ]),
  ].sort((a, b) => a - b);
  const boundaryStart =
    boundaries.filter((minute) => minute <= wantedStart).at(-1) ?? 0;
  const startMinute =
    earlierContext === context
      ? 0
      : preference === "auto"
        ? autoStart
        : boundaryStart;
  const gridHeight = ((1440 - startMinute) * HOUR_HEIGHT) / 60;
  const hourRows = Array.from(
    { length: 24 - Math.floor(startMinute / 60) },
    (_, index) => (Math.floor(startMinute / 60) + index) * 60,
  );
  const reservationKeys = new Set(
    selected.flatMap((slot) => [
      calendarSlotKey(slot),
      calendarSlotKey(nextCalendarSlot(slot)),
    ]),
  );
  if (proposed) {
    reservationKeys.add(calendarSlotKey(proposed));
    reservationKeys.add(calendarSlotKey(nextCalendarSlot(proposed)));
  }
  const [paintPreview, setPaintPreview] = useState<{
    keys: Set<string>;
    open: boolean;
  } | null>(null);
  const paintRef = useRef<{
    pointerId: number;
    start: ProjectedCalendarSlot;
    cells: Map<string, ProjectedCalendarSlot>;
    open: boolean;
  } | null>(null);
  const swallowClick = useRef(false);
  const [dragPreview, setDragPreview] = useState<{
    eventId: string;
    target: ProjectedCalendarSlot | null;
  } | null>(null);
  const eventDrag = useRef<{
    pointerId: number;
    event: DisplayEvent;
    x: number;
    y: number;
    moved: boolean;
    target: ProjectedCalendarSlot | null;
  } | null>(null);
  const swallowEventClick = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  function cellUnderPointer(
    x: number,
    y: number,
  ): ProjectedCalendarSlot | null {
    const element = document
      .elementsFromPoint(x, y)
      .map((hit) => hit.closest<HTMLElement>("[data-calendar-cell]"))
      .find((hit) => hit && gridRef.current?.contains(hit));
    if (element && gridRef.current?.contains(element))
      return cellMap.get(element.dataset.calendarCell ?? "") ?? null;
    // Inset slot cards leave small gaps. Painting and dragging through those
    // gaps still target the half-hour beneath the pointer.
    const column = document
      .elementsFromPoint(x, y)
      .map((hit) => hit.closest<HTMLElement>("[data-slot-column]"))
      .find((hit) => hit && gridRef.current?.contains(hit));
    if (!column) return null;
    const minute =
      startMinute +
      ((y - column.getBoundingClientRect().top) * 60) / HOUR_HEIGHT;
    return (
      visibleCells.find(
        (cell) =>
          cell.viewerDate === column.dataset.slotColumn &&
          calendarSlotMinutes(cell.viewerStartTime) <= minute &&
          calendarSlotMinutes(cell.viewerEndTime) > minute,
      ) ?? null
    );
  }
  function editable(cell: ProjectedCalendarSlot) {
    return (
      !disabled &&
      cell.startMs > now &&
      cell.editable === true &&
      !cell.busy &&
      !cell.eventId &&
      !cell.timeOff
    );
  }
  function paintCell(cell: ProjectedCalendarSlot) {
    const gesture = paintRef.current;
    if (!gesture) return;
    const firstDate =
      gesture.start.viewerDate < cell.viewerDate
        ? gesture.start.viewerDate
        : cell.viewerDate;
    const lastDate =
      gesture.start.viewerDate > cell.viewerDate
        ? gesture.start.viewerDate
        : cell.viewerDate;
    const firstMinute = Math.min(
      calendarSlotMinutes(gesture.start.viewerStartTime),
      calendarSlotMinutes(cell.viewerStartTime),
    );
    const lastMinute = Math.max(
      calendarSlotMinutes(gesture.start.viewerStartTime),
      calendarSlotMinutes(cell.viewerStartTime),
    );
    // A fast pointer can skip rows. Select the entire current rectangle,
    // shrinking it again when the pointer moves back toward the anchor.
    gesture.cells = new Map(
      visibleCells
        .filter((candidate) => {
          const minute = calendarSlotMinutes(candidate.viewerStartTime);
          return (
            candidate.viewerDate >= firstDate &&
            candidate.viewerDate <= lastDate &&
            minute >= firstMinute &&
            minute <= lastMinute &&
            editable(candidate)
          );
        })
        .map((candidate) => [candidate.key, candidate]),
    );
    setPaintPreview({
      keys: new Set(gesture.cells.keys()),
      open: gesture.open,
    });
  }
  function finishPaint(cancelled = false) {
    const gesture = paintRef.current;
    paintRef.current = null;
    setPaintPreview(null);
    if (cancelled) swallowClick.current = false;
    if (!cancelled && gesture?.cells.size && onPaint)
      onPaint([...gesture.cells.values()], gesture.open);
  }
  function finishEventDrag(cancelled = false) {
    const gesture = eventDrag.current;
    eventDrag.current = null;
    setDragPreview(null);
    if (
      !cancelled &&
      !disabled &&
      gesture?.moved &&
      activeEvent(gesture.event) &&
      canDragEvent(gesture.event) &&
      gesture.target?.canMove &&
      onEventDrop
    ) {
      swallowEventClick.current = true;
      onEventDrop(gesture.event, gesture.target);
    } else if (!cancelled && gesture?.moved) swallowEventClick.current = true;
    else if (cancelled) swallowEventClick.current = false;
  }

  const title =
    mode === "day"
      ? format(weekStart, "EEEE, MMM d, yyyy", { locale: dateLocale })
      : `${format(weekStart, "MMM d", { locale: dateLocale })} – ${format(days[6], "MMM d, yyyy", { locale: dateLocale })}`;
  const position = (start: number, end: number) => ({
    top: (Math.max(0, start - startMinute) * HOUR_HEIGHT) / 60,
    height:
      (Math.max(1, end - Math.max(start, startMinute)) * HOUR_HEIGHT) / 60,
  });
  const dragKeys = dragPreview?.target
    ? new Set([
        dragPreview.target.key,
        calendarSlotKey(nextCalendarSlot(dragPreview.target)),
      ])
    : new Set<string>();

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="slot-calendar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={label("previousPeriod", "Previous period")}
            onClick={onPrevWeek}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onToday}>
            {t("today")}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={label("nextPeriod", "Next period")}
            onClick={onNextWeek}
          >
            <ChevronRight className="size-4" />
          </Button>
          {onJumpToDate ? (
            <label className="relative cursor-pointer text-base font-semibold sm:text-lg">
              {title}
              <input
                type="date"
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label={label("jumpDate", "Go to date")}
                value={dateStart}
                onChange={(event) => {
                  if (event.target.value)
                    onJumpToDate(parseISO(event.target.value));
                }}
              />
            </label>
          ) : (
            <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "week" && onWeekStartChange && (
            <CalendarWeekStartSelect value={weekStartPreference} onChange={onWeekStartChange} />
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {t("startAt")}
            <select
              className="select"
              style={{ width: "auto", minWidth: 90, fontSize: 12 }}
              aria-label={t("startAt")}
              value={preference}
              onChange={(event) => setPreference(event.target.value)}
            >
              <option value="auto">{t("autoStart")}</option>
              {Array.from({ length: 48 }, (_, index) => (
                <option key={index} value={index * 30}>
                  {formatTime(calendarSlotTime(index * 30), timeFormat)}
                </option>
              ))}
            </select>
          </label>
          {startMinute > 0 && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => setEarlierContext(context)}
            >
              {t("showEarlier")}
            </button>
          )}
          {headerExtra}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {staffPaint
          ? label(
              "paintHint",
              "Click to open or close slots. Drag to select several.",
            )
          : label(
              "selectHint",
              "Select a start to reserve two half-hour cells.",
            )}
      </p>
      <div
        ref={gridRef}
        className="overflow-x-auto rounded-xl border border-border bg-card"
      >
        <div
          className={`grid ${mode === "day" ? "min-w-[280px]" : "min-w-[760px]"}`}
          style={{
            gridTemplateColumns: `64px repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="sticky top-0 z-20 border-b border-e border-border bg-background" />
          {days.map((day) => {
            const date = format(day, "yyyy-MM-dd");
            return (
              <div
                key={date}
                className={`sticky top-0 z-20 border-b border-e border-border p-2 text-center last:border-e-0 ${date < viewerNow.date ? "bg-muted text-muted-foreground" : date === viewerNow.date ? "bg-background text-primary" : "bg-background text-muted-foreground"}`}
              >
                <span className="block text-xs font-medium">
                  {format(day, "EEE", { locale: dateLocale })}
                </span>
                <span className="inline-flex items-center justify-center gap-1 text-lg font-semibold">
                  {format(day, "d")}
                  {date < viewerNow.date && (
                    <LockKeyhole aria-label={t("pastCell")} className="size-3" />
                  )}
                </span>
              </div>
            );
          })}
          <div
            className="relative border-e border-border bg-muted"
            style={{ height: gridHeight }}
          >
            {hourRows.map((hour) => (
              <div
                key={hour}
                data-testid="calendar-hour-row"
                data-hour={calendarSlotTime(hour)}
                className="absolute w-full border-t border-border text-end text-[11px] font-medium tabular-nums text-muted-foreground"
                style={position(hour, hour + 60)}
              >
                <span className="absolute end-2 top-1 leading-none">
                  {formatTime(
                    calendarSlotTime(Math.max(hour, startMinute)),
                    timeFormat,
                  )}
                </span>
              </div>
            ))}
          </div>
          {days.map((day) => {
            const date = format(day, "yyyy-MM-dd");
            return (
              <div
                key={date}
                className="relative overflow-hidden border-e border-border last:border-e-0"
                data-slot-column={date}
                style={{ height: gridHeight }}
              >
                {hourRows.map((hour) => (
                  <div
                    key={`hour-${hour}`}
                    aria-hidden="true"
                    className="pointer-events-none absolute z-10 w-full border-t border-border"
                    style={position(hour, hour + 60)}
                  >
                    {hour + 30 > startMinute && (
                      <div
                        className="absolute w-full border-t border-dashed border-border/60"
                        style={{
                          top:
                            ((hour + 30 - Math.max(hour, startMinute)) *
                              HOUR_HEIGHT) /
                            60,
                        }}
                      />
                    )}
                  </div>
                ))}
                {visibleCells
                  .filter(
                    (cell) =>
                      cell.viewerDate === date &&
                      calendarSlotMinutes(cell.viewerEndTime) > startMinute,
                  )
                  .map((cell) => {
                    const key = `${cell.key}@${cell.viewerDate}`;
                    const busy = cell.busy || !!cell.eventId;
                    const past = cell.startMs <= now;
                    const preview = paintPreview?.keys.has(cell.key)
                      ? paintPreview.open
                      : cell.open;
                    const highlighted =
                      reservationKeys.has(cell.key) || dragKeys.has(cell.key);
                    const cellLabel = past
                      ? t("pastCell")
                      : cell.timeOff
                        ? label("timeOffCell", "Time off")
                        : busy
                        ? cell.eventId
                          ? label("bookedCell", "Booked")
                          : label("busyCell", "Busy")
                        : highlighted
                          ? label("selectedCell", "Selected")
                          : preview
                            ? t("openCell")
                            : label("closedCell", "Closed");
                    const canInteract =
                      !disabled &&
                      !past &&
                      (staffPaint && onPaint
                        ? editable(cell)
                        : moveMode
                          ? cell.canMove
                          : cell.canBook);
                    return (
                      <button
                        key={key}
                        type="button"
                        data-calendar-cell={key}
                        data-canonical-slot={cell.key}
                        data-past={past || undefined}
                        title={past ? t("pastHint") : undefined}
                        className={`absolute flex select-none items-center justify-between gap-1 overflow-hidden border-t px-2 text-start text-[11px] leading-tight focus-visible:z-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${past ? "bg-slate-200 text-muted-foreground" : cell.timeOff ? "bg-amber-100 text-amber-900" : busy ? "bg-muted text-muted-foreground" : highlighted ? "bg-purple-200 text-purple-950 ring-2 ring-inset ring-purple-500" : preview ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"} ${calendarSlotMinutes(cell.viewerStartTime) % 60 === 0 ? "border-border" : "border-dashed border-border/60"} ${past ? "cursor-not-allowed" : canInteract ? "cursor-pointer" : "cursor-default"}`}
                        style={{
                          top:
                            position(
                              calendarSlotMinutes(cell.viewerStartTime),
                              calendarSlotMinutes(cell.viewerEndTime),
                            ).top,
                          height: Math.max(
                            8,
                            position(
                              calendarSlotMinutes(cell.viewerStartTime),
                              calendarSlotMinutes(cell.viewerEndTime),
                            ).height,
                          ),
                          insetInlineStart: 0,
                          insetInlineEnd: 0,
                          backgroundImage: past ? "repeating-linear-gradient(135deg, transparent, transparent 6px, rgb(148 163 184 / 0.12) 6px, rgb(148 163 184 / 0.12) 7px)" : undefined,
                        }}
                        aria-label={`${format(day, "EEEE, MMM d", { locale: dateLocale })} ${formatTime(cell.viewerStartTime, timeFormat)}–${formatTime(cell.viewerEndTime, timeFormat)}: ${cellLabel}`}
                        aria-pressed={highlighted || preview}
                        aria-disabled={!canInteract}
                        tabIndex={canInteract ? 0 : -1}
                        onPointerDown={(event) => {
                          if (
                            !staffPaint ||
                            !onPaint ||
                            !editable(cell) ||
                            event.pointerType === "touch" ||
                            event.button !== 0
                          )
                            return;
                          event.preventDefault();
                          swallowClick.current = true;
                          paintRef.current = {
                            pointerId: event.pointerId,
                            start: cell,
                            cells: new Map(),
                            open: !cell.open,
                          };
                          event.currentTarget.setPointerCapture(
                            event.pointerId,
                          );
                          paintCell(cell);
                        }}
                        onPointerMove={(event) => {
                          if (paintRef.current?.pointerId !== event.pointerId)
                            return;
                          const target = cellUnderPointer(
                            event.clientX,
                            event.clientY,
                          );
                          if (target) paintCell(target);
                        }}
                        onPointerUp={() => {
                          if (paintRef.current) finishPaint();
                        }}
                        onPointerCancel={() => finishPaint(true)}
                        onLostPointerCapture={() => {
                          if (paintRef.current) finishPaint(true);
                        }}
                        onClick={(event) => {
                          if (event.detail !== 0 && swallowClick.current) {
                            swallowClick.current = false;
                            return;
                          }
                          swallowClick.current = false;
                          if (!canInteract) return;
                          if (staffPaint && onPaint)
                            onPaint([cell], !cell.open);
                          else onCellClick?.(cell);
                        }}
                      >
                        {!past && <span className="min-w-0 truncate">{cellLabel}</span>}
                      </button>
                    );
                  })}
                {visibleEvents
                  .filter(
                    (event) =>
                      event.date === date &&
                      calendarSlotMinutes(event.endTime) > startMinute,
                  )
                  .map((event) => {
                    const state = eventStatusStyle(event.status);
                    const draggable =
                      !disabled &&
                      !!onEventDrop &&
                      activeEvent(event) &&
                      canDragEvent(event);
                    const name =
                      (event.studentId
                        ? userNames.get(event.studentId)
                        : null) ??
                      event.studentName ??
                      event.teacherName ??
                      event.title;
                    const color =
                      state?.border ??
                      (event.studentId
                        ? studentColor(event.studentId)
                        : "var(--brand-purple)");
                    const fill =
                      state?.bg ??
                      (event.studentId
                        ? studentBgColor(event.studentId)
                        : "var(--brand-purple-tint)");
                    return (
                      <button
                        key={`${event._id}@${event.date}`}
                        type="button"
                        className={`absolute z-10 overflow-hidden rounded-lg border px-2 py-1 text-start text-xs shadow-sm focus-visible:z-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${state?.faded ? "opacity-50" : ""} ${state?.strike ? "line-through" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${dragPreview?.eventId === event._id ? "opacity-50" : ""}`}
                        style={{
                          ...position(
                            calendarSlotMinutes(event.startTime),
                            calendarSlotMinutes(event.endTime),
                          ),
                          insetInlineStart: 3,
                          insetInlineEnd: 3,
                          background: fill,
                          borderColor: color,
                          borderInlineStartWidth: 3,
                          touchAction: "pan-y",
                        }}
                        title={`${name} · ${formatTime(event.startTime, timeFormat)}–${formatTime(event.endTime, timeFormat)}`}
                        aria-label={`${name}: ${formatTime(event.startTime, timeFormat)}–${formatTime(event.endTime, timeFormat)}${state ? `, ${state.label}` : `, ${label("bookedCell", "Booked")}`}`}
                        onPointerDown={(pointer) => {
                          // Touch users scroll normally and move through the lesson dialog.
                          if (
                            !draggable ||
                            pointer.pointerType === "touch" ||
                            pointer.button !== 0
                          )
                            return;
                          eventDrag.current = {
                            pointerId: pointer.pointerId,
                            event,
                            x: pointer.clientX,
                            y: pointer.clientY,
                            moved: false,
                            target: null,
                          };
                          pointer.currentTarget.setPointerCapture(
                            pointer.pointerId,
                          );
                        }}
                        onPointerMove={(pointer) => {
                          const gesture = eventDrag.current;
                          if (
                            !gesture ||
                            gesture.pointerId !== pointer.pointerId
                          )
                            return;
                          if (!canDragEvent(gesture.event)) {
                            finishEventDrag(true);
                            return;
                          }
                          if (
                            !gesture.moved &&
                            Math.hypot(
                              pointer.clientX - gesture.x,
                              pointer.clientY - gesture.y,
                            ) < 5
                          )
                            return;
                          gesture.moved = true;
                          const target = cellUnderPointer(
                            pointer.clientX,
                            pointer.clientY,
                          );
                          gesture.target =
                            target?.canMove && !target.continuation
                              ? target
                              : null;
                          setDragPreview({
                            eventId: gesture.event._id,
                            target: gesture.target,
                          });
                        }}
                        onPointerUp={() => {
                          if (eventDrag.current) finishEventDrag();
                        }}
                        onPointerCancel={() => finishEventDrag(true)}
                        onLostPointerCapture={() => {
                          if (eventDrag.current) finishEventDrag(true);
                        }}
                        onClick={(click) => {
                          if (click.detail !== 0 && swallowEventClick.current) {
                            swallowEventClick.current = false;
                            return;
                          }
                          swallowEventClick.current = false;
                          onEventClick?.(event);
                        }}
                      >
                        <span
                          className="block truncate font-semibold"
                          style={{ color }}
                        >
                          {name}
                        </span>
                        <span className="block truncate text-[10px]">
                          {state?.label ??
                            `${formatTime(event.startTime, timeFormat)}–${formatTime(event.endTime, timeFormat)}`}
                        </span>
                      </button>
                    );
                  })}
                {date === viewerNow.date &&
                  calendarSlotMinutes(viewerNow.time) >= startMinute && (
                    <div
                      className="pointer-events-none absolute z-20 h-0.5 bg-red-500/80"
                      style={{
                        top:
                          ((calendarSlotMinutes(viewerNow.time) - startMinute) *
                            HOUR_HEIGHT) /
                          60,
                        insetInlineStart: 0,
                        insetInlineEnd: 0,
                      }}
                      aria-hidden="true"
                    />
                  )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
