// H.7 — Teacher weekly recurring vacancies.
// Granularity = 30-minute slots, stored as half-open intervals
// [startTime, endTime). The teacher UI paints a Mon–Sun × 06:00–23:00
// grid; clicking a cell toggles a 30-min vacancy row. We collapse
// adjacent rows into a single longer interval on save (server-side).

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTenant, requireTenantPermission } from "./lib/tenant";

const NOW = () => new Date().toISOString();
const TODAY = () => new Date().toISOString().slice(0, 10);

export const listForTeacher = query({
  args: { teacherId: v.optional(v.string()) },
  handler: async (ctx, { teacherId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = teacherId ?? user.externalId;
    const rows = await ctx.db
      .query("teacherVacancies")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", target)
      )
      .collect();
    return rows
      .filter((r) => r.isActive)
      .sort(
        (a, b) =>
          a.dayOfWeek - b.dayOfWeek ||
          a.startTime.localeCompare(b.startTime)
      );
  },
});

/**
 * Replace this teacher's vacancies wholesale. The UI sends the
 * complete list every save; we clear the old rows and insert fresh.
 * Cheaper than a diff and the row count is small (<200 per teacher).
 */
export const replaceForTeacher = mutation({
  args: {
    teacherId: v.optional(v.string()),
    slots: v.array(
      v.object({
        dayOfWeek: v.number(), // 0-6
        startTime: v.string(), // HH:mm
        endTime: v.string(), // HH:mm
      })
    ),
  },
  handler: async (ctx, { teacherId, slots }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = teacherId ?? user.externalId;
    if (target !== user.externalId && user.role !== "admin") {
      throw new Error(
        "Only admins can edit another teacher's vacancies"
      );
    }
    const existing = await ctx.db
      .query("teacherVacancies")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", target)
      )
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    // Merge adjacent slots on the same day for cleaner storage.
    const merged = mergeSlots(slots);
    const now = NOW();
    const today = TODAY();
    for (const s of merged) {
      await ctx.db.insert("teacherVacancies", {
        organizationId: orgId,
        teacherId: target,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        validFrom: today,
        isActive: true,
        createdAt: now,
      });
    }
    return { count: merged.length };
  },
});

function mergeSlots(
  slots: { dayOfWeek: number; startTime: string; endTime: string }[]
): { dayOfWeek: number; startTime: string; endTime: string }[] {
  const byDay = new Map<number, typeof slots>();
  for (const s of slots) {
    const arr = byDay.get(s.dayOfWeek) ?? [];
    arr.push(s);
    byDay.set(s.dayOfWeek, arr);
  }
  const out: typeof slots = [];
  for (const [day, arr] of byDay) {
    arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    let cur = { ...arr[0] };
    for (let i = 1; i < arr.length; i++) {
      const nxt = arr[i];
      if (nxt.startTime === cur.endTime) {
        cur.endTime = nxt.endTime;
      } else {
        out.push(cur);
        cur = { ...nxt };
      }
    }
    out.push(cur);
  }
  return out;
}

/** Total weekly hours — used for the "<10 hr" soft warning. */
export const getWeeklyHours = query({
  args: { teacherId: v.optional(v.string()) },
  handler: async (ctx, { teacherId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = teacherId ?? user.externalId;
    const rows = await ctx.db
      .query("teacherVacancies")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", target)
      )
      .collect();
    let mins = 0;
    for (const r of rows) {
      if (!r.isActive) continue;
      const [sh, sm] = r.startTime.split(":").map(Number);
      const [eh, em] = r.endTime.split(":").map(Number);
      mins += eh * 60 + em - (sh * 60 + sm);
    }
    return mins / 60;
  },
});

/**
 * H.9 — turn a teacher's recurring vacancies into a list of
 * concrete bookable slots in [from, to). Subtracts existing
 * scheduleEvents that would conflict.
 */
export const getBookableSlots = query({
  args: {
    teacherId: v.string(),
    fromDate: v.string(), // YYYY-MM-DD
    toDate: v.string(),
  },
  handler: async (ctx, { teacherId, fromDate, toDate }) => {
    const { orgId } = await requireTenant(ctx);
    const vacancies = await ctx.db
      .query("teacherVacancies")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", teacherId)
      )
      .collect();
    const events = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", teacherId)
      )
      .collect();
    const busy = new Set<string>();
    for (const e of events) {
      if (e.isDeleted) continue;
      if (e.status === "cancelled") continue;
      if (e.date < fromDate || e.date > toDate) continue;
      busy.add(`${e.date}|${e.startTime}`);
    }
    const slots: {
      date: string;
      dayOfWeek: number;
      startTime: string;
      endTime: string;
      isBooked: boolean;
    }[] = [];
    const start = new Date(fromDate);
    const end = new Date(toDate);
    for (
      let d = new Date(start);
      d <= end;
      d.setDate(d.getDate() + 1)
    ) {
      const dayOfWeek = d.getDay();
      const dateStr = d.toISOString().slice(0, 10);
      const dayVacancies = vacancies.filter(
        (v) => v.isActive && v.dayOfWeek === dayOfWeek
      );
      for (const v of dayVacancies) {
        // Walk in 30-min increments across the vacancy window.
        let cursor = v.startTime;
        while (cursor < v.endTime) {
          const next = addMinutes(cursor, 30);
          slots.push({
            date: dateStr,
            dayOfWeek,
            startTime: cursor,
            endTime: next,
            isBooked: busy.has(`${dateStr}|${cursor}`),
          });
          cursor = next;
        }
      }
    }
    return slots;
  },
});

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const nh = String(Math.floor(total / 60)).padStart(2, "0");
  const nm = String(total % 60).padStart(2, "0");
  return `${nh}:${nm}`;
}
