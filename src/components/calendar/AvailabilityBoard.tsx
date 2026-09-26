"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Doc } from "@convex/dataModel";
import { toast } from "sonner";

const WEEKDAYS = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [0, "Sunday"],
] as const;

type VacancySourceRow = Pick<
  Doc<"teacherVacancies">,
  "dayOfWeek" | "startTime" | "endTime" | "validFrom" | "validUntil" | "isActive"
>;
type AvailabilityRange = Pick<VacancySourceRow, "dayOfWeek" | "startTime" | "endTime">;

function rangesAtDate(rows: VacancySourceRow[], date: string): AvailabilityRange[] {
  return rows
    .filter(
      (row) =>
        row.isActive &&
        row.validFrom <= date &&
        (!row.validUntil || row.validUntil >= date)
    )
    .map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
}

function dayLabel(day: number): string {
  return WEEKDAYS.find(([value]) => value === day)?.[1] ?? "Day";
}

function errorText(error: unknown): string {
  return ((error as Error)?.message ?? "Something went wrong")
    .replace(/^\[.*?\]\s*/, "")
    .split("\n")[0];
}

/**
 * Source-backed weekly availability editor used by admin People and teacher
 * detail, and optionally embedded in the teacher calendar. It deliberately
 * does not use the old inverse-toggle writer: one Save replaces the selected
 * effective weekly source, while Reset restores the last source read.
 */
export function AvailabilityBoard({
  teacherId,
  teacherName,
}: {
  teacherId: string;
  teacherName?: string;
}) {
  const source = useQuery(api.vacancies.getSourceForTeacher, { teacherId });
  const replaceForTeacher = useMutation(api.vacancies.replaceForTeacher);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [draft, setDraft] = useState<AvailabilityRange[]>([]);
  const [baseSourceState, setBaseSourceState] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!source) return;
    if (!effectiveFrom) {
      setEffectiveFrom(source.academyDate);
      setDraft(rangesAtDate(source.rows, source.academyDate));
      setBaseSourceState(source.sourceState);
      return;
    }
    if (!dirty && source.sourceState !== baseSourceState) {
      setDraft(rangesAtDate(source.rows, effectiveFrom));
      setBaseSourceState(source.sourceState);
    }
  }, [source, effectiveFrom, dirty, baseSourceState]);

  const sourceChanged = !!source && !!baseSourceState && source.sourceState !== baseSourceState;

  function reset() {
    if (!source) return;
    setEffectiveFrom(source.academyDate);
    setDraft(rangesAtDate(source.rows, source.academyDate));
    setBaseSourceState(source.sourceState);
    setDirty(false);
  }

  function changeEffectiveFrom(next: string) {
    if (!source || !/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
    if (dirty) {
      toast.error("Reset unsaved changes before changing the effective date");
      return;
    }
    setEffectiveFrom(next);
    setDraft(rangesAtDate(source.rows, next));
  }

  function updateRange(index: number, patch: Partial<AvailabilityRange>) {
    setDraft((current) => current.map((range, i) => (i === index ? { ...range, ...patch } : range)));
    setDirty(true);
  }

  function addRange(dayOfWeek: number) {
    setDraft((current) => [...current, { dayOfWeek, startTime: "09:00", endTime: "17:00" }]);
    setDirty(true);
  }

  function removeRange(index: number) {
    setDraft((current) => current.filter((_, i) => i !== index));
    setDirty(true);
  }

  async function save() {
    if (!source || !dirty || sourceChanged) return;
    setSaving(true);
    try {
      const result = await replaceForTeacher({
        teacherId,
        effectiveFrom,
        expectedSourceState: baseSourceState,
        slots: draft,
      });
      setDirty(false);
      toast.success(`Saved weekly hours from ${result.effectiveFrom}`);
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  if (source === undefined) {
    return <p className="body-sm" aria-busy="true">Loading availability source…</p>;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="availability-source-editor">
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <strong>{teacherName ? `Editing ${teacherName}` : "Weekly availability"}</strong>
        <p className="mt-1 text-muted-foreground">
          Times are academy wall-clock ({source.academyTimezone}). This Save changes the usual weekly source from the selected date until the next scheduled source boundary.
        </p>
        <p className="mt-1 text-muted-foreground">
          Booked lessons are protected: the server rejects a change that would strand one. Approved time off and date-specific exceptions keep their provenance and are managed separately.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">
          Effective from
          <input
            className="input mt-1 block"
            type="date"
            min={source.academyDate}
            value={effectiveFrom}
            onChange={(event) => changeEffectiveFrom(event.target.value)}
          />
        </label>
        <span className="text-xs text-muted-foreground">Today in academy time: {source.academyDate}</span>
      </div>

      {sourceChanged && dirty && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900" role="alert">
          Availability changed elsewhere. Reset to load the latest source before editing again.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {WEEKDAYS.map(([day]) => {
          const dayRanges = draft
            .map((range, index) => ({ range, index }))
            .filter(({ range }) => range.dayOfWeek === day);
          return (
            <section key={day} className="rounded-lg border border-border p-3" aria-labelledby={`availability-day-${day}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 id={`availability-day-${day}`} className="font-semibold">{dayLabel(day)}</h3>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => addRange(day)}>Add range</button>
              </div>
              {dayRanges.length === 0 ? (
                <p className="text-sm text-muted-foreground">Closed</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {dayRanges.map(({ range, index }) => (
                    <div key={`${day}-${index}`} className="flex flex-wrap items-end gap-2">
                      <label className="text-sm">
                        Start
                        <input className="input mt-1 block" type="time" step={900} value={range.startTime} onChange={(event) => updateRange(index, { startTime: event.target.value })} />
                      </label>
                      <span className="pb-2 text-sm text-muted-foreground">to</span>
                      <label className="text-sm">
                        End
                        <input className="input mt-1 block" type="time" step={900} value={range.endTime} onChange={(event) => updateRange(index, { endTime: event.target.value })} />
                      </label>
                      <button type="button" className="btn btn-ghost btn-sm pb-2" onClick={() => removeRange(index)}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        <button type="button" className="btn btn-secondary" disabled={!dirty || saving} onClick={reset}>Reset</button>
        <button type="button" className="btn btn-primary" disabled={!dirty || saving || sourceChanged} onClick={() => void save()}>
          {saving ? "Saving…" : "Save weekly hours"}
        </button>
      </div>
    </div>
  );
}
