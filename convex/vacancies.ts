// H.7 — Teacher weekly recurring vacancies.
// Granularity = 30-minute slots, stored as half-open intervals
// [startTime, endTime). The teacher UI paints a Mon–Sun × 06:00–23:00
// grid; clicking a cell toggles a 30-min vacancy row. We collapse
// adjacent rows into a single longer interval on save (server-side).

import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTenant, requireTenantPermission } from "./lib/tenant";
import type { Doc } from "./_generated/dataModel";
import { instantToZoned } from "./lib/time";

const NOW = () => new Date().toISOString();
async function academyToday(ctx: Parameters<typeof requireTenant>[0], orgId: string): Promise<string> {
  const settings = await ctx.db
    .query("tenantSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .unique();
  return instantToZoned(new Date(), settings?.timezone ?? "UTC").date;
}

function timeToMinutes(time: string): number {
  if (time === "24:00") return 24 * 60;
  if (!/^\d{2}:\d{2}$/.test(time)) return Number.NaN;
  const [hour, minute] = time.split(":").map(Number);
  if (hour > 23 || minute > 59) return Number.NaN;
  return hour * 60 + minute;
}

function previousDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day - 1));
  return d.toISOString().slice(0, 10);
}

function sourceState(rows: Doc<"teacherVacancies">[]): string {
  return JSON.stringify(
    rows
      .map((row) => ({
        id: row._id,
        teacherId: row.teacherId,
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
        validFrom: row.validFrom,
        validUntil: row.validUntil ?? null,
        isActive: row.isActive,
      }))
      .sort((a, b) => `${a.validFrom}|${a.dayOfWeek}|${a.startTime}|${a.id}`.localeCompare(`${b.validFrom}|${b.dayOfWeek}|${b.startTime}|${b.id}`))
  );
}

async function resolveTeacherTarget(
  ctx: Parameters<typeof requireTenant>[0],
  orgId: string,
  user: Doc<"users">,
  requested?: string,
  readOnly = false,
): Promise<string> {
  const target = requested ?? user.externalId;
  if (user.role === "student" && (!readOnly || target !== user.teacherId)) {
    throw new ConvexError("Students can only view their assigned teacher's availability");
  }
  if (user.role === "teacher" && target !== user.externalId) {
    throw new ConvexError("Teachers can only edit their own availability");
  }
  if (user.role !== "admin" && user.role !== "teacher" && user.role !== "student") {
    throw new ConvexError("Availability access denied");
  }
  const teacher = await ctx.db
    .query("users")
    .withIndex("by_organization_and_externalId", (q) =>
      q.eq("organizationId", orgId).eq("externalId", target)
    )
    .unique();
  if (!teacher || teacher.role !== "teacher") throw new ConvexError("Teacher not found");
  return teacher.externalId;
}

function normalizeSlots(slots: { dayOfWeek: number; startTime: string; endTime: string }[]) {
  const valid = slots.map((slot) => {
    if (!Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 0 || slot.dayOfWeek > 6) {
      throw new ConvexError("Invalid weekday");
    }
    const start = timeToMinutes(slot.startTime);
    const end = timeToMinutes(slot.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end > 24 * 60) {
      throw new ConvexError("Availability ranges must be ordered HH:mm intervals");
    }
    return { ...slot };
  });
  return mergeSlots(valid);
}

function covers(
  rows: { dayOfWeek: number; startTime: string; endTime: string; validFrom: string; validUntil?: string; isActive: boolean }[],
  date: string,
  startTime: string,
  endTime: string,
): boolean {
  const [year, month, day] = date.split("-").map(Number);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return rows.some((row) =>
    row.isActive && row.dayOfWeek === dayOfWeek && row.validFrom <= date &&
    (!row.validUntil || row.validUntil >= date) &&
    timeToMinutes(row.startTime) <= start && timeToMinutes(row.endTime) >= end
  );
}

export const listForTeacher = query({
  args: { teacherId: v.optional(v.string()) },
  handler: async (ctx, { teacherId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = await resolveTeacherTarget(ctx, orgId, user, teacherId, true);
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

/** Complete source model for an editor. `listForTeacher` stays array-shaped
 * for legacy readers; new editors use this preconditioned read. */
export const getSourceForTeacher = query({
  args: { teacherId: v.optional(v.string()) },
  handler: async (ctx, { teacherId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = await resolveTeacherTarget(ctx, orgId, user, teacherId, true);
    const rows = await ctx.db
      .query("teacherVacancies")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", target)
      )
      .collect();
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const academyTimezone = settings?.timezone ?? "UTC";
    return {
      teacherId: target,
      rows,
      academyTimezone,
      academyDate: instantToZoned(new Date(), academyTimezone).date,
      sourceState: sourceState(rows),
    };
  },
});

/** Replace this teacher's weekly source without deleting history. The UI sends the
 * complete list for the selected effective interval; rows are normalized and
 * adjacent/overlapping ranges are coalesced before the atomic write.
 */
export const replaceForTeacher = mutation({
  args: {
    teacherId: v.optional(v.string()),
    effectiveFrom: v.optional(v.string()),
    expectedSourceState: v.string(),
    slots: v.array(
      v.object({
        dayOfWeek: v.number(), // 0-6
        startTime: v.string(), // HH:mm
        endTime: v.string(), // HH:mm
      })
    ),
  },
  handler: async (ctx, { teacherId, slots, effectiveFrom, expectedSourceState }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "scheduling.edit");
    const target = await resolveTeacherTarget(ctx, orgId, user, teacherId);
    const existing = await ctx.db
      .query("teacherVacancies")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", target)
      )
      .collect();
    if (sourceState(existing) !== expectedSourceState) {
      throw new ConvexError("Availability changed in another editor; reload before saving");
    }
    const today = await academyToday(ctx, orgId);
    const startDate = effectiveFrom ?? today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate < today) {
      throw new ConvexError("Availability changes cannot start before today");
    }
    const merged = normalizeSlots(slots);
    const futureBoundaries = existing
      .filter((row) => row.isActive && row.validFrom > startDate)
      .map((row) => row.validFrom)
      .sort();
    const nextBoundary = futureBoundaries[0];
    const currentRows = existing.filter(
      (row) => row.isActive && row.validFrom <= startDate &&
        (!row.validUntil || row.validUntil >= startDate)
    );
    const events = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", target)
      )
      .collect();
    const proposedRows = merged.map((slot) => ({
      ...slot,
      validFrom: startDate,
      validUntil: nextBoundary ? previousDate(nextBoundary) : undefined,
      isActive: true,
    }));
    const protectedEvents = events.filter((event) =>
      !event.isDeleted &&
      (event.status === "scheduled" || event.status === "makeup") &&
      event.date >= startDate && (!nextBoundary || event.date < nextBoundary) &&
      covers(currentRows, event.date, event.startTime, event.endTime) &&
      !covers(proposedRows, event.date, event.startTime, event.endTime)
    );
    if (protectedEvents.length > 0) {
      const first = protectedEvents
        .slice()
        .sort((a, b) => `${a.date}|${a.startTime}`.localeCompare(`${b.date}|${b.startTime}`))[0];
      throw new ConvexError(`Availability change would strand the booked lesson on ${first.date} at ${first.startTime}`);
    }

    // Close only the active interval being replaced. Historical rows and a
    // later scheduled pattern remain intact; time-off lives in slotExceptions
    // and is deliberately not rewritten here.
    for (const row of currentRows) {
      if (row.validFrom < startDate) {
        await ctx.db.patch(row._id, { validUntil: previousDate(startDate) });
      } else {
        await ctx.db.delete(row._id);
      }
    }
    const now = NOW();
    for (const s of merged) {
      await ctx.db.insert("teacherVacancies", {
        organizationId: orgId,
        teacherId: target,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        validFrom: startDate,
        ...(nextBoundary ? { validUntil: previousDate(nextBoundary) } : {}),
        isActive: true,
        createdAt: now,
      });
    }
    return { count: merged.length, effectiveFrom: startDate };
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
  for (const arr of byDay.values()) {
    arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (arr.length === 0) continue;
    let cur = { ...arr[0] };
    for (let i = 1; i < arr.length; i++) {
      const nxt = arr[i];
      if (timeToMinutes(nxt.startTime) <= timeToMinutes(cur.endTime)) {
        if (timeToMinutes(nxt.endTime) > timeToMinutes(cur.endTime)) {
          cur.endTime = nxt.endTime;
        }
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
    const target = await resolveTeacherTarget(ctx, orgId, user, teacherId, true);
    const today = await academyToday(ctx, orgId);
    const rows = await ctx.db
      .query("teacherVacancies")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", target)
      )
      .collect();
    let mins = 0;
    for (const r of rows) {
      if (!r.isActive || r.validFrom > today || (r.validUntil && r.validUntil < today)) continue;
      mins += timeToMinutes(r.endTime) - timeToMinutes(r.startTime);
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
