"use client";

// H.7 — Mon–Sun × 06:00–23:00 grid in 30-min increments. Click cells
// to toggle. Drag to bulk-toggle. Save sends a flat slot list to
// convex/vacancies.replaceForTeacher.

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_START = 6;
const HOUR_END = 23;

interface Slot {
  dayOfWeek: number;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
}

function buildTimeRows(): string[] {
  const out: string[] = [];
  for (let h = HOUR_START; h < HOUR_END; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
}

function add30(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const total = h * 60 + m + 30;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60
  ).padStart(2, "0")}`;
}

function expandToHalfHours(slot: Slot): Slot[] {
  const out: Slot[] = [];
  let cur = slot.startTime;
  while (cur < slot.endTime) {
    out.push({
      dayOfWeek: slot.dayOfWeek,
      startTime: cur,
      endTime: add30(cur),
    });
    cur = add30(cur);
  }
  return out;
}

export function VacancyEditor({ teacherId }: { teacherId?: string }) {
  const existing = useQuery(api.vacancies.listForTeacher, {
    teacherId,
  });
  const weeklyHours = useQuery(api.vacancies.getWeeklyHours, {
    teacherId,
  });
  const save = useMutation(api.vacancies.replaceForTeacher);

  const times = useMemo(buildTimeRows, []);
  // Active set keyed by "day|HH:mm" (half-hour cell start).
  const [active, setActive] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const dragMode = useRef<"add" | "remove" | null>(null);

  // Hydrate from server once.
  useEffect(() => {
    if (hydrated || !existing) return;
    const set = new Set<string>();
    for (const row of existing) {
      for (const half of expandToHalfHours({
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
      })) {
        set.add(`${half.dayOfWeek}|${half.startTime}`);
      }
    }
    setActive(set);
    setHydrated(true);
  }, [existing, hydrated]);

  function toggle(day: number, time: string) {
    const key = `${day}|${time}`;
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function paintCell(day: number, time: string) {
    const key = `${day}|${time}`;
    if (dragMode.current === "add") {
      setActive((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    } else if (dragMode.current === "remove") {
      setActive((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function handleMouseDown(day: number, time: string) {
    const key = `${day}|${time}`;
    dragMode.current = active.has(key) ? "remove" : "add";
    toggle(day, time);
  }

  // End drag on window mouseup (so releasing outside the grid works).
  useEffect(() => {
    const up = () => {
      dragMode.current = null;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const slots: Slot[] = [];
      for (const key of active) {
        const [day, start] = key.split("|");
        slots.push({
          dayOfWeek: Number(day),
          startTime: start,
          endTime: add30(start),
        });
      }
      const result = await save({ teacherId, slots });
      toast.success(
        `Saved (${result.count} block${result.count === 1 ? "" : "s"})`
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const totalCells = active.size;
  const totalHours = totalCells * 0.5;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <div className="h3">My weekly availability</div>
          <div className="body-sm" style={{ marginTop: 4 }}>
            Click cells (or drag) to toggle 30-min slots.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="body-sm">
            <strong>{totalHours.toFixed(1)} h</strong>
            {totalHours < 10 && (
              <span style={{ color: "var(--omnic-red)", marginLeft: 6 }}>
                · below 10h minimum
              </span>
            )}
            {typeof weeklyHours === "number" &&
              weeklyHours !== totalHours && (
                <span className="muted" style={{ marginLeft: 6 }}>
                  (saved: {weeklyHours.toFixed(1)} h)
                </span>
              )}
          </span>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="card" style={{ padding: 12, overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            userSelect: "none",
          }}
        >
          <thead>
            <tr>
              <th style={{ width: 60 }}></th>
              {DAYS.map((d, i) => (
                <th
                  key={d}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--omnic-gray-600)",
                    padding: "6px 0",
                    textAlign: "center",
                  }}
                >
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((t, idx) => (
              <tr key={t}>
                <td
                  style={{
                    fontSize: 11,
                    color: "var(--omnic-gray-500)",
                    padding: "0 8px 0 0",
                    textAlign: "right",
                    verticalAlign: "top",
                    height: 18,
                    borderTop:
                      t.endsWith(":00")
                        ? "1px solid var(--omnic-gray-200)"
                        : "1px dashed var(--omnic-gray-100)",
                  }}
                >
                  {t.endsWith(":00") ? t : ""}
                </td>
                {DAYS.map((_, day) => {
                  const key = `${day}|${t}`;
                  const isOn = active.has(key);
                  return (
                    <td
                      key={key}
                      onMouseDown={() => handleMouseDown(day, t)}
                      onMouseEnter={() => paintCell(day, t)}
                      style={{
                        height: 18,
                        borderTop:
                          t.endsWith(":00")
                            ? "1px solid var(--omnic-gray-200)"
                            : "1px dashed var(--omnic-gray-100)",
                        borderLeft: "1px solid var(--omnic-gray-200)",
                        background: isOn
                          ? "var(--omnic-tenant-primary)"
                          : "transparent",
                        cursor: "pointer",
                      }}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
