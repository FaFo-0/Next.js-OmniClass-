"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Doc } from "@convex/dataModel";
import { toast } from "sonner";
import { AVAILABILITY_DAYS, AvailabilitySlotGrid, expandAvailability, slotMinutes, type AvailabilitySlot } from "./AvailabilitySlotGrid";

type VacancySourceRow = Pick<Doc<"teacherVacancies">, "dayOfWeek" | "startTime" | "endTime" | "validFrom" | "validUntil" | "isActive">;

function rangesAtDate(rows: VacancySourceRow[], date: string): AvailabilitySlot[] {
  return expandAvailability(rows.filter((row) => row.isActive && row.validFrom <= date && (!row.validUntil || row.validUntil >= date)));
}

function weekday(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function addDays(date: string, count: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + count)).toISOString().slice(0, 10);
}

function errorText(error: unknown): string {
  return ((error as Error)?.message ?? "Something went wrong").replace(/^\[.*?\]\s*/, "").split("\n")[0];
}

/** The same visual availability editor is shared by teachers and admins. */
export function AvailabilityBoard({ teacherId, teacherName, onDirtyChange }: { teacherId: string; teacherName?: string; onDirtyChange?: (dirty: boolean) => void }) {
  const source = useQuery(api.vacancies.getSourceForTeacher, { teacherId });
  const replaceForTeacher = useMutation(api.vacancies.replaceForTeacher);
  const replaceDate = useMutation(api.vacancies.replaceDate);
  const [mode, setMode] = useState<"weekly" | "date">("weekly");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const dateSource = useQuery(api.vacancies.getDateSource, mode === "date" && selectedDate ? { teacherId, date: selectedDate } : "skip");
  const [draft, setDraft] = useState<AvailabilitySlot[]>([]);
  const [baseSourceState, setBaseSourceState] = useState("");
  const [loadedKey, setLoadedKey] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copyFrom, setCopyFrom] = useState(1);
  const [copyTo, setCopyTo] = useState<number[]>([]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!source) return;
    if (!effectiveFrom) setEffectiveFrom(source.academyDate);
    if (!selectedDate) setSelectedDate(source.academyDate);
  }, [source, effectiveFrom, selectedDate]);

  useEffect(() => {
    if (!source || !effectiveFrom) return;
    const key = mode === "weekly" ? `${teacherId}|weekly|${effectiveFrom}` : `${teacherId}|date|${selectedDate}`;
    if (mode === "date" && !dateSource) return;
    const state = mode === "weekly" ? source.sourceState : dateSource!.sourceState;
    if (key !== loadedKey || !dirty && state !== baseSourceState) {
      setDraft(mode === "weekly" ? rangesAtDate(source.rows, effectiveFrom) : expandAvailability(dateSource!.slots.map((slot) => ({ ...slot, dayOfWeek: weekday(selectedDate) }))));
      setBaseSourceState(state);
      setLoadedKey(key);
      setDirty(false);
    }
  }, [source, dateSource, effectiveFrom, selectedDate, mode, teacherId, dirty, baseSourceState, loadedKey]);

  const booked = useMemo<AvailabilitySlot[]>(() => {
    const events = mode === "weekly" ? source?.events.filter((event) => event.date >= effectiveFrom) : dateSource?.events;
    return (events ?? []).map((event) => ({ dayOfWeek: weekday(event.date), startTime: event.startTime, endTime: event.endTime }));
  }, [source, dateSource, mode, effectiveFrom]);
  const currentState = mode === "weekly" ? source?.sourceState : dateSource?.sourceState;
  const sourceChanged = !!currentState && !!baseSourceState && currentState !== baseSourceState;
  const dateLoading = mode === "date" && dateSource === undefined;

  function discard() {
    if (!source || mode === "date" && !dateSource) return;
    setDraft(mode === "weekly" ? rangesAtDate(source.rows, effectiveFrom) : expandAvailability(dateSource!.slots.map((slot) => ({ ...slot, dayOfWeek: weekday(selectedDate) }))));
    setBaseSourceState(currentState ?? "");
    setDirty(false);
  }

  function guardNavigation(action: () => void) {
    if (dirty) {
      toast.error("Save or discard your changes first");
      return;
    }
    action();
  }

  function changeSlots(slots: AvailabilitySlot[]) {
    setDraft(slots);
    setDirty(true);
  }

  function copyDay() {
    if (!copyTo.length) return;
    const sourceSlots = draft.filter((slot) => slot.dayOfWeek === copyFrom);
    // Copy never closes selected cells occupied by an existing lesson.
    const protectedSelections = draft.filter((slot) => copyTo.includes(slot.dayOfWeek) && booked.some((event) => event.dayOfWeek === slot.dayOfWeek && slotMinutes(event.startTime) < slotMinutes(slot.endTime) && slotMinutes(event.endTime) > slotMinutes(slot.startTime)));
    changeSlots(expandAvailability([
      ...draft.filter((slot) => !copyTo.includes(slot.dayOfWeek)),
      ...copyTo.flatMap((dayOfWeek) => sourceSlots.map((slot) => ({ ...slot, dayOfWeek }))),
      ...protectedSelections,
    ]));
    toast.success("Hours copied. Save to publish them.");
  }

  async function save() {
    if (!source || !dirty || sourceChanged) return;
    setSaving(true);
    try {
      if (mode === "weekly") {
        await replaceForTeacher({ teacherId, effectiveFrom, expectedSourceState: baseSourceState, slots: draft });
        toast.success("Usual weekly hours saved");
      } else {
        await replaceDate({ teacherId, date: selectedDate, expectedSourceState: baseSourceState, slots: draft.map(({ startTime, endTime }) => ({ startTime, endTime })) });
        toast.success("Hours saved for this date");
      }
      setDirty(false);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  if (source === undefined) return <p className="body-sm" aria-busy="true">Loading working hours…</p>;

  const selectedDay = weekday(selectedDate || source.academyDate);
  const openHours = expandAvailability(draft).length / 2;

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="availability-source-editor">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{teacherName ? `${teacherName} · Working hours` : "Working hours"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Open the slots students can book. Times are shown in academy time ({source.academyTimezone}).</p>
        </div>
        <div className="inline-flex rounded-lg border border-border p-1" aria-label="Availability mode">
          <button type="button" className={`btn btn-sm ${mode === "weekly" ? "btn-primary" : "btn-ghost"}`} disabled={saving} aria-pressed={mode === "weekly"} onClick={() => guardNavigation(() => setMode("weekly"))}>Usual week</button>
          <button type="button" className={`btn btn-sm ${mode === "date" ? "btn-primary" : "btn-ghost"}`} disabled={saving} aria-pressed={mode === "date"} onClick={() => guardNavigation(() => setMode("date"))}>Specific dates</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/30 p-3">
        {mode === "weekly" ? <label className="flex flex-wrap items-center gap-2 text-sm">Repeats weekly from
          <input className="input h-9 py-1" type="date" min={source.academyDate} value={effectiveFrom} disabled={saving} onChange={(event) => { const date = event.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(date)) guardNavigation(() => setEffectiveFrom(date)); }} />
        </label> : <label className="flex flex-wrap items-center gap-2 text-sm">Date
          <input className="input h-9 py-1" type="date" min={source.academyDate} max={addDays(source.academyDate, 60)} value={selectedDate} disabled={saving} onChange={(event) => { const date = event.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(date)) guardNavigation(() => setSelectedDate(date)); }} />
        </label>}
        <span className="text-sm text-muted-foreground">{openHours} open hours{mode === "weekly" ? " per week" : " on this date"}</span>
      </div>

      {sourceChanged && dirty && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="alert">Hours changed elsewhere. Discard your changes to load the latest hours.</p>}

      {mode === "weekly" && <details className="rounded-lg border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">Copy hours to other days</summary>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">From
            <select className="input h-9 py-1" value={copyFrom} disabled={saving} onChange={(event) => { const day = Number(event.target.value); setCopyFrom(day); setCopyTo((current) => current.filter((value) => value !== day)); }}>
              {AVAILABILITY_DAYS.map((day) => <option key={day.dayOfWeek} value={day.dayOfWeek}>{day.label}</option>)}
            </select>
          </label>
          <fieldset className="flex flex-wrap gap-3" disabled={saving}>
            <legend className="sr-only">Copy to days</legend>
            {AVAILABILITY_DAYS.filter((day) => day.dayOfWeek !== copyFrom).map((day) => <label key={day.dayOfWeek} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={copyTo.includes(day.dayOfWeek)} onChange={(event) => setCopyTo((current) => event.target.checked ? [...current, day.dayOfWeek] : current.filter((value) => value !== day.dayOfWeek))} />{day.label.slice(0, 3)}
            </label>)}
          </fieldset>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!copyTo.length || saving} onClick={copyDay}>Copy hours</button>
        </div>
      </details>}

      {dateLoading ? <p className="body-sm" aria-busy="true">Loading this date…</p> : mode === "date" && dateSource?.timeOff ? <div className="rounded-xl border border-border bg-muted/30 p-5">
        <h3 className="font-semibold">Time off on this date</h3>
        <p className="mt-1 text-sm text-muted-foreground">These hours are closed by time off. Update the time-off entry before opening slots here.</p>
      </div> : <AvailabilitySlotGrid
        value={draft}
        onChange={changeSlots}
        booked={booked}
        disabled={saving || sourceChanged}
        days={mode === "date" ? [{ dayOfWeek: selectedDay, label: AVAILABILITY_DAYS.find((day) => day.dayOfWeek === selectedDay)?.label ?? "Day", date: selectedDate }] : undefined}
      />}

      <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3 shadow-sm">
        <span className="text-sm text-muted-foreground" role="status">{saving ? "Saving hours…" : dirty ? "Unsaved changes" : "All changes saved"}</span>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" disabled={!dirty || saving} onClick={discard}>Discard</button>
          <button type="button" className="btn btn-primary" disabled={!dirty || saving || sourceChanged || dateLoading || mode === "date" && dateSource?.timeOff} onClick={() => void save()}>{saving ? "Saving…" : "Save hours"}</button>
        </div>
      </div>
    </div>
  );
}
