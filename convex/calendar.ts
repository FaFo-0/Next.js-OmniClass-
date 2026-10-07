// §13.10 — Unified calendar backend.
// One grid: Open slots (weekly vacancy pattern ± per-date exceptions),
// Busy (everything else), Lessons (scheduleEvents). Policy-aware
// cancel/reschedule with consequence previews.

import { v, ConvexError } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireTenant } from "./lib/tenant";
import {
  POLICY,
  cancelVerdict,
  rescheduleVerdict,
  withinActionHorizon,
  ordinaryBookingBoundary,
  type Actor,
} from "./lib/policy";
import type { Id, Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { grantPointsInternal, spendPointsInternal } from "./points";
import { insertNotification } from "./notifications";
import { DEFAULT_ACTIVITY_TYPES } from "./tenantSettings";
import { instantToZoned, wallTimeToMs } from "./lib/time";
import { canonicalizeBookings } from "./lib/calendarBookingPlan";
import { userHasPermission } from "./lib/permissions";
import { syncAutomaticHomeworkDeadlines } from "./homework";

const NOW = () => new Date().toISOString();

/** Academy timezone — every stored date+time is wall-clock in it. */
export async function orgTimezone(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
): Promise<string> {
  const settings = await ctx.db
    .query("tenantSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .unique();
  return settings?.timezone ?? "UTC";
}

// ── Slot computation helpers ─────────────────────────────────────

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function minToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
/** Local day-of-week for a "YYYY-MM-DD" date (0=Sunday). */
function dayOfWeek(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}
/** Monday-of-week "YYYY-MM-DD" key — one per ISO week for grouping. */
export function mondayKey(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Add whole days to a "YYYY-MM-DD" academy date (local, DST-agnostic). */
function addDate(d: string, days: number): string {
  const [year, month, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function calendarDayDistance(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

function isValidAcademyDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

function isValidWallTime(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [hour, minute] = time.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

interface SlotSources {
  vacancies: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    validFrom: string;
    validUntil?: string;
    isActive: boolean;
  }[];
  exceptions: {
    date: string;
    startTime: string;
    endTime: string;
    kind: "open" | "closed";
    timeOffGroupId?: string;
    createdAt?: string;
    editToken?: string;
  }[];
}

/**
 * Is the slot starting at date+startTime open per pattern+exceptions?
 * Exceptions can be exact-slot (from single-slot toggles) or ranges
 * (from time-off blocks); an exact-startTime match takes precedence.
 */
function isSlotOpen(
  src: SlotSources,
  date: string,
  startTime: string,
): boolean {
  const min = timeToMin(startTime);
  const exact = src.exceptions.find(
    (e) => e.date === date && e.startTime === startTime,
  );
  if (exact) return exact.kind === "open";
  const range = src.exceptions.find(
    (e) =>
      e.date === date &&
      timeToMin(e.startTime) <= min &&
      timeToMin(e.endTime) > min,
  );
  if (range) return range.kind === "open";
  const dow = dayOfWeek(date);
  return src.vacancies.some(
    (vac) =>
      vac.isActive &&
      vac.dayOfWeek === dow &&
      vac.validFrom <= date &&
      (!vac.validUntil || vac.validUntil >= date) &&
      timeToMin(vac.startTime) <= min &&
      timeToMin(vac.endTime) >= min + 1, // slot must start strictly inside the window
  );
}

/**
 * Coalesced open windows for a date, as [startMin, endMin) minute intervals.
 * Range model (POLICY §5): teacher availability is continuous windows, not a
 * fixed grid. Precedence per minute mirrors isSlotOpen: a closed exception
 * beats an open exception beats the weekly vacancy pattern beats closed-default.
 * Boundary-swept so it stays exact and cheap regardless of granularity.
 */
export function openRangesForDate(
  src: SlotSources,
  date: string,
): { startMin: number; endMin: number }[] {
  const dow = dayOfWeek(date);
  // A single malformed row (empty/garbage "HH:mm" from legacy data) must never
  // take down the whole calendar — drop windows whose bounds aren't a sane,
  // ordered minute pair.
  const validWin = (w: { s: number; e: number }) =>
    Number.isFinite(w.s) &&
    Number.isFinite(w.e) &&
    w.s >= 0 &&
    w.e <= 24 * 60 &&
    w.s < w.e;
  const vac = src.vacancies
    .filter(
      (v) =>
        v.isActive &&
        v.dayOfWeek === dow &&
        v.validFrom <= date &&
        (!v.validUntil || v.validUntil >= date),
    )
    .map((v) => ({ s: timeToMin(v.startTime), e: timeToMin(v.endTime) }))
    .filter(validWin);
  const openEx = src.exceptions
    .filter((e) => e.date === date && e.kind === "open")
    .map((e) => ({ s: timeToMin(e.startTime), e: timeToMin(e.endTime) }))
    .filter(validWin);
  const closedEx = src.exceptions
    .filter((e) => e.date === date && e.kind === "closed")
    .map((e) => ({ s: timeToMin(e.startTime), e: timeToMin(e.endTime) }))
    .filter(validWin);

  // Candidate open windows = vacancies ∪ open exceptions.
  const opens = [...vac, ...openEx];
  if (opens.length === 0) return [];

  // Sweep boundaries; a segment is open if some open window covers it and no
  // closed exception covers it.
  const bounds = new Set<number>();
  for (const w of [...opens, ...closedEx]) {
    bounds.add(w.s);
    bounds.add(w.e);
  }
  const sorted = [...bounds].sort((a, b) => a - b);
  const out: { startMin: number; endMin: number }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (b <= a) continue;
    const mid = (a + b) / 2;
    const isOpen =
      opens.some((w) => w.s <= mid && w.e > mid) &&
      !closedEx.some((w) => w.s <= mid && w.e > mid);
    if (!isOpen) continue;
    const last = out[out.length - 1];
    if (last && last.endMin === a)
      last.endMin = b; // coalesce touching segments
    else out.push({ startMin: a, endMin: b });
  }
  return out;
}

/** Is [startMin, endMin) fully inside one open window on `date`? */
export function isRangeOpen(
  src: SlotSources,
  date: string,
  startMin: number,
  endMin: number,
): boolean {
  return openRangesForDate(src, date).some(
    (r) => r.startMin <= startMin && r.endMin >= endMin,
  );
}

/** Half-open reservations: adjacent lessons are allowed; overlaps are not. */
export function overlapConflict(
  events: {
    date: string;
    startTime: string;
    endTime: string;
    status: string;
    _id?: string;
  }[],
  date: string,
  startMin: number,
  endMin: number,
  excludeEventId?: string,
): { startTime: string; endTime: string } | null {
  for (const event of events) {
    if (
      event.date !== date ||
      !ACTIVE_STATUSES.includes(event.status) ||
      (excludeEventId !== undefined && event._id === excludeEventId)
    )
      continue;
    if (
      timeToMin(event.startTime) < endMin &&
      startMin < timeToMin(event.endTime)
    ) {
      return { startTime: event.startTime, endTime: event.endTime };
    }
  }
  return null;
}

export function requireSlotStart(time: string): number {
  const minutes = timeToMin(time);
  if (
    !/^\d{2}:\d{2}$/.test(time) ||
    !Number.isFinite(minutes) ||
    minutes < 0 ||
    minutes >= 1440 ||
    Number(time.split(":")[1]) > 59 ||
    minutes % POLICY.bookingGranularityMinutes !== 0
  ) {
    throw new ConvexError("Choose a half-hour start time");
  }
  if (minutes + POLICY.reservationMinutes > 1440)
    throw new ConvexError("A lesson must finish by midnight academy time");
  return minutes;
}

export async function loadSlotSources(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  teacherId: string,
): Promise<SlotSources> {
  const vacancies = await ctx.db
    .query("teacherVacancies")
    .withIndex("by_organization_and_teacherId", (q) =>
      q.eq("organizationId", orgId).eq("teacherId", teacherId),
    )
    .collect();
  const exceptions = await ctx.db
    .query("slotExceptions")
    .withIndex("by_organization_and_teacherId", (q) =>
      q.eq("organizationId", orgId).eq("teacherId", teacherId),
    )
    .collect();
  return { vacancies, exceptions };
}

export async function loadTeacherEvents(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  teacherId: string,
  fromDate: string,
  toDate: string,
) {
  const events = await ctx.db
    .query("scheduleEvents")
    .withIndex("by_organization_and_teacherId", (q) =>
      q.eq("organizationId", orgId).eq("teacherId", teacherId),
    )
    .collect();
  return events.filter(
    (e) =>
      !e.isDeleted &&
      e.type !== "placeholder" &&
      e.date >= fromDate &&
      e.date <= toDate,
  );
}

async function assertStudentFree(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  studentId: string,
  date: string,
  startMin: number,
  endMin: number,
  excludeEventId?: string,
) {
  const events = await ctx.db
    .query("scheduleEvents")
    .withIndex("by_organization_and_studentId", (q) =>
      q.eq("organizationId", orgId).eq("studentId", studentId),
    )
    .take(2000);
  if (
    overlapConflict(
      events.filter((event) => !event.isDeleted),
      date,
      startMin,
      endMin,
      excludeEventId,
    )
  )
    throw new ConvexError("The student already has a lesson at that time");
}

// ── Queries ──────────────────────────────────────────────────────

/**
 * Everything a calendar grid needs for [fromDate, toDate]:
 * open slots (concrete, per date), lessons (with student names resolved
 * server-side — no listAllUsers on the client), and the slot duration.
 */
async function buildCalendar(
  ctx: QueryCtx,
  orgId: string,
  teacherId: string,
  fromDate: string,
  toDate: string,
) {
  {
    const slotMinutes = POLICY.reservationMinutes;

    const src = await loadSlotSources(ctx, orgId, teacherId);
    const events = await loadTeacherEvents(
      ctx,
      orgId,
      teacherId,
      fromDate,
      toDate,
    );

    // Resolve student names server-side (Z.X-5: never ship the org user list
    // to the client). Same pass collects the hover-card facts (§14.6).
    const studentIds = [
      ...new Set(events.map((e) => e.studentId).filter(Boolean)),
    ] as string[];
    const names: Record<string, string> = {};
    const students: Record<
      string,
      {
        name: string;
        balance: number;
        lastLessonDate: string | null;
        timezone: string | null;
      }
    > = {};
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const today = instantToZoned(new Date(), settings?.timezone ?? "UTC").date;
    for (const sid of studentIds) {
      const s = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", sid),
        )
        .unique();
      if (!s) continue;
      names[sid] = s.name;

      const grants = await ctx.db
        .query("pointGrants")
        .withIndex("by_organization_and_studentId", (q) =>
          q.eq("organizationId", orgId).eq("studentId", sid),
        )
        .collect();
      let balance = 0;
      for (const g of grants) {
        if (g.isExpired || g.expiresAt < today || g.remainingPoints <= 0)
          continue;
        balance += g.remainingPoints;
      }

      // Most recent lesson that actually happened, for "last seen" context.
      const past = await ctx.db
        .query("scheduleEvents")
        .withIndex("by_organization_and_studentId", (q) =>
          q.eq("organizationId", orgId).eq("studentId", sid),
        )
        .collect();
      let lastLessonDate: string | null = null;
      for (const e of past) {
        if (e.isDeleted || e.status !== "completed") continue;
        if (lastLessonDate === null || e.date > lastLessonDate)
          lastLessonDate = e.date;
      }

      students[sid] = {
        name: s.name,
        balance,
        lastLessonDate,
        timezone: s.timezone ?? null,
      };
    }

    // Concrete open slots per date (skip past slots and slots holding an
    // active lesson — the UI shows the lesson instead)
    const openSlots: { date: string; startTime: string; endTime: string }[] =
      [];
    const active = events.filter(
      (e) => e.status === "scheduled" || e.status === "makeup",
    );
    const nowMs = Date.now();
    const orgTz = settings?.timezone ?? "UTC";
    const granularity = POLICY.bookingGranularityMinutes;

    // In-progress sessions, so the grid can offer Resume rather than starting
    // a duplicate recording for the same slot.
    const teacherLessons = await ctx.db
      .query("lessons")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", teacherId),
      )
      .collect();
    const activeLessonByEvent = new Map<string, Id<"lessons">>();
    for (const l of teacherLessons) {
      if (l.isDeleted || !l.scheduleEventId) continue;
      if (l.status !== "scheduled" && l.status !== "recording") continue;
      activeLessonByEvent.set(l.scheduleEventId, l._id);
    }

    // Range model (POLICY §5): ship continuous open windows + opaque busy
    // intervals; the client computes bookable start times and the server
    // re-validates on booking. `openSlots` (legacy discrete grid) stays until
    // the frontend fully migrates.
    const openRanges: { date: string; startTime: string; endTime: string }[] =
      [];
    const busy: { date: string; startTime: string; endTime: string }[] = [];
    for (let date = fromDate; date <= toDate; date = addDate(date, 1)) {
      // Wall-clock "now" minute for this date in the academy tz — trims the
      // already-past part of today without hiding future days.
      const midnightMs = wallTimeToMs(date, "00:00", orgTz);
      const nowWallMin = Number.isNaN(midnightMs)
        ? -1
        : (nowMs - midnightMs) / 60_000;
      if (nowWallMin >= 24 * 60) continue; // whole day is past

      for (const r of openRangesForDate(src, date)) {
        const startMin =
          nowWallMin > 0
            ? Math.max(
                r.startMin,
                Math.ceil(nowWallMin / granularity) * granularity,
              )
            : r.startMin;
        if (startMin >= r.endMin) continue;
        openRanges.push({
          date,
          startTime: minToTime(startMin),
          endTime: minToTime(r.endMin),
        });
      }

      for (const e of active) {
        if (e.date !== date) continue;
        busy.push({ date, startTime: e.startTime, endTime: e.endTime });
      }

      // Legacy discrete slots (still consumed by the current grid UI).
      for (let m = 0; m < 24 * 60; m += slotMinutes) {
        const startTime = minToTime(m);
        const slotMs = wallTimeToMs(date, startTime, orgTz);
        if (Number.isNaN(slotMs) || slotMs <= nowMs) continue;
        if (!isSlotOpen(src, date, startTime)) continue;
        const taken = active.some(
          (e) => e.date === date && e.startTime === startTime,
        );
        if (!taken)
          openSlots.push({
            date,
            startTime,
            endTime: minToTime(m + slotMinutes),
          });
      }
    }

    return {
      slotMinutes,
      lessonMinutes: slotMinutes,
      bufferMinutes: 0,
      granularity,
      openRanges,
      busy,
      openSlots,
      events: events.map((e) => ({
        _id: e._id,
        title: e.title,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        status: e.status,
        type: e.type,
        studentId: e.studentId,
        studentName: e.studentId ? (names[e.studentId] ?? null) : null,
        googleMeetLink: e.googleMeetLink ?? null,
        createdAt: e.createdAt,
        recurringBookingId: e.recurringBookingId ?? null,
        // A session already in progress for this slot — the grid offers
        // "Resume" instead of starting a second one.
        activeLessonId: activeLessonByEvent.get(e._id) ?? null,
        teacherStartedAt: e.teacherStartedAt,
        endedAt: e.endedAt,
        completedAt: e.completedAt,
      })),
      students,
      orgTz: settings?.timezone ?? "UTC",
      policy: {
        actionHorizonDays: POLICY.actionHorizonDays,
      },
    };
  }
}

export const getTeacherCalendar = query({
  args: { fromDate: v.string(), toDate: v.string() },
  handler: async (ctx, { fromDate, toDate }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher") throw new ConvexError("Teachers only");
    return await buildCalendar(ctx, orgId, user.externalId, fromDate, toDate);
  },
});

/** Admin view of any teacher's calendar. */
export const getAdminCalendar = query({
  args: { teacherId: v.string(), fromDate: v.string(), toDate: v.string() },
  handler: async (ctx, { teacherId, fromDate, toDate }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "admin" || !userHasPermission(user, "lessons.view.any"))
      throw new ConvexError("Calendar access denied");
    return await buildCalendar(ctx, orgId, teacherId, fromDate, toDate);
  },
});

/** Resolve an admin calendar deep link before the page chooses its teacher/range. */
export const getAdminEventLink = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "admin" || !userHasPermission(user, "lessons.view.any"))
      throw new ConvexError("Calendar access is not permitted");
    const event = await ctx.db.get(eventId as Id<"scheduleEvents">);
    if (!event || event.organizationId !== orgId || event.isDeleted)
      return null;
    return {
      eventId: event._id,
      teacherId: event.teacherId ?? null,
      date: event.date,
    };
  },
});

/**
 * §14.6 — admin bird's-eye view: every teacher's lessons on one grid, read-only.
 * No availability bands (too noisy across the whole academy) — this is for
 * spotting clashes/load at a glance; assigning still happens per-teacher.
 * Event labels carry the teacher so blocks are attributable.
 */
export const getAllTeachersCalendar = query({
  args: { fromDate: v.string(), toDate: v.string() },
  handler: async (ctx, { fromDate, toDate }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "admin" || !userHasPermission(user, "lessons.view.any"))
      throw new ConvexError("Calendar access is not permitted");

    const teachers = await ctx.db
      .query("users")
      .withIndex("by_organization_and_role", (q) =>
        q.eq("organizationId", orgId).eq("role", "teacher"),
      )
      .collect();
    const teacherName: Record<string, string> = {};
    for (const t of teachers) teacherName[t.externalId] = t.name;

    const nameCache: Record<string, string> = {};
    const resolveStudent = async (sid: string): Promise<string> => {
      if (nameCache[sid] !== undefined) return nameCache[sid];
      const s = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", sid),
        )
        .unique();
      return (nameCache[sid] = s?.name ?? "Student");
    };

    const out: {
      _id: Id<"scheduleEvents">;
      title: string;
      date: string;
      startTime: string;
      endTime: string;
      status: string;
      type: string;
      teacherId?: string;
      studentId?: string;
      studentName: string | null;
      teacherName: string;
      createdAt: string;
    }[] = [];
    for (const t of teachers) {
      const events = await loadTeacherEvents(
        ctx,
        orgId,
        t.externalId,
        fromDate,
        toDate,
      );
      for (const e of events) {
        out.push({
          _id: e._id,
          title: e.title,
          date: e.date,
          startTime: e.startTime,
          endTime: e.endTime,
          status: e.status,
          type: e.type,
          teacherId: e.teacherId,
          studentId: e.studentId,
          studentName: e.studentId ? await resolveStudent(e.studentId) : null,
          teacherName: teacherName[t.externalId] ?? "Teacher",
          createdAt: e.createdAt,
        });
      }
    }

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();

    const lessonMinutes = POLICY.reservationMinutes;
    return {
      slotMinutes: lessonMinutes,
      lessonMinutes,
      bufferMinutes: 0,
      granularity: POLICY.bookingGranularityMinutes,
      openSlots: [] as { date: string; startTime: string; endTime: string }[],
      openRanges: [] as { date: string; startTime: string; endTime: string }[],
      busy: [] as { date: string; startTime: string; endTime: string }[],
      events: out,
      orgTz: settings?.timezone ?? "UTC",
    };
  },
});

/**
 * Student calendar: own lessons + assigned teacher's open slots (only —
 * no other students' data leaves the server; fixes Z.S.DASH-3 pattern).
 */
export const getStudentCalendar = query({
  args: {
    fromDate: v.string(),
    toDate: v.string(),
  },
  handler: async (ctx, { fromDate, toDate }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") throw new ConvexError("Students only");

    const teacherId = user.teacherId ?? null;
    let teacherName: string | null = null;
    let openSlots: { date: string; startTime: string; endTime: string }[] = [];
    let openRanges: { date: string; startTime: string; endTime: string }[] = [];
    let busy: { date: string; startTime: string; endTime: string }[] = [];

    // Own events in range
    const all = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", user.externalId),
      )
      .collect();
    const events = all.filter(
      (e) =>
        !e.isDeleted &&
        e.type !== "placeholder" &&
        e.date >= fromDate &&
        e.date <= toDate,
    );

    if (teacherId) {
      const teacher = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", teacherId),
        )
        .unique();
      teacherName = teacher?.name ?? null;
      const cal = await buildCalendar(ctx, orgId, teacherId, fromDate, toDate);
      openSlots = cal.openSlots;
      openRanges = cal.openRanges;
      // Opaque busy = the teacher's OTHER lessons (no identity). Drop the
      // student's own lessons, which already ship in `events` in full.
      const ownKeys = new Set(events.map((e) => `${e.date}|${e.startTime}`));
      busy = cal.busy.filter((b) => !ownKeys.has(`${b.date}|${b.startTime}`));
    }

    const teacherNames = new Map<string, string>();
    for (const id of new Set(
      events.map((e) => e.teacherId).filter(Boolean) as string[],
    )) {
      const teacher = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", id),
        )
        .unique();
      teacherNames.set(id, teacher?.name ?? "Teacher");
    }
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();

    const orgTz = settings?.timezone ?? "UTC";
    const bookingBoundary = ordinaryBookingBoundary(new Date(), orgTz);
    const selfBookingActivity = (
      settings?.activityTypes ?? DEFAULT_ACTIVITY_TYPES
    ).find((activity) => activity.isActive && !activity.isGroup);
    const bookingContext = selfBookingActivity
      ? {
          teacherId,
          activityTypeId: selfBookingActivity.id,
          lessonMinutes: POLICY.reservationMinutes,
          pointCost: selfBookingActivity.pointCost,
          academyTimezone: orgTz,
          policyVersion: bookingBoundary.policyVersion,
          bookingUpperExclusiveDate: bookingBoundary.upperExclusiveDate,
        }
      : null;
    return {
      teacherId,
      teacherName,
      slotMinutes: POLICY.reservationMinutes,
      lessonMinutes: POLICY.reservationMinutes,
      bufferMinutes: 0,
      granularity: POLICY.bookingGranularityMinutes,
      openSlots,
      openRanges,
      busy,
      events: events.map((e) => ({
        _id: e._id,
        title: e.title,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        status: e.status,
        type: e.type,
        studentId: e.studentId,
        studentName: user.name,
        teacherId: e.teacherId,
        teacherName: e.teacherId ? teacherNames.get(e.teacherId) : null,
        googleMeetLink: e.googleMeetLink ?? null,
        createdAt: e.createdAt,
        recurringBookingId: e.recurringBookingId ?? null,
      })),
      orgTz: settings?.timezone ?? "UTC",
      bookingContext,
      policy: {
        actionHorizonDays: POLICY.actionHorizonDays,
        bookingMinNoticeHours: POLICY.bookingMinNoticeHours,
        bookingHorizonDays: POLICY.bookingHorizonDays,
        bookingBoundaryMode: bookingBoundary.mode,
        bookingUpperExclusiveDate: bookingBoundary.upperExclusiveDate,
        bookingUpperExclusiveIso: new Date(
          bookingBoundary.upperExclusiveMs,
        ).toISOString(),
        bookingPolicyVersion: bookingBoundary.policyVersion,
        academyDate: bookingBoundary.academyDate,
        freeCancelsPer30Days: POLICY.studentFreeCancelsPer30Days,
        cancelNoticeHours: POLICY.studentCancelNoticeHours,
      },
    };
  },
});

/**
 * C-7 — "Needs attention" inbox: lessons the system can't resolve alone.
 * Teachers see their own; admins see the whole academy.
 *  - conflict: a scheduled lesson now sits in a closed slot (time off or a
 *    pattern change) — it must be moved or cancelled.
 *  - no_balance: an active weekly schedule whose student has 0 lessons
 *    left, so the next occurrence will be skipped.
 */
export const needsAttention = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role === "student")
      return {
        conflicts: [],
        noBalance: [],
        unpaid: [],
        unreviewedHomework: [],
        unpublishedNotes: [],
        pendingTimeOff: [],
      };
    const isAdmin = user.role === "admin";
    const academyTz = await orgTimezone(ctx, orgId);
    const todayStr = instantToZoned(new Date(), academyTz).date;
    const horizonStr = addDate(todayStr, 30);

    const allEvents = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    const upcoming = allEvents.filter(
      (e) =>
        !e.isDeleted &&
        e.status === "scheduled" &&
        e.type !== "placeholder" &&
        e.date >= todayStr &&
        e.date <= horizonStr &&
        e.teacherId &&
        (isAdmin || e.teacherId === user.externalId),
    );

    const nameOf = async (externalId?: string) => {
      if (!externalId) return null;
      const u = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", externalId),
        )
        .unique();
      return u?.name ?? null;
    };

    // Retained response fields for older clients. Availability edits protect
    // bookings; staff assignments outside published hours are valid.
    const conflicts: {
      _id: Id<"scheduleEvents">;
      date: string;
      startTime: string;
      studentName: string | null;
      teacherName: string | null;
    }[] = [];
    const noBalance: {
      _id: Id<"recurringBookings">;
      studentName: string | null;
      dayOfWeek: number;
      startTime: string;
    }[] = [];
    // Lessons that happened without a credit to spend (one-time lessons
    // booked against an empty balance). Admin reconciles these in Billing.
    const unpaid: {
      _id: Id<"scheduleEvents">;
      date: string;
      startTime: string;
      studentName: string | null;
    }[] = [];
    for (const e of upcoming) {
      if (!e.unpaid) continue;
      unpaid.push({
        _id: e._id,
        date: e.date,
        startTime: e.startTime,
        studentName: await nameOf(e.studentId),
      });
    }

    // POLICY §10 — homework a student submitted that the teacher hasn't
    // reviewed yet. Teacher sees their own; admin sees all.
    const submittedHw = isAdmin
      ? await ctx.db
          .query("homework")
          .withIndex("by_organization_and_status", (q) =>
            q.eq("organizationId", orgId).eq("status", "submitted"),
          )
          .collect()
      : (
          await ctx.db
            .query("homework")
            .withIndex("by_organization_and_teacherId", (q) =>
              q.eq("organizationId", orgId).eq("teacherId", user.externalId),
            )
            .collect()
        ).filter((h) => h.status === "submitted");
    const unreviewedHomework: {
      _id: Id<"homework">;
      lessonId: Id<"lessons"> | null;
      title: string;
      studentName: string | null;
      submittedAt: string | null;
    }[] = [];
    for (const h of submittedHw) {
      unreviewedHomework.push({
        _id: h._id,
        lessonId: h.lessonId ?? null,
        title: h.title,
        studentName: await nameOf(h.studentId),
        submittedAt: h.submittedAt ?? null,
      });
    }
    unreviewedHomework.sort((a, b) =>
      (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""),
    );

    // POLICY §10 — lesson notes should be published within 24 hours of the
    // lesson. This is an attention signal for the responsible teacher/admin,
    // not an automatic status transition or student-facing penalty.
    const lessonRows = isAdmin
      ? await ctx.db
          .query("lessons")
          .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
          .take(500)
      : await ctx.db
          .query("lessons")
          .withIndex("by_organization_and_teacherId", (q) =>
            q.eq("organizationId", orgId).eq("teacherId", user.externalId),
          )
          .take(200);
    const noteCutoff = Date.now() - 24 * 60 * 60 * 1000;
    const unpublishedNotes: {
      _id: Id<"lessons">;
      title: string;
      studentName: string | null;
      teacherName: string | null;
      occurredAt: string;
    }[] = [];
    for (const lesson of lessonRows) {
      if (
        lesson.isDeleted ||
        lesson.status === "scheduled" ||
        lesson.status === "published" ||
        lesson.status === "no_show_student" ||
        lesson.status === "no_show_teacher"
      )
        continue;
      const occurredAt = lesson.scheduledFor ?? lesson.createdAt;
      if (Date.parse(occurredAt) > noteCutoff) continue;
      unpublishedNotes.push({
        _id: lesson._id,
        title: lesson.title,
        studentName: await nameOf(lesson.studentId),
        teacherName: isAdmin ? await nameOf(lesson.teacherId) : null,
        occurredAt,
      });
    }
    unpublishedNotes.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

    // POLICY §5 — long teacher absences awaiting the academy's sign-off.
    // Admin-only: a teacher doesn't need to nag themselves about their own
    // holiday.
    const pendingTimeOff: {
      groupId: string;
      teacherName: string;
      fromDate: string;
      toDate: string;
      days: number;
    }[] = [];
    if (user.role === "admin") {
      const exceptions = await ctx.db
        .query("slotExceptions")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .collect();
      const groups = new Map<
        string,
        { teacherId: string; days: number; dates: string[] }
      >();
      for (const e of exceptions) {
        if (!e.timeOffGroupId || e.timeOffApprovedAt) continue;
        if ((e.timeOffDays ?? 0) <= POLICY.timeOffApprovalDays) continue;
        const g = groups.get(e.timeOffGroupId) ?? {
          teacherId: e.teacherId,
          days: e.timeOffDays ?? 0,
          dates: [],
        };
        g.dates.push(e.date);
        groups.set(e.timeOffGroupId, g);
      }
      for (const [groupId, g] of groups) {
        if (g.dates.every((d) => d < todayStr)) continue; // fully in the past
        g.dates.sort();
        pendingTimeOff.push({
          groupId,
          teacherName: (await nameOf(g.teacherId)) ?? "A teacher",
          fromDate: g.dates[0],
          toDate: g.dates[g.dates.length - 1],
          days: g.days,
        });
      }
    }

    return {
      conflicts,
      noBalance,
      unpaid,
      unreviewedHomework,
      unpublishedNotes,
      pendingTimeOff,
    };
  },
});

function actionActor(
  user: Doc<"users">,
  event: Doc<"scheduleEvents">,
  permission:
    | "calendar.edit.full"
    | "calendar.cancel.full" = "calendar.edit.full",
): Actor {
  if (
    user.role !== "admin" &&
    user.role !== "teacher" &&
    user.role !== "student"
  )
    throw new ConvexError("Calendar access denied");
  if (
    (user.role === "teacher" && event.teacherId !== user.externalId) ||
    (user.role === "student" && event.studentId !== user.externalId)
  )
    throw new ConvexError("Not your lesson");
  if (user.role !== "student" && !userHasPermission(user, permission))
    throw new ConvexError("Calendar action is not permitted");
  return user.role;
}
function isRunningOrFinished(event: Doc<"scheduleEvents">) {
  return !!(event.teacherStartedAt || event.endedAt || event.completedAt);
}
export function timeOffOnDate(src: SlotSources, date: string) {
  return src.exceptions.some(
    (row) => row.date === date && !!row.timeOffGroupId,
  );
}

/** Policy preview for the lesson popover: what happens on cancel/move. */
export const actionPreview = query({
  args: { eventId: v.id("scheduleEvents") },
  handler: async (ctx, { eventId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const event = await ctx.db.get(eventId);
    if (!event || event.organizationId !== orgId)
      throw new ConvexError("Event not found");
    if (
      (user.role === "student" && event.studentId !== user.externalId) ||
      (user.role === "teacher" && event.teacherId !== user.externalId)
    )
      throw new ConvexError("Not your lesson");
    const actor: Actor =
      user.role === "admin"
        ? "admin"
        : user.role === "teacher"
          ? "teacher"
          : "student";
    const now = new Date();
    const orgTz = await orgTimezone(ctx, orgId);
    const cancel = cancelVerdict({
      actor,
      event,
      now,
      orgTz,
      studentRecentFreeCancels: await countRecentFreeCancels(
        ctx,
        orgId,
        event.studentId,
      ),
      isFirstLessonWithStudent: await isFirstLesson(ctx, orgId, event),
    });
    const reschedule = rescheduleVerdict({ actor, event, now, orgTz });
    if (isRunningOrFinished(event)) {
      cancel.allowed = false;
      cancel.reason = "A running or finished lesson cannot be cancelled";
      cancel.reasonKey = "cancel.live";
      reschedule.allowed = false;
      reschedule.reason = "A running or finished lesson cannot be moved";
      reschedule.reasonKey = "move.live";
    }
    if (actor !== "student") {
      if (!userHasPermission(user, "calendar.cancel.full")) {
        cancel.allowed = false;
        cancel.reason = "Cancellation is not permitted";
        cancel.reasonKey = "cancel.permission";
      }
      if (!userHasPermission(user, "calendar.edit.full")) {
        reschedule.allowed = false;
        reschedule.reason = "Moving lessons is not permitted";
        reschedule.reasonKey = "move.permission";
      }
    }
    return { actor, cancel, reschedule };
  },
});

async function countRecentFreeCancels(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  studentId?: string,
): Promise<number> {
  if (!studentId) return 0;
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const rows = await ctx.db
    .query("scheduleEvents")
    .withIndex("by_organization_and_studentId", (q) =>
      q.eq("organizationId", orgId).eq("studentId", studentId),
    )
    .collect();
  return rows.filter(
    (e) =>
      e.cancelledBy === "student" &&
      e.cancellationCharged === false &&
      (e.cancelledAt ?? "") >= since,
  ).length;
}

async function isFirstLesson(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  event: { teacherId?: string; studentId?: string; _id: Id<"scheduleEvents"> },
): Promise<boolean> {
  if (!event.teacherId || !event.studentId) return false;
  const rows = await ctx.db
    .query("scheduleEvents")
    .withIndex("by_organization_and_studentId", (q) =>
      q.eq("organizationId", orgId).eq("studentId", event.studentId!),
    )
    .collect();
  return !rows.some(
    (e) =>
      e._id !== event._id &&
      e.teacherId === event.teacherId &&
      (e.status === "completed" ||
        (e.status === "scheduled" &&
          e.date < new Date().toISOString().slice(0, 10))),
  );
}

// ── Mutations ────────────────────────────────────────────────────

/** Teacher toggles a concrete slot Open/Busy. Blocked if a lesson sits there. */
export const renameEvent = mutation({
  args: { eventId: v.id("scheduleEvents"), title: v.string() },
  handler: async (ctx, { eventId, title }) => {
    const { orgId, user } = await requireTenant(ctx);
    const evt = await ctx.db.get(eventId);
    if (!evt || evt.organizationId !== orgId)
      throw new ConvexError("Lesson not found");
    if (user.role === "student")
      throw new ConvexError("Only teachers and admins can rename");
    if (user.role === "teacher" && evt.teacherId !== user.externalId) {
      throw new ConvexError("Not your lesson");
    }
    const clean = title.trim().slice(0, 120);
    if (!clean) throw new ConvexError("Give the lesson a name");

    await ctx.db.patch(eventId, { title: clean });

    // Keep any lesson/recording attached to this slot under the same name.
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_organization_and_teacherId", (q) =>
        q
          .eq("organizationId", orgId)
          .eq("teacherId", evt.teacherId ?? user.externalId),
      )
      .collect();
    for (const l of lessons) {
      if (l.isDeleted || l.scheduleEventId !== eventId) continue;
      await ctx.db.patch(l._id, { title: clean });
    }
    return { title: clean };
  },
});

/**
 * §14.6 — copy one week's availability forward. Reads the source week's
 * effective open windows (pattern + exceptions) and writes them as per-date
 * open exceptions onto each target week, replacing any open exceptions already
 * there. Weekly time-off (closed) is left untouched. `fromMonday`/`toMondays`
 * are academy-tz "YYYY-MM-DD" Mondays.
 */
export const assignLesson = mutation({
  args: {
    teacherId: v.string(),
    studentId: v.string(),
    date: v.string(),
    startTime: v.string(),
    googleMeetLink: v.optional(v.string()),
    // Accepted for older clients; no buffer rule is enforced.
    overrideBuffer: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "admin" || !userHasPermission(user, "calendar.edit.full"))
      throw new ConvexError("Assignment is not permitted");
    return await assignLessonCore(ctx, orgId, user.externalId, args, "admin");
  },
});

/**
 * §13.6 — Teacher blocks a date range (vacation / time off). One
 * full-day "closed" exception per day. Returns lessons still scheduled
 * inside the range — teacher must move or cancel them separately
 * (EnglishDom rule: a slot holding a lesson can't just vanish).
 */
export const blockTimeOff = mutation({
  args: {
    fromDate: v.string(),
    toDate: v.string(),
    teacherId: v.optional(v.string()),
  },
  handler: async (ctx, { fromDate, toDate, teacherId: requestedTeacherId }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher" && user.role !== "admin") {
      throw new ConvexError("Only teachers block time off");
    }
    if (
      !userHasPermission(
        user,
        user.role === "admin" ? "scheduling.edit" : "calendar.edit.full",
      )
    )
      throw new ConvexError("Time off is not permitted");
    const teacherId =
      user.role === "admin"
        ? (requestedTeacherId ?? user.externalId)
        : user.externalId;
    const teacher = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", teacherId),
      )
      .unique();
    if (!teacher || teacher.role !== "teacher")
      throw new ConvexError("Teacher not found");
    if (!isValidAcademyDate(fromDate) || !isValidAcademyDate(toDate))
      throw new ConvexError("Invalid time-off dates");
    const today = instantToZoned(
      new Date(),
      await orgTimezone(ctx, orgId),
    ).date;
    if (fromDate < today)
      throw new ConvexError("Time off cannot start in the past");
    if (toDate < fromDate) throw new ConvexError("End date before start date");
    const days = calendarDayDistance(fromDate, toDate) + 1;
    if (days > 31)
      throw new ConvexError("Time off is limited to 31 days at once");

    // POLICY §5 — a block can't silently strand booked lessons. The teacher
    // moves or cancels them first (which applies the cancellation rules and
    // tells the student); only then does the block take effect.
    const booked = (
      await loadTeacherEvents(ctx, orgId, teacherId, fromDate, toDate)
    ).filter((e) => e.status === "scheduled" || e.status === "makeup");
    if (booked.length > 0) {
      const first = booked
        .slice()
        .sort((a, b) =>
          `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`),
        )[0];
      throw new ConvexError(
        `${booked.length} lesson${booked.length === 1 ? "" : "s"} still booked in that range (first: ${first.date} at ${first.startTime}). Move or cancel ${booked.length === 1 ? "it" : "them"} first — students keep their slot until you do.`,
      );
    }

    const groupId = `to-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    for (let date = fromDate; date <= toDate; date = addDate(date, 1)) {
      // A reversible mask: dated custom cells stay underneath the absence.
      await ctx.db.insert("slotExceptions", {
        organizationId: orgId,
        teacherId,
        date,
        startTime: "00:00",
        endTime: "24:00",
        kind: "closed",
        timeOffGroupId: groupId,
        timeOffDays: days,
        createdAt: NOW(),
      });
    }

    // The academy always hears about it. Short breaks are just informational;
    // a long absence also lands in the admin's needs-attention list so it can
    // be acknowledged (the block still applies immediately — nobody is left
    // teaching while sick waiting for a sign-off).
    const needsApproval = days > POLICY.timeOffApprovalDays;
    const admins = await ctx.db
      .query("users")
      .withIndex("by_organization_and_role", (q) =>
        q.eq("organizationId", orgId).eq("role", "admin"),
      )
      .collect();
    for (const a of admins) {
      await ctx.runMutation(internal.notifications._notify, {
        organizationId: orgId,
        recipientId: a.externalId,
        kind: "teacher_time_off",
        payload: {
          teacherName: teacher.name,
          fromDate,
          toDate,
          days,
          needsApproval,
        },
        link: "/admin/calendar",
      });
    }

    return { blockedDays: days, affectedLessons: 0, needsApproval, groupId };
  },
});

/** Admin signs off on a long time-off run so it stops nagging. */
export const approveTimeOff = mutation({
  args: { groupId: v.string() },
  handler: async (ctx, { groupId }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "admin" || !userHasPermission(user, "scheduling.edit"))
      throw new ConvexError("Acknowledgement is not permitted");
    const rows = await ctx.db
      .query("slotExceptions")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
    let approved = 0;
    for (const r of rows) {
      if (r.timeOffGroupId !== groupId || r.timeOffApprovedAt) continue;
      await ctx.db.patch(r._id, { timeOffApprovedAt: NOW() });
      approved++;
    }
    return { approved };
  },
});

/** Undo a time-off block: removes full-day closed exceptions in range. */
export const unblockTimeOff = mutation({
  args: {
    fromDate: v.string(),
    toDate: v.string(),
    teacherId: v.optional(v.string()),
    groupId: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { fromDate, toDate, teacherId: requestedTeacherId, groupId },
  ) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher" && user.role !== "admin") {
      throw new ConvexError("Only teachers manage time off");
    }
    if (
      !userHasPermission(
        user,
        user.role === "admin" ? "scheduling.edit" : "calendar.edit.full",
      )
    )
      throw new ConvexError("Time off is not permitted");
    if (
      !isValidAcademyDate(fromDate) ||
      !isValidAcademyDate(toDate) ||
      toDate < fromDate
    )
      throw new ConvexError("Invalid time-off dates");
    const teacherId =
      user.role === "admin"
        ? (requestedTeacherId ?? user.externalId)
        : user.externalId;
    const teacher = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", teacherId),
      )
      .unique();
    if (!teacher || teacher.role !== "teacher")
      throw new ConvexError("Teacher not found");
    const excs = await ctx.db
      .query("slotExceptions")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", teacherId),
      )
      .collect();
    let removed = 0;
    for (const e of excs) {
      if (
        e.date >= fromDate &&
        e.date <= toDate &&
        !!e.timeOffGroupId &&
        (!groupId || e.timeOffGroupId === groupId) &&
        e.kind === "closed" &&
        e.startTime === "00:00"
      ) {
        await ctx.db.delete(e._id);
        removed++;
      }
    }
    return { removed };
  },
});

// Student booking accepts an explicit finite list of dated half-hour starts.
// Preview and atomic confirmation share validation; retries use request IDs.
// The retired recurring materializer never receives these dated bookings.

type BatchConflict = {
  date: string;
  startTime: string;
  reason: string;
  reasonKey: string;
};

/**
 * One booking item's validity. Shared by preview and confirmation so
 * preview and confirm can never disagree. `budget` is the student's
 * remaining unbooked lessons (decremented by the caller as items pass).
 */
async function validateBatchItem(
  ctx: MutationCtx | QueryCtx,
  orgId: string,
  teacherId: string,
  item: { date: string; startTime: string },
  settings: Doc<"tenantSettings"> | null,
  src: SlotSources,
  ownActive: Doc<"scheduleEvents">[],
  batchAccepted: {
    date: string;
    startTime: string;
    endTime: string;
    status: string;
  }[],
  budget: number,
  now: Date,
  orgTz: string,
  bookingUpperExclusiveMs: number,
): Promise<{ ok: true } | { ok: false; reason: string; reasonKey: string }> {
  const lessonMinutes = POLICY.reservationMinutes;
  const granularity = POLICY.bookingGranularityMinutes;
  const startMin = timeToMin(item.startTime);
  const endMin = startMin + lessonMinutes;
  const startMs = wallTimeToMs(item.date, item.startTime, orgTz);
  if (Number.isNaN(startMs)) {
    return {
      ok: false,
      reason: "Invalid booking time",
      reasonKey: "booking.invalidTime",
    };
  }
  if (startMin % granularity !== 0 || startMin < 0 || endMin > 1440) {
    return {
      ok: false,
      reason: `Start time must be on a ${granularity}-minute mark`,
      reasonKey: "booking.granularity",
    };
  }
  const noticeHours = (startMs - now.getTime()) / 3_600_000;
  if (noticeHours < POLICY.bookingMinNoticeHours) {
    return {
      ok: false,
      reason: `Lessons must be booked at least ${POLICY.bookingMinNoticeHours} hours in advance`,
      reasonKey: "booking.notice",
    };
  }
  if (startMs >= bookingUpperExclusiveMs) {
    return {
      ok: false,
      reason: "That date is outside the academy calendar booking window",
      reasonKey: "booking.horizon",
    };
  }
  if (!isRangeOpen(src, item.date, startMin, endMin)) {
    return {
      ok: false,
      reason: "That time isn't inside the teacher's open hours",
      reasonKey: "booking.notOpen",
    };
  }
  const dayEvents = await loadTeacherEvents(
    ctx,
    orgId,
    teacherId,
    item.date,
    item.date,
  );
  // Also check against the batch's own already-accepted items (they are not
  // in the DB yet): without this, two same-day starts that are too close
  // would both validate and create overlapping lessons for academies with
  // maxStudentBookingsPerDay > 1.
  const withBatch = [...dayEvents, ...batchAccepted];
  const hit = overlapConflict(withBatch, item.date, startMin, endMin);
  if (hit) {
    return {
      ok: false,
      reason: "That time overlaps another lesson",
      reasonKey: "booking.overlap",
    };
  }
  const sameDay = ownActive.filter((e) => e.date === item.date).length;
  if (sameDay >= POLICY.maxStudentBookingsPerDay) {
    return {
      ok: false,
      reason: `You already have a lesson on ${item.date} — one lesson per day`,
      reasonKey: "booking.perDay",
    };
  }
  const wkStart = mondayKey(item.date);
  const wkEnd = addDate(wkStart, 6);
  const sameWeek = ownActive.filter(
    (e) => e.date >= wkStart && e.date <= wkEnd,
  ).length;
  if (sameWeek >= POLICY.maxStudentBookingsPerWeek) {
    return {
      ok: false,
      reason: `Maximum ${POLICY.maxStudentBookingsPerWeek} lessons per week reached`,
      reasonKey: "booking.perWeek",
    };
  }
  if (budget < 1) {
    return {
      ok: false,
      reason: "Not enough lessons left on your balance — top up to book.",
      reasonKey: "booking.noBalance",
    };
  }
  return { ok: true };
}

interface BatchInput {
  bookings: { date: string; startTime: string }[];
  repeat: boolean;
  requestId?: string;
}

function resolveSelfBookingContext(
  settings: Doc<"tenantSettings"> | null,
  orgTz: string,
) {
  const types = settings?.activityTypes ?? DEFAULT_ACTIVITY_TYPES;
  const activity = types.find(
    (candidate) => candidate.isActive && !candidate.isGroup,
  );
  if (!activity)
    throw new ConvexError("No active 1-on-1 lesson type is configured");
  if (activity.pointCost !== 1) {
    throw new ConvexError(
      "Student self-booking requires one lesson per booking",
    );
  }
  return {
    activityTypeId: activity.id,
    pointCost: activity.pointCost,
    lessonMinutes: POLICY.reservationMinutes,
    academyTimezone: orgTz,
    policyVersion: POLICY.bookingPolicyVersion,
  };
}

async function loadBatchContext(
  ctx: MutationCtx | QueryCtx,
  orgId: string,
  teacherId: string,
  studentId: string,
) {
  const settings = await ctx.db
    .query("tenantSettings")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .unique();
  const src = await loadSlotSources(ctx, orgId, teacherId);
  const own = await ctx.db
    .query("scheduleEvents")
    .withIndex("by_organization_and_studentId", (q) =>
      q.eq("organizationId", orgId).eq("studentId", studentId),
    )
    .collect();
  const ownActive = own.filter(
    (e) => !e.isDeleted && (e.status === "scheduled" || e.status === "makeup"),
  );
  return { settings, src, ownActive };
}

/** Validate a full batch (shared by preview and confirm). */
async function validateBatch(
  ctx: MutationCtx | QueryCtx,
  orgId: string,
  teacherId: string,
  studentId: string,
  input: BatchInput,
): Promise<{
  conflicts: BatchConflict[];
  items: {
    date: string;
    startTime: string;
    ok: boolean;
    alreadyBooked?: boolean;
  }[];
  lessonsAvailable: number;
  lessonsLeft: number;
  cutoffDate: string | null;
  grantExpiryDays: number | null;
  reviewContext: {
    teacherId: string;
    activityTypeId: string;
    lessonMinutes: number;
    pointCost: number;
    academyTimezone: string;
    policyVersion: string;
    bookingUpperExclusiveDate: string;
  };
}> {
  const { settings, src, ownActive } = await loadBatchContext(
    ctx,
    orgId,
    teacherId,
    studentId,
  );
  const orgTz = settings?.timezone ?? "UTC";
  const now = new Date();
  const bookingBoundary = ordinaryBookingBoundary(now, orgTz);
  const reviewContext = {
    ...resolveSelfBookingContext(settings, orgTz),
    teacherId,
    bookingUpperExclusiveDate: bookingBoundary.upperExclusiveDate,
  };
  if (input.bookings.length === 0) throw new ConvexError("Nothing to book");
  if (input.bookings.length > 400)
    throw new ConvexError("Booking plan is too large");
  for (const item of input.bookings) {
    if (!isValidAcademyDate(item.date) || !isValidWallTime(item.startTime)) {
      throw new ConvexError(
        "Booking plan contains an invalid academy date or time",
      );
    }
  }
  const items = canonicalizeBookings(input.bookings);

  const grants = await ctx.db
    .query("pointGrants")
    .withIndex("by_organization_and_studentId", (q) =>
      q.eq("organizationId", orgId).eq("studentId", studentId),
    )
    .collect();
  const today = instantToZoned(now, orgTz).date;
  let budget = grants
    .filter(
      (g) => !g.isExpired && g.expiresAt >= today && g.remainingPoints > 0,
    )
    .reduce((sum, g) => sum + g.remainingPoints, 0);

  const conflicts: BatchConflict[] = [];
  const results: {
    date: string;
    startTime: string;
    ok: boolean;
    alreadyBooked?: boolean;
  }[] = [];
  // Items already on the calendar (outside the batch) count toward caps.
  const contextActive = [...ownActive];
  // Accepted batch items (same day as the one being checked) also count
  // toward overlap, not just caps.
  const batchAcceptedByDay = new Map<
    string,
    { date: string; startTime: string; endTime: string; status: string }[]
  >();
  for (const item of items) {
    const lessonMinutes = POLICY.reservationMinutes;
    const matchingBooked = ownActive.find(
      (event) =>
        event.teacherId === teacherId &&
        event.date === item.date &&
        event.startTime === item.startTime &&
        timeToMin(event.endTime) === timeToMin(item.startTime) + lessonMinutes,
    );
    if (matchingBooked) {
      results.push({ ...item, ok: true, alreadyBooked: true });
      continue;
    }

    const verdict = await validateBatchItem(
      ctx,
      orgId,
      teacherId,
      item,
      settings,
      src,
      contextActive,
      batchAcceptedByDay.get(item.date) ?? [],
      budget,
      now,
      orgTz,
      bookingBoundary.upperExclusiveMs,
    );
    results.push({ ...item, ok: verdict.ok });
    if (verdict.ok === false) {
      conflicts.push({
        ...item,
        reason: verdict.reason,
        reasonKey: verdict.reasonKey,
      });
      continue;
    }
    budget -= 1;
    // Count this new item toward caps AND overlap for the rest of the batch.
    const endMin = timeToMin(item.startTime) + lessonMinutes;
    contextActive.push({
      ...item,
      endTime: minToTime(endMin),
      status: "scheduled",
    } as unknown as Doc<"scheduleEvents">);
    const dayArr = batchAcceptedByDay.get(item.date) ?? [];
    dayArr.push({
      date: item.date,
      startTime: item.startTime,
      endTime: minToTime(endMin),
      status: "scheduled",
    });
    batchAcceptedByDay.set(item.date, dayArr);
  }
  return {
    conflicts,
    items: results,
    lessonsAvailable: budget + results.filter((r) => r.ok).length,
    lessonsLeft: budget,
    cutoffDate: null,
    grantExpiryDays: null,
    reviewContext,
  };
}

/**
 * Read-only preview for the confirmation dialog: same validation as confirm, no
 * mutation. Returns per-item results, current balance, and (in repeat mode)
 * the expiry boundary so the UI can explain how many weeks fit.
 */
export const previewBookingBatch = query({
  args: {
    bookings: v.array(v.object({ date: v.string(), startTime: v.string() })),
    repeat: v.optional(v.boolean()),
  },
  handler: async (ctx, { bookings, repeat }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") throw new ConvexError("Students only");
    if (!user.teacherId) {
      throw new ConvexError("No teacher assigned yet — ask your academy admin");
    }
    if (repeat === true) {
      throw new ConvexError(
        "Weekly repeat is retired; submit explicit dated lessons instead",
      );
    }
    return await validateBatch(ctx, orgId, user.teacherId, user.externalId, {
      bookings,
      repeat: false,
    });
  },
});

/**
 * Atomic batch booking (2026-09-07 calendar rebuild). All validated starts
 * commit together (events + credit reservation + teacher notifications);
 * ANY conflict throws with a structured per-item payload and nothing is
 * left behind. `requestId` makes retries idempotent.
 */
export const confirmBookingBatch = mutation({
  args: {
    bookings: v.array(v.object({ date: v.string(), startTime: v.string() })),
    repeat: v.optional(v.boolean()),
    requestId: v.string(),
    expectedTeacherId: v.string(),
    expectedActivityTypeId: v.string(),
    expectedDurationMinutes: v.number(),
    expectedPointCost: v.number(),
    expectedAcademyTimezone: v.string(),
    expectedPolicyVersion: v.string(),
  },
  handler: async (
    ctx,
    {
      bookings,
      repeat,
      requestId,
      expectedTeacherId,
      expectedActivityTypeId,
      expectedDurationMinutes,
      expectedPointCost,
      expectedAcademyTimezone,
      expectedPolicyVersion,
    },
  ) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") throw new ConvexError("Students only");
    if (bookings.length === 0) throw new ConvexError("Nothing to book");
    if (repeat === true) {
      throw new ConvexError(
        "Weekly repeat is retired; submit explicit dated lessons instead",
      );
    }
    if (requestId.length < 8 || requestId.length > 200) {
      throw new ConvexError("Invalid booking request id");
    }

    const normalizedBookings = canonicalizeBookings(bookings);
    if (normalizedBookings.length === 0 || normalizedBookings.length > 400) {
      throw new ConvexError("Booking plan is empty or too large");
    }
    const payloadKey = JSON.stringify({
      bookings: normalizedBookings,
      repeat: false,
      expectedTeacherId,
      expectedActivityTypeId,
      expectedDurationMinutes,
      expectedPointCost,
      expectedAcademyTimezone,
      expectedPolicyVersion,
    });
    const existingReceipt = await ctx.db
      .query("calendarBookingRequests")
      .withIndex("by_organization_and_studentId_and_requestId", (q) =>
        q
          .eq("organizationId", orgId)
          .eq("studentId", user.externalId)
          .eq("requestId", requestId),
      )
      .unique();
    if (existingReceipt) {
      if (existingReceipt.payloadKey !== payloadKey) {
        throw new ConvexError(
          "This request id is already bound to a different booking plan",
        );
      }
      return {
        booked: existingReceipt.booked,
        lessonsLeft: existingReceipt.balanceAfter,
        alreadyBooked: true,
        receiptId: existingReceipt._id,
      };
    }

    if (!user.teacherId || expectedTeacherId !== user.teacherId) {
      throw new ConvexError(
        "Your assigned teacher changed; review the plan again",
      );
    }
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const orgTz = settings?.timezone ?? "UTC";
    const context = resolveSelfBookingContext(settings, orgTz);
    if (
      expectedActivityTypeId !== context.activityTypeId ||
      expectedDurationMinutes !== context.lessonMinutes ||
      expectedPointCost !== context.pointCost ||
      expectedAcademyTimezone !== context.academyTimezone ||
      expectedPolicyVersion !== context.policyVersion
    ) {
      throw new ConvexError("Booking rules changed; review the plan again");
    }

    const verdict = await validateBatch(
      ctx,
      orgId,
      user.teacherId,
      user.externalId,
      {
        bookings: normalizedBookings,
        repeat: false,
        requestId,
      },
    );
    if (verdict.conflicts.length > 0) {
      throw new ConvexError(JSON.stringify({ conflicts: verdict.conflicts }));
    }

    const teacher = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", user.teacherId!),
      )
      .unique();
    const booked: {
      eventId: Id<"scheduleEvents">;
      date: string;
      startTime: string;
    }[] = [];
    let idx = 0;
    for (const item of verdict.items) {
      if (item.alreadyBooked) {
        const existing = (
          await ctx.db
            .query("scheduleEvents")
            .withIndex("by_organization_and_studentId", (q) =>
              q.eq("organizationId", orgId).eq("studentId", user.externalId),
            )
            .collect()
        ).find(
          (event) =>
            !event.isDeleted &&
            event.teacherId === user.teacherId &&
            event.date === item.date &&
            event.startTime === item.startTime,
        );
        if (existing)
          booked.push({
            eventId: existing._id,
            date: item.date,
            startTime: item.startTime,
          });
        continue;
      }
      if (!item.ok) continue;
      const startMin = timeToMin(item.startTime);
      const eventId = await ctx.db.insert("scheduleEvents", {
        organizationId: orgId,
        externalId: `evt-batch-${requestId}-${idx++}`,
        type: "1on1",
        teacherId: user.teacherId,
        studentId: user.externalId,
        title:
          (settings?.activityTypes ?? DEFAULT_ACTIVITY_TYPES).find(
            (a) => a.id === context.activityTypeId,
          )?.name ?? "Lesson",
        date: item.date,
        startTime: item.startTime,
        endTime: minToTime(startMin + context.lessonMinutes),
        status: "scheduled",
        activityTypeId: context.activityTypeId,
        pointCostSnapshot: context.pointCost,
        googleMeetLink: teacher?.meetLink,
        createdAt: NOW(),
      });
      await spendPointsInternal(ctx, {
        orgId,
        studentId: user.externalId,
        amount: context.pointCost,
        scheduleEventId: eventId,
        reason: `Booked lesson on ${item.date} ${item.startTime}`,
        performedBy: user.externalId,
      });
      await insertNotification(ctx, {
        organizationId: orgId,
        recipientId: user.teacherId,
        kind: "lesson_assigned",
        payload: { date: item.date, startTime: item.startTime, by: "student" },
        link: "/teacher/calendar",
        sourceKey: `calendar-booking:${requestId}:${eventId}`,
      });
      booked.push({ eventId, date: item.date, startTime: item.startTime });
    }
    const receiptId = await ctx.db.insert("calendarBookingRequests", {
      organizationId: orgId,
      studentId: user.externalId,
      requestId,
      payloadKey,
      normalizedBookings,
      expectedTeacherId,
      activityTypeId: context.activityTypeId,
      lessonMinutes: context.lessonMinutes,
      pointCost: context.pointCost,
      academyTimezone: context.academyTimezone,
      policyVersion: context.policyVersion,
      booked,
      balanceAfter: verdict.lessonsLeft,
      status: "completed",
      createdAt: NOW(),
    });
    await syncAutomaticHomeworkDeadlines(ctx, orgId, user.externalId);
    return {
      booked,
      lessonsLeft: verdict.lessonsLeft,
      alreadyBooked: false,
      receiptId,
    };
  },
});

export const getBookingRequest = query({
  args: { requestId: v.string() },
  handler: async (ctx, { requestId }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") throw new ConvexError("Students only");
    const receipt = await ctx.db
      .query("calendarBookingRequests")
      .withIndex("by_organization_and_studentId_and_requestId", (q) =>
        q
          .eq("organizationId", orgId)
          .eq("studentId", user.externalId)
          .eq("requestId", requestId),
      )
      .unique();
    return receipt;
  },
});

/**
 * Retired 2026-09-26: student weekly repeat writers now reject `repeat:true`.
 * Legacy recurring rows remain readable for maintenance and historical context;
 * new student plans are always explicit dated events.
 */
// ── Pause (POLICY §6) ────────────────────────────────────────────
//
// Pause is what makes 60-day expiry humane: illness, travel and exams get a
// legitimate outlet. It freezes the expiry clock on every active grant and
// stops the materializer, while HOLDING the weekly slot.

export const PAUSE_MAX_DAYS = 14;
export const PAUSE_MAX_PER_180_DAYS = 2;

export const pauseStudent = mutation({
  args: {
    studentId: v.optional(v.string()), // admin acting for a student
    fromDate: v.string(),
    untilDate: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    const targetId =
      user.role === "student"
        ? user.externalId
        : (args.studentId ?? user.externalId);
    if (user.role === "teacher")
      throw new ConvexError("Teachers cannot pause students");

    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", targetId),
      )
      .unique();
    if (!student || student.role !== "student")
      throw new ConvexError("Student not found");

    if (args.untilDate < args.fromDate)
      throw new ConvexError("End date is before the start date");
    const days =
      Math.round(
        (Date.parse(`${args.untilDate}T00:00:00Z`) -
          Date.parse(`${args.fromDate}T00:00:00Z`)) /
          86_400_000,
      ) + 1;
    if (Number.isNaN(days)) throw new ConvexError("Invalid dates");
    // Admins may override the cap; students are held to policy.
    if (user.role !== "admin" && days > PAUSE_MAX_DAYS) {
      throw new ConvexError(`A pause can last at most ${PAUSE_MAX_DAYS} days`);
    }

    // Rolling 6-month quota, counted from the ledger of past pauses.
    if (user.role !== "admin") {
      const since = new Date(Date.now() - 180 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const past = await ctx.db
        .query("studentPauses")
        .withIndex("by_organization_and_studentId", (q) =>
          q.eq("organizationId", orgId).eq("studentId", targetId),
        )
        .collect();
      const recent = past.filter((p) => p.fromDate >= since).length;
      if (recent >= PAUSE_MAX_PER_180_DAYS) {
        throw new ConvexError(
          `Only ${PAUSE_MAX_PER_180_DAYS} pauses are allowed every 6 months — talk to your academy`,
        );
      }
    }

    // Freeze the expiry clock: push every activated grant's expiry out by the
    // length of the pause. Un-activated grants have no clock to freeze yet.
    const pausedDays = days;
    const grants = await ctx.db
      .query("pointGrants")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", targetId),
      )
      .collect();
    let frozen = 0;
    for (const g of grants) {
      if (g.isExpired || !g.activatedAt || !g.expiryDays) continue;
      if (g.remainingPoints <= 0) continue;
      const next = new Date(`${g.expiresAt}T00:00:00Z`);
      if (Number.isNaN(next.getTime())) continue;
      next.setUTCDate(next.getUTCDate() + pausedDays);
      await ctx.db.patch(g._id, { expiresAt: next.toISOString().slice(0, 10) });
      frozen++;
    }

    await ctx.db.patch(student._id, {
      studentStatus: "paused",
      pausedFrom: args.fromDate,
      pausedUntil: args.untilDate,
      pauseReason: args.reason,
    });
    await ctx.db.insert("studentPauses", {
      organizationId: orgId,
      studentId: targetId,
      fromDate: args.fromDate,
      toDate: args.untilDate,
      reason: args.reason,
      createdBy: user.externalId,
      createdAt: NOW(),
    });

    return { days: pausedDays, grantsFrozen: frozen };
  },
});

/** End a pause early. Does NOT rewind the expiry extension already granted. */
export const resumeStudent = mutation({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    const targetId =
      user.role === "student"
        ? user.externalId
        : (args.studentId ?? user.externalId);
    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", targetId),
      )
      .unique();
    if (!student) throw new ConvexError("Student not found");
    await ctx.db.patch(student._id, {
      studentStatus: "active",
      pausedFrom: undefined,
      pausedUntil: undefined,
      pauseReason: undefined,
    });
    return null;
  },
});

/** Daily cron — auto-resume students whose pause window has passed. */
export const resumeExpiredPauses = internalMutation({
  args: {},
  handler: async (ctx) => {
    const paused = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("studentStatus"), "paused"))
      .collect();
    let resumed = 0;
    for (const s of paused) {
      const today = instantToZoned(
        new Date(),
        await orgTimezone(ctx, s.organizationId),
      ).date;
      if (!s.pausedUntil || s.pausedUntil >= today) continue;
      await ctx.db.patch(s._id, {
        studentStatus: "active",
        pausedFrom: undefined,
        pausedUntil: undefined,
        pauseReason: undefined,
      });
      await ctx.runMutation(internal.notifications._notify, {
        organizationId: s.organizationId,
        recipientId: s.externalId,
        kind: "booking_reminder",
        payload: { reason: "pause_ended" },
        link: "/student/calendar",
      });
      resumed++;
    }
    return { resumed };
  },
});

/** Dev/CI helper — same as assignLesson but callable from the CLI. */
export const _assignCli = internalMutation({
  args: {
    orgId: v.string(),
    adminId: v.string(),
    teacherId: v.string(),
    studentId: v.string(),
    date: v.string(),
    startTime: v.string(),
  },
  handler: async (ctx, { orgId, adminId, ...args }) => {
    return await assignLessonCore(ctx, orgId, adminId, args);
  },
});

/** Dev/CI helper — open a weekly availability window for a teacher (by email). */
export const _openWeeklyCli = internalMutation({
  args: {
    teacherEmail: v.string(),
    dayOfWeek: v.number(),
    startTime: v.string(),
    endTime: v.string(),
  },
  handler: async (ctx, { teacherEmail, dayOfWeek, startTime, endTime }) => {
    const t = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), teacherEmail))
      .first();
    if (!t) throw new ConvexError("Teacher not found");
    const id = await ctx.db.insert("teacherVacancies", {
      organizationId: t.organizationId,
      teacherId: t.externalId,
      dayOfWeek,
      startTime,
      endTime,
      validFrom: "2020-01-01",
      isActive: true,
      createdAt: NOW(),
    });
    return { id, teacherId: t.externalId, org: t.organizationId };
  },
});

async function assignLessonCore(
  ctx: MutationCtx,
  orgId: string,
  performedBy: string,
  {
    teacherId,
    studentId,
    date,
    startTime,
    googleMeetLink,
  }: {
    teacherId: string;
    studentId: string;
    date: string;
    startTime: string;
    googleMeetLink?: string;
  },
  by: "admin" | "student" = "admin",
) {
  {
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    if (!isValidAcademyDate(date))
      throw new ConvexError("Invalid academy date");
    const academyTz = settings?.timezone ?? "UTC";
    if (wallTimeToMs(date, startTime, academyTz) <= Date.now()) {
      throw new ConvexError("Slot is in the past");
    }

    const lessonMinutes = POLICY.reservationMinutes;
    const granularity = POLICY.bookingGranularityMinutes;
    const startMin = requireSlotStart(startTime);
    const endMin = startMin + lessonMinutes;

    const src = await loadSlotSources(ctx, orgId, teacherId);
    if (timeOffOnDate(src, date))
      throw new ConvexError(
        "Remove time off before assigning a lesson on that date",
      );
    const dayEvents = await loadTeacherEvents(
      ctx,
      orgId,
      teacherId,
      date,
      date,
    );
    const hit = overlapConflict(dayEvents, date, startMin, endMin);

    if (by === "student") {
      // Range model (POLICY §5): student picks any start on the booking grid,
      // fully inside open hours. Adjacent reservations are allowed.
      if (startMin % granularity !== 0) {
        throw new ConvexError(
          `Start time must be on a ${granularity}-minute mark`,
        );
      }
      if (!isRangeOpen(src, date, startMin, endMin)) {
        throw new ConvexError(
          "That time isn't inside the teacher's open hours",
        );
      }
      if (hit) {
        throw new ConvexError("That time overlaps another lesson");
      }
    } else {
      // Staff can schedule outside published availability; overlaps are blocked.
      if (hit) {
        throw new ConvexError(
          `That time overlaps the ${hit.startTime}–${hit.endTime} lesson`,
        );
      }
    }

    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", studentId),
      )
      .unique();
    if (!student || student.role !== "student")
      throw new ConvexError("Student not found");
    await assertStudentFree(ctx, orgId, studentId, date, startMin, endMin);

    // C-8 — no explicit link? use the teacher's permanent meeting room.
    let meetLink = googleMeetLink;
    if (!meetLink) {
      const teacher = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", teacherId),
        )
        .unique();
      meetLink = teacher?.meetLink;
    }

    const types = settings?.activityTypes ?? DEFAULT_ACTIVITY_TYPES;
    const activity =
      by === "student"
        ? types.find((a) => a.isActive && !a.isGroup)
        : (types.find((a) => a.isActive && !a.isGroup) ??
          types.find((a) => !a.isGroup));
    if (!activity) throw new ConvexError("No 1-on-1 activity type configured");
    if (by === "student" && activity.pointCost !== 1) {
      throw new ConvexError(
        "Student self-booking requires one lesson per booking",
      );
    }

    const eventId = await ctx.db.insert("scheduleEvents", {
      organizationId: orgId,
      externalId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "1on1",
      teacherId,
      studentId,
      title: activity.name,
      date,
      startTime,
      endTime: minToTime(startMin + lessonMinutes),
      status: "scheduled",
      activityTypeId: activity.id,
      pointCostSnapshot: activity.pointCost,
      googleMeetLink: meetLink,
      createdAt: NOW(),
    });

    // Deduct the lesson credit — throws on insufficient balance and
    // Convex rolls back the whole mutation, including the insert.
    await spendPointsInternal(ctx, {
      orgId,
      studentId,
      amount: activity.pointCost,
      scheduleEventId: eventId,
      reason: `Assigned ${activity.name} on ${date} ${startTime}`,
      performedBy,
    });

    const recipients = by === "student" ? [teacherId] : [teacherId, studentId];
    for (const r of recipients) {
      await ctx.runMutation(internal.notifications._notify, {
        organizationId: orgId,
        recipientId: r,
        kind: "lesson_assigned",
        payload: { date, startTime, by },
        link: r === teacherId ? "/teacher/calendar" : "/student/calendar",
      });
    }
    await syncAutomaticHomeworkDeadlines(ctx, orgId, studentId);
    return eventId;
  }
}

/** Active lessons overlap when their [start, end) intervals intersect. */
function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return (
    timeToMin(aStart) < timeToMin(bEnd) && timeToMin(bStart) < timeToMin(aEnd)
  );
}

export const ACTIVE_STATUSES = ["scheduled", "makeup"];

/**
 * One-time lesson — a real dated lesson at ANY time, deliberately not
 * restricted to the availability lattice. Two entry points share it:
 * the teacher/admin "One-time lesson" button, and a session started from
 * Live with no scheduled event behind it.
 *
 * Start times follow the academy half-hour grid — the calendar renders
 * rows when the data needs them. Conflicts are checked by real interval
 * overlap on BOTH sides, since neither party can be in two lessons at once.
 *
 * Balance: spends a credit when the student has one. With a zero balance
 * the lesson is still created and flagged `unpaid` rather than blocked —
 * refusing to record a lesson that is actually happening would leave the
 * calendar lying. Admin reconciles from the needs-attention inbox.
 */
export const createOneTimeLesson = mutation({
  args: {
    studentId: v.string(),
    requestId: v.optional(v.string()),
    date: v.string(),
    startTime: v.string(),
    durationMinutes: v.optional(v.number()),
    teacherId: v.optional(v.string()), // admin acting for a teacher
    googleMeetLink: v.optional(v.string()),
    // Accepted for older clients; no buffer rule is enforced.
    overrideBuffer: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    if (
      (user.role !== "teacher" && user.role !== "admin") ||
      !userHasPermission(user, "calendar.edit.full")
    )
      throw new ConvexError("Lesson assignment is not permitted");
    if (args.requestId) {
      if (args.requestId.length < 8 || args.requestId.length > 200)
        throw new ConvexError("Invalid booking request");
      const previous = await ctx.db
        .query("scheduleEvents")
        .withIndex("by_booking_request", (q) =>
          q
            .eq("organizationId", orgId)
            .eq("bookingActorId", user.externalId)
            .eq("bookingRequestId", args.requestId),
        )
        .unique();
      if (previous) {
        if (
          previous.studentId !== args.studentId ||
          previous.date !== args.date ||
          previous.startTime !== args.startTime ||
          previous.teacherId !==
            (user.role === "teacher" ? user.externalId : args.teacherId)
        )
          throw new ConvexError("Retry differs from saved lesson");
        return { eventId: previous._id, unpaid: !!previous.unpaid };
      }
    }

    const teacherId =
      user.role === "admin"
        ? (args.teacherId ?? user.externalId)
        : user.externalId;

    if (!isValidAcademyDate(args.date))
      throw new ConvexError("Invalid academy date");
    if (!/^\d{2}:\d{2}$/.test(args.startTime))
      throw new ConvexError("Invalid start time");

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const academyTz = settings?.timezone ?? "UTC";
    if (wallTimeToMs(args.date, args.startTime, academyTz) <= Date.now())
      throw new ConvexError("Choose a future slot");
    const teacher = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", teacherId),
      )
      .unique();
    if (!teacher || teacher.role !== "teacher")
      throw new ConvexError("Teacher not found");
    if (timeOffOnDate(await loadSlotSources(ctx, orgId, teacherId), args.date))
      throw new ConvexError(
        "Remove time off before assigning a lesson on that date",
      );
    const duration = POLICY.reservationMinutes;
    if (args.durationMinutes !== undefined && args.durationMinutes !== duration)
      throw new ConvexError("Lessons reserve 60 minutes");
    if (duration <= 0 || duration > 24 * 60)
      throw new ConvexError("Invalid duration");

    const startMin = requireSlotStart(args.startTime);
    if (startMin + duration > 24 * 60) {
      throw new ConvexError(
        "A lesson can't run past midnight — split it across two days",
      );
    }
    const endTime = minToTime(startMin + duration);

    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", args.studentId),
      )
      .unique();
    if (!student || student.role !== "student")
      throw new ConvexError("Student not found");

    if (user.role === "teacher" && student.teacherId !== teacherId)
      throw new ConvexError("Student is not assigned to you");

    // Neither party can be double-booked. Teacher side: overlap is a hard
    // block. Adjacent reservations remain allowed.
    const teacherDay = await loadTeacherEvents(
      ctx,
      orgId,
      teacherId,
      args.date,
      args.date,
    );
    const hit = overlapConflict(
      teacherDay,
      args.date,
      startMin,
      startMin + duration,
    );
    if (hit) {
      throw new ConvexError(
        `That overlaps the ${hit.startTime}–${hit.endTime} lesson`,
      );
    }

    // …and the student side, who may sit with another teacher.
    const studentDay = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", args.studentId),
      )
      .collect();
    for (const e of studentDay) {
      if (e.isDeleted || e.date !== args.date) continue;
      if (!ACTIVE_STATUSES.includes(e.status)) continue;
      if (overlaps(args.startTime, endTime, e.startTime, e.endTime)) {
        throw new ConvexError(
          `The student already has a lesson at ${e.startTime}`,
        );
      }
    }

    const types = settings?.activityTypes ?? DEFAULT_ACTIVITY_TYPES;
    const activity =
      types.find((a) => a.isActive && !a.isGroup) ??
      types.find((a) => !a.isGroup);
    if (!activity) throw new ConvexError("No 1-on-1 activity type configured");

    let meetLink = args.googleMeetLink;
    if (!meetLink) {
      const teacher = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", teacherId),
        )
        .unique();
      meetLink = teacher?.meetLink;
    }

    // Can the student pay for it? Checked before insert so we can stamp the flag.
    const today = instantToZoned(new Date(), academyTz).date;
    const grants = await ctx.db
      .query("pointGrants")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", args.studentId),
      )
      .collect();
    let balance = 0;
    for (const g of grants) {
      if (g.isExpired || g.expiresAt < today || g.remainingPoints <= 0)
        continue;
      balance += g.remainingPoints;
    }
    const canPay = balance >= activity.pointCost;

    const eventId = await ctx.db.insert("scheduleEvents", {
      organizationId: orgId,
      bookingRequestId: args.requestId,
      bookingActorId: user.externalId,
      externalId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "1on1",
      teacherId,
      studentId: args.studentId,
      title: activity.name,
      date: args.date,
      startTime: args.startTime,
      endTime,
      status: "scheduled",
      activityTypeId: activity.id,
      pointCostSnapshot: activity.pointCost,
      googleMeetLink: meetLink,
      adHoc: true,
      adHocSource: "one_time_booking",
      unpaid: !canPay,
      createdAt: NOW(),
    });

    if (canPay) {
      await spendPointsInternal(ctx, {
        orgId,
        studentId: args.studentId,
        amount: activity.pointCost,
        scheduleEventId: eventId,
        reason: `One-time ${activity.name} on ${args.date} ${args.startTime}`,
        performedBy: user.externalId,
      });
    } else {
      const admins = await ctx.db
        .query("users")
        .withIndex("by_organization_and_role", (q) =>
          q.eq("organizationId", orgId).eq("role", "admin"),
        )
        .collect();
      for (const a of admins) {
        await ctx.runMutation(internal.notifications._notify, {
          organizationId: orgId,
          recipientId: a.externalId,
          kind: "lesson_assigned",
          payload: {
            date: args.date,
            startTime: args.startTime,
            by: user.role,
            unpaid: true,
            studentName: student.name,
          },
          link: "/admin/billing?tab=commercial",
        });
      }
    }

    await ctx.runMutation(internal.notifications._notify, {
      organizationId: orgId,
      recipientId: args.studentId,
      kind: "lesson_assigned",
      payload: { date: args.date, startTime: args.startTime, by: user.role },
      link: "/student/calendar",
    });

    await syncAutomaticHomeworkDeadlines(ctx, orgId, args.studentId);
    return { eventId, unpaid: !canPay };
  },
});

/** Policy-aware cancellation (§13.3). */
export const cancelEvent = mutation({
  args: { eventId: v.id("scheduleEvents") },
  handler: async (ctx, { eventId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const event = await ctx.db.get(eventId);
    if (!event || event.organizationId !== orgId)
      throw new ConvexError("Event not found");

    const actor = actionActor(user, event, "calendar.cancel.full");
    if (isRunningOrFinished(event))
      throw new ConvexError("A running or finished lesson cannot be cancelled");
    const now = new Date();
    const verdict = cancelVerdict({
      actor,
      event,
      now,
      orgTz: await orgTimezone(ctx, orgId),
      studentRecentFreeCancels: await countRecentFreeCancels(
        ctx,
        orgId,
        event.studentId,
      ),
      isFirstLessonWithStudent: await isFirstLesson(ctx, orgId, event),
    });
    if (!verdict.allowed) throw new ConvexError(verdict.reason);

    await ctx.db.patch(eventId, {
      status: "cancelled",
      cancelledBy: actor,
      cancelledAt: NOW(),
      cancellationCharged: !verdict.refund,
    });

    // Refund the lesson credit only if it was actually paid (spend tx exists)
    if (
      verdict.refund &&
      event.studentId &&
      (event.pointCostSnapshot ?? 0) > 0
    ) {
      const txs = await ctx.db
        .query("pointTransactions")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .collect();
      const spend = txs.find(
        (t) => t.scheduleEventId === eventId && t.type === "spend",
      );
      const refunded = txs.some(
        (t) =>
          t.scheduleEventId === eventId &&
          (t.type === "refund" ||
            (t.type === "grant" &&
              (t.reason ?? "").startsWith("Cancelled lesson "))),
      );
      if (spend && !refunded) {
        await grantPointsInternal(ctx, {
          orgId,
          studentId: event.studentId,
          points: Math.abs(spend.amount),
          source: "refund",
          performedBy: user.externalId,
          notes: `Cancelled lesson ${event.date} ${event.startTime} (${actor})`,
          scheduleEventId: eventId,
        });
      }
    }

    // Notify the other party
    const recipients = [
      actor !== "student" ? event.studentId : null,
      actor !== "teacher" ? event.teacherId : null,
    ].filter(Boolean) as string[];
    for (const r of recipients) {
      await ctx.runMutation(internal.notifications._notify, {
        organizationId: orgId,
        recipientId: r,
        kind: "lesson_cancelled",
        payload: {
          date: event.date,
          startTime: event.startTime,
          by: actor,
          charged: !verdict.refund,
        },
        link: r === event.teacherId ? "/teacher/calendar" : "/student/calendar",
      });
    }
    if (event.studentId)
      await syncAutomaticHomeworkDeadlines(ctx, orgId, event.studentId);
    return { charged: !verdict.refund, trackedLate: verdict.trackedLate };
  },
});

/** Same target validation for the preview, keyboard move, and drag. */
async function validateMove(
  ctx: QueryCtx | MutationCtx,
  eventId: Id<"scheduleEvents">,
  toDate: string,
  toStartTime: string,
) {
  const { orgId, user } = await requireTenant(ctx);
  const event = await ctx.db.get(eventId);
  if (!event || event.organizationId !== orgId)
    throw new ConvexError("Event not found");
  const actor = actionActor(user, event);
  if (!event.teacherId) throw new ConvexError("Event has no teacher");
  if (isRunningOrFinished(event))
    throw new ConvexError("A running or finished lesson cannot be moved");
  const now = new Date(),
    orgTz = await orgTimezone(ctx, orgId);
  const verdict = rescheduleVerdict({ actor, event, now, orgTz });
  if (!verdict.allowed) throw new ConvexError(verdict.reason);
  if (!isValidAcademyDate(toDate))
    throw new ConvexError("Invalid academy date");
  const start = requireSlotStart(toStartTime),
    end = start + POLICY.reservationMinutes;
  const target = { ...event, date: toDate, startTime: toStartTime };
  if (actor !== "admin" && !withinActionHorizon(target, now, orgTz))
    throw new ConvexError(
      `New time must be within the next ${POLICY.actionHorizonDays} days`,
    );
  if (wallTimeToMs(toDate, toStartTime, orgTz) <= now.getTime())
    throw new ConvexError("New time must be in the future");
  if (toDate === event.date && toStartTime === event.startTime)
    throw new ConvexError("Choose a different time");
  const src = await loadSlotSources(ctx, orgId, event.teacherId);
  if (timeOffOnDate(src, toDate))
    throw new ConvexError("The teacher is taking time off on that date");
  if (actor === "student" && !isRangeOpen(src, toDate, start, end))
    throw new ConvexError("That time isn't inside the teacher's open hours");
  const events = await loadTeacherEvents(
    ctx,
    orgId,
    event.teacherId,
    toDate,
    toDate,
  );
  if (overlapConflict(events, toDate, start, end, eventId))
    throw new ConvexError("That time overlaps another lesson");
  if (event.studentId) {
    await assertStudentFree(
      ctx,
      orgId,
      event.studentId,
      toDate,
      start,
      end,
      eventId,
    );
    if (actor === "student") {
      const own = (
        await ctx.db
          .query("scheduleEvents")
          .withIndex("by_organization_and_studentId", (q) =>
            q.eq("organizationId", orgId).eq("studentId", event.studentId!),
          )
          .collect()
      ).filter(
        (e) =>
          !e.isDeleted &&
          e._id !== eventId &&
          ACTIVE_STATUSES.includes(e.status),
      );
      if (
        own.filter((e) => e.date === toDate).length >=
        POLICY.maxStudentBookingsPerDay
      )
        throw new ConvexError("You already have a lesson on that date");
      if (
        own.filter((e) => mondayKey(e.date) === mondayKey(toDate)).length >=
        POLICY.maxStudentBookingsPerWeek
      )
        throw new ConvexError("Maximum lessons per week reached");
      if (verdict.chargesLesson) {
        const today = instantToZoned(now, orgTz).date;
        const grants = await ctx.db
          .query("pointGrants")
          .withIndex("by_organization_and_studentId", (q) =>
            q.eq("organizationId", orgId).eq("studentId", event.studentId!),
          )
          .collect();
        if (
          grants
            .filter(
              (g) =>
                !g.isExpired && g.expiresAt >= today && g.remainingPoints > 0,
            )
            .reduce((sum, g) => sum + g.remainingPoints, 0) <
          (event.pointCostSnapshot ?? 1)
        )
          throw new ConvexError(
            "You need another lesson on your balance to move this late",
          );
      }
    }
  }
  return { orgId, user, event, actor, verdict, endTime: minToTime(end) };
}
export const previewMove = query({
  args: {
    eventId: v.id("scheduleEvents"),
    toDate: v.string(),
    toStartTime: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const { verdict } = await validateMove(
        ctx,
        args.eventId,
        args.toDate,
        args.toStartTime,
      );
      return {
        allowed: true,
        reason: verdict.reason,
        charged: verdict.chargesLesson,
      };
    } catch (error) {
      if (error instanceof ConvexError)
        return { allowed: false, reason: String(error.data), charged: false };
      throw error;
    }
  },
});
export async function rescheduleEventCore(
  ctx: MutationCtx,
  {
    eventId,
    toDate,
    toStartTime,
  }: { eventId: Id<"scheduleEvents">; toDate: string; toStartTime: string },
) {
  const { orgId, user, event, actor, verdict, endTime } = await validateMove(
    ctx,
    eventId,
    toDate,
    toStartTime,
  );
  let movedEventId = eventId;
  const reminderReset = {
    sessionReminderSent: undefined,
    studentReminder24Sent: undefined,
    studentReminder1Sent: undefined,
    noShowNotifications: undefined,
  };
  if (verdict.chargesLesson && event.studentId) {
    // The held hour remains a charged historical reservation; the new date is a
    // separately paid booking. Ledger, history, and payroll retain both IDs.
    const { _id, _creationTime, ...data } = event;
    void _id;
    void _creationTime;
    movedEventId = await ctx.db.insert("scheduleEvents", {
      ...data,
      ...reminderReset,
      externalId: `evt-move-${eventId}-${Date.now()}`,
      date: toDate,
      startTime: toStartTime,
      endTime,
      status: "scheduled",
      rescheduledFromEventId: eventId,
      replacementEventId: undefined,
      bookingRequestId: undefined,
      bookingActorId: undefined,
      cancelledBy: undefined,
      cancelledAt: undefined,
      cancellationCharged: undefined,
      lateMoveCharged: undefined,
      rescheduledBy: actor,
      createdAt: NOW(),
    });
    await spendPointsInternal(ctx, {
      orgId,
      studentId: event.studentId,
      amount: event.pointCostSnapshot ?? 1,
      scheduleEventId: movedEventId,
      reason: `Moved lesson to ${toDate} ${toStartTime}`,
      performedBy: user.externalId,
    });
    await ctx.db.patch(eventId, {
      status: "cancelled",
      cancelledBy: "student",
      cancelledAt: NOW(),
      cancellationCharged: true,
      lateMoveCharged: true,
      replacementEventId: movedEventId,
    });
  } else {
    await ctx.db.patch(eventId, {
      ...reminderReset,
      date: toDate,
      startTime: toStartTime,
      endTime,
      rescheduledBy: actor,
    });
  }
  for (const recipientId of [
    actor !== "student" ? event.studentId : null,
    actor !== "teacher" ? event.teacherId : null,
  ].filter(Boolean) as string[]) {
    await ctx.runMutation(internal.notifications._notify, {
      organizationId: orgId,
      recipientId,
      kind: "lesson_rescheduled",
      payload: {
        fromDate: event.date,
        fromTime: event.startTime,
        toDate,
        toTime: toStartTime,
        by: actor,
      },
      link:
        recipientId === event.teacherId
          ? "/teacher/calendar"
          : "/student/calendar",
    });
  }
  if (event.studentId)
    await syncAutomaticHomeworkDeadlines(ctx, orgId, event.studentId);
  return {
    trackedLate: verdict.trackedLate,
    charged: verdict.chargesLesson,
    eventId: movedEventId,
  };
}
export const rescheduleEvent = mutation({
  args: {
    eventId: v.id("scheduleEvents"),
    toDate: v.string(),
    toStartTime: v.string(),
  },
  handler: rescheduleEventCore,
});

/** Show concrete reservations before changing the teacher used for new bookings. */
export const reassignmentPreview = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "admin" || !userHasPermission(user, "users.edit"))
      throw new ConvexError("Assignment access denied");
    const orgTz = await orgTimezone(ctx, orgId);
    const events = (
      await ctx.db
        .query("scheduleEvents")
        .withIndex("by_organization_and_studentId", (q) =>
          q.eq("organizationId", orgId).eq("studentId", studentId),
        )
        .collect()
    ).filter(
      (e) =>
        !e.isDeleted &&
        ACTIVE_STATUSES.includes(e.status) &&
        wallTimeToMs(e.date, e.startTime, orgTz) > Date.now(),
    );
    const names = new Map<string, string>();
    for (const id of new Set(
      events.map((e) => e.teacherId).filter(Boolean) as string[],
    )) {
      const teacher = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", id),
        )
        .unique();
      names.set(id, teacher?.name ?? "Teacher");
    }
    return {
      events: events.map((e) => ({
        _id: e._id,
        date: e.date,
        startTime: e.startTime,
        teacherId: e.teacherId,
        teacherName: e.teacherId ? names.get(e.teacherId) : "Teacher",
      })),
      orgTz,
    };
  },
});
