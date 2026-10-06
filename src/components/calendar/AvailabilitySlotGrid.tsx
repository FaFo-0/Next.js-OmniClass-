"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export type AvailabilitySlot = { dayOfWeek: number; startTime: string; endTime: string };
export type AvailabilityGridDay = { dayOfWeek: number; label: string; date?: string };

export const AVAILABILITY_DAYS: AvailabilityGridDay[] = [
  { dayOfWeek: 1, label: "Monday" }, { dayOfWeek: 2, label: "Tuesday" },
  { dayOfWeek: 3, label: "Wednesday" }, { dayOfWeek: 4, label: "Thursday" },
  { dayOfWeek: 5, label: "Friday" }, { dayOfWeek: 6, label: "Saturday" },
  { dayOfWeek: 0, label: "Sunday" },
];

export function slotMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function slotTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function expandAvailability(slots: AvailabilitySlot[]): AvailabilitySlot[] {
  const cells = new Map<string, AvailabilitySlot>();
  for (const slot of slots) {
    for (let minute = Math.ceil(slotMinutes(slot.startTime) / 30) * 30; minute + 30 <= slotMinutes(slot.endTime); minute += 30) {
      const startTime = slotTime(minute);
      cells.set(`${slot.dayOfWeek}|${startTime}`, { dayOfWeek: slot.dayOfWeek, startTime, endTime: slotTime(minute + 30) });
    }
  }
  return [...cells.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
}

/** Controlled editor: callers own saving and timezone conversion. */
export function AvailabilitySlotGrid({
  value,
  onChange,
  booked = [],
  days = AVAILABILITY_DAYS,
  disabled = false,
}: {
  value: AvailabilitySlot[];
  onChange: (slots: AvailabilitySlot[]) => void;
  booked?: AvailabilitySlot[];
  days?: AvailabilityGridDay[];
  disabled?: boolean;
}) {
  const t = useTranslations("components.availability");
  const tc = useTranslations("components.calendar");
  const dayLabel = (day: AvailabilityGridDay) => t(`days.${day.dayOfWeek}`);
  const gridId = useId();
  const [mobileDay, setMobileDay] = useState(days[0]?.dayOfWeek ?? 1);
  const [startAt, setStartAt] = useState("auto");
  const [fullDay, setFullDay] = useState(false);
  const paint = useRef<{ open: boolean; seen: Set<string>; pointerId: number } | null>(null);
  const handledPointerClick = useRef(false);
  const valueRef = useRef(value);
  useEffect(() => { valueRef.current = value; }, [value]);
  const selected = new Set(expandAvailability(value).map((slot) => `${slot.dayOfWeek}|${slot.startTime}`));
  const isBooked = (day: number, minute: number) => booked.some((slot) => slot.dayOfWeek === day && slotMinutes(slot.startTime) < minute + 30 && slotMinutes(slot.endTime) > minute);
  const earliest = Math.min(...value.map((slot) => slotMinutes(slot.startTime)), ...booked.map((slot) => slotMinutes(slot.startTime)), 24 * 60);
  const desiredStart = startAt === "auto" ? (earliest === 24 * 60 ? 9 * 60 : earliest) : Number(startAt);
  const startMinute = fullDay ? 0 : Math.floor(Math.min(desiredStart, ...booked.map((slot) => slotMinutes(slot.startTime))) / 30) * 30;
  const minutes = Array.from({ length: (1440 - startMinute) / 30 }, (_, index) => startMinute + index * 30);
  const currentMobileDay = days.some((day) => day.dayOfWeek === mobileDay) ? mobileDay : days[0]?.dayOfWeek;

  function setCell(day: number, minute: number, open: boolean) {
    if (disabled || isBooked(day, minute)) return;
    const key = `${day}|${slotTime(minute)}`;
    const cells = expandAvailability(valueRef.current);
    const existing = cells.some((slot) => `${slot.dayOfWeek}|${slot.startTime}` === key);
    if (existing === open) return;
    const next = open
      ? [...cells, { dayOfWeek: day, startTime: slotTime(minute), endTime: slotTime(minute + 30) }]
      : cells.filter((slot) => `${slot.dayOfWeek}|${slot.startTime}` !== key);
    valueRef.current = next;
    onChange(next);
  }

  function paintCell(day: number, minute: number) {
    const gesture = paint.current;
    if (!gesture) return;
    const key = `${day}|${minute}`;
    if (gesture.seen.has(key)) return;
    gesture.seen.add(key);
    setCell(day, minute, gesture.open);
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">{t("paintHint")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 whitespace-nowrap">{tc("startAt")}
            <select className="input h-9 py-1" value={startAt} onChange={(event) => { setStartAt(event.target.value); setFullDay(false); }}>
              <option value="auto">{tc("autoStart")}</option>
              {Array.from({ length: 48 }, (_, index) => <option key={index} value={index * 30}>{slotTime(index * 30)}</option>)}
            </select>
          </label>
          {startMinute > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFullDay(true)}>{tc("showEarlier")}</button>}
          {fullDay && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFullDay(false)}>{t("useSelectedStart")}</button>}
        </div>
      </div>
      {days.length > 1 && <label className="flex items-center gap-2 text-sm md:hidden">{t("day")}
        <select className="input" value={currentMobileDay} onChange={(event) => setMobileDay(Number(event.target.value))}>
          {days.map((day) => <option key={day.dayOfWeek} value={day.dayOfWeek}>{dayLabel(day)}</option>)}
        </select>
      </label>}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label={t("legend")}>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-200" />{t("open")}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-border bg-muted" />{t("closed")}</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-primary/20" />{t("protected")}</span>
      </div>
      <div className="max-h-[65vh] overflow-auto rounded-xl border border-border" data-availability-grid={gridId}>
        <div className="grid grid-cols-[4.25rem_1fr] md:grid-cols-[4.25rem_repeat(var(--availability-days),minmax(0,1fr))]" style={{ "--availability-days": days.length } as React.CSSProperties}>
          <div className="sticky top-0 z-20 border-b border-border bg-background p-2 text-xs text-muted-foreground">{t("time")}</div>
          {days.map((day) => <div key={day.dayOfWeek} className={`${day.dayOfWeek === currentMobileDay ? "block" : "hidden"} sticky top-0 z-20 border-b border-s border-border bg-background p-2 text-center text-sm font-semibold md:block`}>
            {dayLabel(day)}<span className="block text-xs font-normal text-muted-foreground">{day.date}</span>
          </div>)}
          {minutes.map((minute) => <div key={minute} className="contents">
            <div className="border-b border-border bg-muted/20 px-2 py-2 text-xs tabular-nums text-muted-foreground">{slotTime(minute)}</div>
            {days.map((day) => {
              const bookedCell = isBooked(day.dayOfWeek, minute);
              const open = selected.has(`${day.dayOfWeek}|${slotTime(minute)}`);
              return <button
                type="button"
                key={`${day.dayOfWeek}|${minute}`}
                data-slot-cell="true"
                data-slot-day={day.dayOfWeek}
                data-slot-minute={minute}
                disabled={disabled || bookedCell}
                aria-pressed={open}
                aria-label={`${dayLabel(day)} ${slotTime(minute)}–${slotTime(minute + 30)}: ${bookedCell ? t("protected") : open ? t("open") : t("closed")}`}
                title={bookedCell ? t("protectHint") : undefined}
                className={`${day.dayOfWeek === currentMobileDay ? "block" : "hidden"} min-h-9 select-none border-b border-s border-border px-1 text-xs transition-colors focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary md:block ${bookedCell ? "cursor-not-allowed bg-primary/20 text-primary" : open ? "bg-emerald-100 text-emerald-950 hover:bg-emerald-200" : "bg-background hover:bg-muted"} disabled:opacity-70`}
                onPointerDown={(event) => {
                  if (event.pointerType === "touch") { handledPointerClick.current = false; return; }
                  if (event.button !== 0 || disabled || bookedCell) return;
                  handledPointerClick.current = true;
                  event.preventDefault();
                  paint.current = { open: !open, seen: new Set(), pointerId: event.pointerId };
                  event.currentTarget.setPointerCapture(event.pointerId);
                  paintCell(day.dayOfWeek, minute);
                }}
                onPointerMove={(event) => {
                  if (!paint.current || paint.current.pointerId !== event.pointerId) return;
                  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-slot-cell]");
                  if (cell?.closest("[data-availability-grid]")?.getAttribute("data-availability-grid") !== gridId) return;
                  if (cell) paintCell(Number(cell.dataset.slotDay), Number(cell.dataset.slotMinute));
                }}
                onPointerUp={() => { paint.current = null; }}
                onPointerCancel={() => { paint.current = null; }}
                onLostPointerCapture={() => { paint.current = null; }}
                onClick={(event) => {
                  if (event.detail === 0 || !handledPointerClick.current) setCell(day.dayOfWeek, minute, !open);
                  handledPointerClick.current = false;
                }}
              >{bookedCell ? t("booked") : open ? t("open") : <span className="sr-only">{t("closed")}</span>}</button>;
            })}
          </div>)}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("cellHint")}</p>
    </div>
  );
}
