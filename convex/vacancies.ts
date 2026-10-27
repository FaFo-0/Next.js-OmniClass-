// H.7 — Teacher weekly recurring vacancies.
// Granularity = 30-minute slots, stored as half-open intervals
// [startTime, endTime). The teacher UI paints a Mon–Sun × 06:00–23:00
// grid; clicking a cell toggles a 30-min vacancy row. We collapse
// adjacent rows into a single longer interval on save (server-side).

import { availabilityCellState } from "./lib/availabilityState";
import { wallTimeToMs } from "./lib/time";
import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTenant, requireTenantPermission } from "./lib/tenant";
import type { Doc } from "./_generated/dataModel";
import { loadSlotSources, openRangesForDate } from "./calendar";
import { userHasPermission } from "./lib/permissions";
import { instantToZoned } from "./lib/time";

const NOW = () => new Date().toISOString();
async function requireAvailabilityEditor(ctx: Parameters<typeof requireTenant>[0]) {
  const tenant = await requireTenant(ctx);
  if (tenant.user.role === "teacher" && userHasPermission(tenant.user,"calendar.edit.full")) return tenant;
  return await requireTenantPermission(ctx, "scheduling.edit");
}
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
  if(user.role==="admin"&&!userHasPermission(user,"lessons.view.any"))throw new ConvexError("Availability access denied");
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

export function normalizeSlots(slots: { dayOfWeek: number; startTime: string; endTime: string }[]) {
  const valid = slots.map((slot) => {
    if (!Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 0 || slot.dayOfWeek > 6) {
      throw new ConvexError("Invalid weekday");
    }
    const start = timeToMinutes(slot.startTime);
    const end = timeToMinutes(slot.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end > 24 * 60 || start % 30 !== 0 || end % 30 !== 0) {
      throw new ConvexError("Select valid half-hour availability cells");
    }
    return { ...slot };
  });
  return mergeSlots(valid);
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
    const events = (await ctx.db.query("scheduleEvents").withIndex("by_organization_and_teacherId", q => q.eq("organizationId", orgId).eq("teacherId", target)).take(2000))
      .filter(event => !event.isDeleted && (event.status === "scheduled" || event.status === "makeup"));
    const exceptions = await ctx.db.query("slotExceptions").withIndex("by_organization_and_teacherId", q => q.eq("organizationId", orgId).eq("teacherId", target)).take(2000);
    return {
      events: events.map(({date, startTime, endTime}) => ({date, startTime, endTime})),
      exceptions,
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
    sourceWeek: v.optional(v.object({
      fromDate: v.string(),
      timezone: v.string(),
      cells: v.array(v.object({ date: v.string(), startTime: v.string(), expectedState: v.string(), draftOpen: v.optional(v.boolean()) })),
    })),
    slots: v.array(
      v.object({
        dayOfWeek: v.number(), // 0-6
        startTime: v.string(), // HH:mm
        endTime: v.string(), // HH:mm
      })
    ),
  },
  handler: async (ctx, { teacherId, slots, effectiveFrom, expectedSourceState, sourceWeek }) => {
    const { orgId, user } = await requireAvailabilityEditor(ctx);
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
    const sources = await loadSlotSources(ctx, orgId, target);
    if (sourceWeek) {
      const from = Date.parse(`${sourceWeek.fromDate}T00:00:00Z`);
      if (!Number.isFinite(from) || new Date(from).toISOString().slice(0, 10) !== sourceWeek.fromDate)
        throw new ConvexError("Invalid source week");
      try { new Intl.DateTimeFormat("en", { timeZone: sourceWeek.timezone }).format(); }
      catch { throw new ConvexError("Invalid timezone"); }
      const settings = await ctx.db.query("tenantSettings").withIndex("by_organization", q => q.eq("organizationId", orgId)).unique();
      const orgTz = settings?.timezone ?? "UTC";
      const end = new Date(from + 7 * 86400000).toISOString().slice(0, 10);
      const expected = new Map(sourceWeek.cells.map(cell => [`${cell.date}|${cell.startTime}`, cell]));
      if (expected.size !== sourceWeek.cells.length || expected.size > 350) throw new ConvexError("Invalid source week cells");
      slots = [];
      let count = 0;
      for (let day = -2; day < 9; day++) {
        const date = new Date(from + day * 86400000).toISOString().slice(0, 10);
        for (let minute = 0; minute < 1440; minute += 30) {
          const startTime = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
          const instant = wallTimeToMs(date, startTime, orgTz);
          const viewedDate = instantToZoned(new Date(instant), sourceWeek.timezone).date;
          if (viewedDate < sourceWeek.fromDate || viewedDate >= end) continue;
          count++;
          const cell = expected.get(`${date}|${startTime}`);
          const state = availabilityCellState(sources, date, startTime);
          if (!cell || cell.expectedState !== state) throw new ConvexError("This week changed. Review the refreshed calendar before applying it");
          if (cell.draftOpen !== undefined && instant > Date.now()) throw new ConvexError("Save future edits before applying weekly hours");
          const parsed = JSON.parse(state) as { override: { value: boolean | null }; inherited: string[] };
          const open = cell.draftOpen ?? parsed.override.value ?? parsed.inherited.length > 0;
          if (open) slots.push({ dayOfWeek: new Date(`${date}T00:00:00Z`).getUTCDay(), startTime,
            endTime: `${String(Math.floor((minute + 30) / 60)).padStart(2, "0")}:${String((minute + 30) % 60).padStart(2, "0")}` });
        }
      }
      if (count !== expected.size) throw new ConvexError("Copy the complete week");
      // The dialog's effective date is part of the confirmed action.
      const first = [...expected.values()].map(cell => cell.date).sort()[0];
      const intendedStart = first > today ? first : today;
      if (startDate !== intendedStart) throw new ConvexError("The start date changed. Review the confirmation again");
    }
    const merged = normalizeSlots(slots);
    const futureBoundaries = existing
      .filter((row) => row.isActive && row.validFrom > startDate)
      .map((row) => row.validFrom)
      .sort();
    const nextBoundary = sourceWeek ? undefined : futureBoundaries[0];
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
    const exceptions = sources.exceptions;
    const effectiveCoverage = (rows:{dayOfWeek:number;startTime:string;endTime:string;validFrom:string;validUntil?:string;isActive:boolean}[],date:string,startTime:string,endTime:string) => openRangesForDate({vacancies:rows,exceptions},date).some(range=>range.startMin<=timeToMinutes(startTime)&&range.endMin>=timeToMinutes(endTime));
    const protectedEvents = events.filter((event) =>
      !event.isDeleted &&
      (event.status === "scheduled" || event.status === "makeup") &&
      event.date >= startDate && (!nextBoundary || event.date < nextBoundary) &&
      effectiveCoverage(currentRows, event.date, event.startTime, event.endTime) &&
      !effectiveCoverage(proposedRows, event.date, event.startTime, event.endTime)
    );
    if (!sourceWeek && protectedEvents.length > 0) {
      const first = protectedEvents
        .slice()
        .sort((a, b) => `${a.date}|${a.startTime}`.localeCompare(`${b.date}|${b.startTime}`))[0];
      throw new ConvexError(`Availability change would strand the booked lesson on ${first.date} at ${first.startTime}`);
    }

    // Keep historical intervals. Whole-week promotion also supersedes later
    // weekly patterns; legacy editors keep their interval boundary. Dated
    // exceptions and booked lessons are never rewritten here.
    for (const row of currentRows) {
      if (row.validFrom < startDate) {
        await ctx.db.patch(row._id, { validUntil: previousDate(startDate) });
      } else {
        await ctx.db.delete(row._id);
      }
    }
    if (sourceWeek) {
      for (const row of existing.filter(row => row.isActive && row.validFrom > startDate))
        await ctx.db.delete(row._id);
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

/** Current weekly pattern and effective availability over the next 14 academy
 * dates. Date-only edits count here; expired/future weekly patterns and time
 * off cannot inflate the current week's availability.
 */
export const getAvailabilitySummary = query({
  args: { teacherId: v.optional(v.string()) },
  handler: async (ctx, { teacherId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = await resolveTeacherTarget(ctx, orgId, user, teacherId, true);
    const [sources, settings] = await Promise.all([
      loadSlotSources(ctx, orgId, target),
      ctx.db.query("tenantSettings")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .unique(),
    ]);
    const academyTimezone = settings?.timezone ?? "Asia/Almaty";
    const academyDate = instantToZoned(new Date(), academyTimezone).date;
    const [year, month, day] = academyDate.split("-").map(Number);
    const dateAt = (offset: number) => new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
    const countCells = (ranges: { startMin: number; endMin: number }[]) => ranges.reduce((count, range) =>
      count + Math.max(0, Math.floor(range.endMin / 30) - Math.ceil(range.startMin / 30)), 0
    );
    // Snapshot the pattern in force today. Later scheduled patterns are not
    // blended into the usual-week number, and overlapping rows count once.
    const currentPattern = sources.vacancies
      .filter((row) => row.isActive && row.validFrom <= academyDate && (!row.validUntil || row.validUntil >= academyDate))
      .map((row) => ({ ...row, validUntil: undefined }));
    let usualWeeklySlots = 0;
    let next14DaysOpenSlots = 0;
    for (let offset = 0; offset < 14; offset++) {
      const date = dateAt(offset);
      next14DaysOpenSlots += countCells(openRangesForDate(sources, date));
      if (offset < 7) usualWeeklySlots += countCells(openRangesForDate({ vacancies: currentPattern, exceptions: [] }, date));
    }
    return {
      teacherId: target,
      academyDate,
      academyTimezone,
      usualWeeklyHours: usualWeeklySlots / 2,
      next14DaysOpenSlots,
      next14DaysOpenHours: next14DaysOpenSlots / 2,
    };
  },
});

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
