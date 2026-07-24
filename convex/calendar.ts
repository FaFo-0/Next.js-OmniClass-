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
  type Actor,
} from "./lib/policy";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { grantPointsInternal, spendPointsInternal } from "./points";
import { DEFAULT_ACTIVITY_TYPES } from "./tenantSettings";
import { wallTimeToMs } from "./lib/time";

const NOW = () => new Date().toISOString();

/** Academy timezone — every stored date+time is wall-clock in it. */
async function orgTimezone(ctx: QueryCtx | MutationCtx, orgId: string): Promise<string> {
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
  return new Date(`${date}T12:00:00`).getDay();
}
/** Monday-of-week "YYYY-MM-DD" key — one per ISO week for grouping. */
function mondayKey(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
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
  }[];
}

/**
 * Is the slot starting at date+startTime open per pattern+exceptions?
 * Exceptions can be exact-slot (from single-slot toggles) or ranges
 * (from time-off blocks); an exact-startTime match takes precedence.
 */
function isSlotOpen(src: SlotSources, date: string, startTime: string): boolean {
  const min = timeToMin(startTime);
  const exact = src.exceptions.find(
    (e) => e.date === date && e.startTime === startTime
  );
  if (exact) return exact.kind === "open";
  const range = src.exceptions.find(
    (e) =>
      e.date === date &&
      timeToMin(e.startTime) <= min &&
      timeToMin(e.endTime) > min
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
      timeToMin(vac.endTime) >= min + 1 // slot must start strictly inside the window
  );
}

/**
 * Coalesced open windows for a date, as [startMin, endMin) minute intervals.
 * Range model (POLICY §5): teacher availability is continuous windows, not a
 * fixed grid. Precedence per minute mirrors isSlotOpen: a closed exception
 * beats an open exception beats the weekly vacancy pattern beats closed-default.
 * Boundary-swept so it stays exact and cheap regardless of granularity.
 */
function openRangesForDate(
  src: SlotSources,
  date: string
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
        (!v.validUntil || v.validUntil >= date)
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
    if (last && last.endMin === a) last.endMin = b; // coalesce touching segments
    else out.push({ startMin: a, endMin: b });
  }
  return out;
}

/** Is [startMin, endMin) fully inside one open window on `date`? */
function isRangeOpen(
  src: SlotSources,
  date: string,
  startMin: number,
  endMin: number
): boolean {
  return openRangesForDate(src, date).some(
    (r) => r.startMin <= startMin && r.endMin >= endMin
  );
}

type BufferHit = {
  kind: "overlap" | "buffer";
  startTime: string;
  endTime: string;
};

/**
 * POLICY §5 — a lesson needs `buffer` clear minutes on each side. Returns the
 * worst conflict against active lessons: "overlap" (times intersect — always a
 * hard block) or "buffer" (back-to-back inside the rest window — hard for
 * students, override-able for admin/teacher), or null when clear.
 */
function bufferConflict(
  events: { date: string; startTime: string; endTime: string; status: string }[],
  date: string,
  startMin: number,
  endMin: number,
  buffer: number,
  excludeEventId?: string
): BufferHit | null {
  let hit: BufferHit | null = null;
  for (const e of events) {
    if (e.date !== date) continue;
    if (!ACTIVE_STATUSES.includes(e.status)) continue;
    if (excludeEventId && (e as { _id?: string })._id === excludeEventId) continue;
    const es = timeToMin(e.startTime);
    const ee = timeToMin(e.endTime);
    // Hard overlap: the lesson intervals themselves intersect.
    if (es < endMin && startMin < ee) {
      return { kind: "overlap", startTime: e.startTime, endTime: e.endTime };
    }
    // Buffer breach: within `buffer` minutes on either side.
    if (es < endMin + buffer && startMin - buffer < ee) {
      hit = { kind: "buffer", startTime: e.startTime, endTime: e.endTime };
    }
  }
  return hit;
}

async function loadSlotSources(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  teacherId: string
): Promise<SlotSources> {
  const vacancies = await ctx.db
    .query("teacherVacancies")
    .withIndex("by_organization_and_teacherId", (q) =>
      q.eq("organizationId", orgId).eq("teacherId", teacherId)
    )
    .collect();
  const exceptions = await ctx.db
    .query("slotExceptions")
    .withIndex("by_organization_and_teacherId", (q) =>
      q.eq("organizationId", orgId).eq("teacherId", teacherId)
    )
    .collect();
  return { vacancies, exceptions };
}

async function loadTeacherEvents(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  teacherId: string,
  fromDate: string,
  toDate: string
) {
  const events = await ctx.db
    .query("scheduleEvents")
    .withIndex("by_organization_and_teacherId", (q) =>
      q.eq("organizationId", orgId).eq("teacherId", teacherId)
    )
    .collect();
  return events.filter(
    (e) =>
      !e.isDeleted &&
      e.type !== "placeholder" &&
      e.date >= fromDate &&
      e.date <= toDate
  );
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
  toDate: string
) {
  {
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const slotMinutes = settings?.defaultLessonDurationMinutes ?? 60;

    const src = await loadSlotSources(ctx, orgId, teacherId);
    const events = await loadTeacherEvents(ctx, orgId, teacherId, fromDate, toDate);

    // Resolve student names server-side (Z.X-5: never ship the org user list
    // to the client). Same pass collects the hover-card facts (§14.6).
    const studentIds = [...new Set(events.map((e) => e.studentId).filter(Boolean))] as string[];
    const names: Record<string, string> = {};
    const students: Record<
      string,
      { name: string; balance: number; lastLessonDate: string | null }
    > = {};
    const today = new Date().toISOString().slice(0, 10);
    for (const sid of studentIds) {
      const s = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", sid)
        )
        .unique();
      if (!s) continue;
      names[sid] = s.name;

      const grants = await ctx.db
        .query("pointGrants")
        .withIndex("by_organization_and_studentId", (q) =>
          q.eq("organizationId", orgId).eq("studentId", sid)
        )
        .collect();
      let balance = 0;
      for (const g of grants) {
        if (g.isExpired || g.expiresAt < today || g.remainingPoints <= 0) continue;
        balance += g.remainingPoints;
      }

      // Most recent lesson that actually happened, for "last seen" context.
      const past = await ctx.db
        .query("scheduleEvents")
        .withIndex("by_organization_and_studentId", (q) =>
          q.eq("organizationId", orgId).eq("studentId", sid)
        )
        .collect();
      let lastLessonDate: string | null = null;
      for (const e of past) {
        if (e.isDeleted || e.status !== "completed") continue;
        if (lastLessonDate === null || e.date > lastLessonDate) lastLessonDate = e.date;
      }

      students[sid] = { name: s.name, balance, lastLessonDate };
    }

    // Concrete open slots per date (skip past slots and slots holding an
    // active lesson — the UI shows the lesson instead)
    const openSlots: { date: string; startTime: string; endTime: string }[] = [];
    const active = events.filter(
      (e) => e.status === "scheduled" || e.status === "makeup"
    );
    const nowMs = Date.now();
    const orgTz = settings?.timezone ?? "UTC";
    const bufferMinutes = settings?.bufferMinutes ?? 10;
    const granularity = settings?.bookingGranularityMinutes ?? 15;

    // Range model (POLICY §5): ship continuous open windows + opaque busy
    // intervals; the client computes bookable start times and the server
    // re-validates on booking. `openSlots` (legacy discrete grid) stays until
    // the frontend fully migrates.
    const openRanges: { date: string; startTime: string; endTime: string }[] = [];
    const busy: { date: string; startTime: string; endTime: string }[] = [];
    for (
      let d = new Date(`${fromDate}T12:00:00`);
      d <= new Date(`${toDate}T12:00:00`);
      d.setDate(d.getDate() + 1)
    ) {
      const date = d.toISOString().slice(0, 10);

      // Wall-clock "now" minute for this date in the academy tz — trims the
      // already-past part of today without hiding future days.
      const midnightMs = wallTimeToMs(date, "00:00", orgTz);
      const nowWallMin = Number.isNaN(midnightMs)
        ? -1
        : (nowMs - midnightMs) / 60_000;
      if (nowWallMin >= 24 * 60) continue; // whole day is past

      for (const r of openRangesForDate(src, date)) {
        const startMin = nowWallMin > 0 ? Math.max(r.startMin, Math.ceil(nowWallMin)) : r.startMin;
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
        const taken = active.some((e) => e.date === date && e.startTime === startTime);
        if (!taken) openSlots.push({ date, startTime, endTime: minToTime(m + slotMinutes) });
      }
    }

    return {
      slotMinutes,
      lessonMinutes: slotMinutes,
      bufferMinutes,
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
    return await buildCalendar(ctx, orgId, user.externalId, fromDate, toDate);
  },
});

/** Admin view of any teacher's calendar. */
export const getAdminCalendar = query({
  args: { teacherId: v.string(), fromDate: v.string(), toDate: v.string() },
  handler: async (ctx, { teacherId, fromDate, toDate }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "admin") throw new ConvexError("Admins only");
    return await buildCalendar(ctx, orgId, teacherId, fromDate, toDate);
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
    if (user.role !== "admin") throw new ConvexError("Admins only");

    const teachers = await ctx.db
      .query("users")
      .withIndex("by_organization_and_role", (q) =>
        q.eq("organizationId", orgId).eq("role", "teacher")
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
          q.eq("organizationId", orgId).eq("externalId", sid)
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
      const events = await loadTeacherEvents(ctx, orgId, t.externalId, fromDate, toDate);
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

    const lessonMinutes = settings?.defaultLessonDurationMinutes ?? 60;
    return {
      slotMinutes: lessonMinutes,
      lessonMinutes,
      bufferMinutes: settings?.bufferMinutes ?? 10,
      granularity: settings?.bookingGranularityMinutes ?? 15,
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
  args: { fromDate: v.string(), toDate: v.string() },
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
        q.eq("organizationId", orgId).eq("studentId", user.externalId)
      )
      .collect();
    const events = all.filter(
      (e) =>
        !e.isDeleted &&
        e.type !== "placeholder" &&
        e.date >= fromDate &&
        e.date <= toDate
    );

    if (teacherId) {
      const teacher = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", teacherId)
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

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();

    return {
      teacherId,
      teacherName,
      slotMinutes: settings?.defaultLessonDurationMinutes ?? 60,
      lessonMinutes: settings?.defaultLessonDurationMinutes ?? 60,
      bufferMinutes: settings?.bufferMinutes ?? 10,
      granularity: settings?.bookingGranularityMinutes ?? 15,
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
        googleMeetLink: e.googleMeetLink ?? null,
        createdAt: e.createdAt,
        recurringBookingId: e.recurringBookingId ?? null,
      })),
      recurring: (
        await ctx.db
          .query("recurringBookings")
          .withIndex("by_organization_and_studentId", (q) =>
            q.eq("organizationId", orgId).eq("studentId", user.externalId)
          )
          .collect()
      )
        .filter((r) => r.status === "active")
        .map((r) => ({ _id: r._id, dayOfWeek: r.dayOfWeek, startTime: r.startTime })),
      orgTz: settings?.timezone ?? "UTC",
      policy: {
        actionHorizonDays: POLICY.actionHorizonDays,
        bookingMinNoticeHours: POLICY.bookingMinNoticeHours,
        bookingHorizonDays: POLICY.bookingHorizonDays,
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
      return { conflicts: [], noBalance: [], unpaid: [], unreviewedHomework: [] };
    const isAdmin = user.role === "admin";

    const todayStr = new Date().toISOString().slice(0, 10);
    const horizonStr = new Date(Date.now() + 30 * 86_400_000)
      .toISOString()
      .slice(0, 10);

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
        (isAdmin || e.teacherId === user.externalId)
    );

    const nameOf = async (externalId?: string) => {
      if (!externalId) return null;
      const u = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", externalId)
        )
        .unique();
      return u?.name ?? null;
    };

    // Conflicts — lesson sits in a slot that is no longer open
    const srcCache = new Map<string, SlotSources>();
    const conflicts: {
      _id: Id<"scheduleEvents">;
      date: string;
      startTime: string;
      studentName: string | null;
      teacherName: string | null;
    }[] = [];
    for (const e of upcoming) {
      // One-time lessons are deliberately booked outside published hours —
      // flagging them as "sits in blocked time" would make this inbox noise.
      if (e.adHoc) continue;
      const tid = e.teacherId!;
      if (!srcCache.has(tid)) {
        srcCache.set(tid, await loadSlotSources(ctx, orgId, tid));
      }
      if (isSlotOpen(srcCache.get(tid)!, e.date, e.startTime)) continue;
      conflicts.push({
        _id: e._id,
        date: e.date,
        startTime: e.startTime,
        studentName: await nameOf(e.studentId),
        teacherName: isAdmin ? await nameOf(tid) : null,
      });
    }

    // Weekly schedules that will skip for lack of balance
    const recurring = await ctx.db
      .query("recurringBookings")
      .withIndex("by_organization_and_status", (q) =>
        q.eq("organizationId", orgId).eq("status", "active")
      )
      .collect();
    const mine = recurring.filter(
      (r) => isAdmin || r.teacherId === user.externalId
    );
    const noBalance: {
      _id: Id<"recurringBookings">;
      studentName: string | null;
      dayOfWeek: number;
      startTime: string;
    }[] = [];
    for (const r of mine) {
      const grants = await ctx.db
        .query("pointGrants")
        .withIndex("by_organization_and_studentId", (q) =>
          q.eq("organizationId", orgId).eq("studentId", r.studentId)
        )
        .collect();
      const today = new Date().toISOString().slice(0, 10);
      const balance = grants
        .filter((g) => !g.isExpired && g.expiresAt >= today)
        .reduce((sum, g) => sum + g.remainingPoints, 0);
      if (balance > 0) continue;
      noBalance.push({
        _id: r._id,
        studentName: await nameOf(r.studentId),
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
      });
    }

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
            q.eq("organizationId", orgId).eq("status", "submitted")
          )
          .collect()
      : (
          await ctx.db
            .query("homework")
            .withIndex("by_organization_and_teacherId", (q) =>
              q.eq("organizationId", orgId).eq("teacherId", user.externalId)
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
      (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "")
    );

    return { conflicts, noBalance, unpaid, unreviewedHomework };
  },
});

/** Policy preview for the lesson popover: what happens on cancel/move. */
export const actionPreview = query({
  args: { eventId: v.id("scheduleEvents") },
  handler: async (ctx, { eventId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const event = await ctx.db.get(eventId);
    if (!event || event.organizationId !== orgId) throw new ConvexError("Event not found");

    const actor: Actor =
      user.role === "admin" ? "admin" : user.role === "teacher" ? "teacher" : "student";
    const now = new Date();
    const orgTz = await orgTimezone(ctx, orgId);

    const cancel = cancelVerdict({
      actor,
      event,
      now,
      orgTz,
      studentRecentFreeCancels: await countRecentFreeCancels(ctx, orgId, event.studentId),
      isFirstLessonWithStudent: await isFirstLesson(ctx, orgId, event),
    });
    const reschedule = rescheduleVerdict({ actor, event, now, orgTz });
    return { actor, cancel, reschedule };
  },
});

async function countRecentFreeCancels(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  studentId?: string
): Promise<number> {
  if (!studentId) return 0;
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const rows = await ctx.db
    .query("scheduleEvents")
    .withIndex("by_organization_and_studentId", (q) =>
      q.eq("organizationId", orgId).eq("studentId", studentId)
    )
    .collect();
  return rows.filter(
    (e) =>
      e.cancelledBy === "student" &&
      e.cancellationCharged === false &&
      (e.cancelledAt ?? "") >= since
  ).length;
}

async function isFirstLesson(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  event: { teacherId?: string; studentId?: string; _id: Id<"scheduleEvents"> }
): Promise<boolean> {
  if (!event.teacherId || !event.studentId) return false;
  const rows = await ctx.db
    .query("scheduleEvents")
    .withIndex("by_organization_and_studentId", (q) =>
      q.eq("organizationId", orgId).eq("studentId", event.studentId!)
    )
    .collect();
  return !rows.some(
    (e) =>
      e._id !== event._id &&
      e.teacherId === event.teacherId &&
      (e.status === "completed" || e.status === "scheduled" && e.date < new Date().toISOString().slice(0, 10))
  );
}

// ── Mutations ────────────────────────────────────────────────────

/** Teacher toggles a concrete slot Open/Busy. Blocked if a lesson sits there. */
export const setSlotState = mutation({
  args: {
    date: v.string(),
    startTime: v.string(),
    open: v.boolean(),
  },
  handler: async (ctx, { date, startTime, open }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher" && user.role !== "admin") {
      throw new ConvexError("Only teachers manage their slots");
    }
    const teacherId = user.externalId;

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const slotMinutes = settings?.defaultLessonDurationMinutes ?? 60;
    const endTime = minToTime(timeToMin(startTime) + slotMinutes);

    if (!open) {
      // EnglishDom rule: can't close a slot that contains a lesson
      const events = await loadTeacherEvents(ctx, orgId, teacherId, date, date);
      const hasLesson = events.some(
        (e) =>
          e.startTime === startTime &&
          (e.status === "scheduled" || e.status === "makeup")
      );
      if (hasLesson) {
        throw new ConvexError("This slot has a lesson — move the lesson first");
      }
    }

    const src = await loadSlotSources(ctx, orgId, teacherId);
    const patternOpen = isSlotOpen(
      { vacancies: src.vacancies, exceptions: [] },
      date,
      startTime
    );

    // Remove any existing exception for this slot, then re-add if needed
    const existing = await ctx.db
      .query("slotExceptions")
      .withIndex("by_organization_and_teacherId_and_date", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", teacherId).eq("date", date)
      )
      .collect();
    for (const e of existing) {
      if (e.startTime === startTime) await ctx.db.delete(e._id);
    }
    if (open !== patternOpen) {
      await ctx.db.insert("slotExceptions", {
        organizationId: orgId,
        teacherId,
        date,
        startTime,
        endTime,
        kind: open ? "open" : "closed",
        createdAt: NOW(),
      });
    }
    return { open };
  },
});

/**
 * Teacher toggles a slot for EVERY week (edits the weekly vacancy pattern).
 * Open: adds a 1-slot vacancy window if the pattern doesn't cover it.
 * Close: deletes/splits any vacancy windows covering the slot.
 */
export const setWeeklySlot = mutation({
  args: {
    dayOfWeek: v.number(),
    startTime: v.string(),
    open: v.boolean(),
  },
  handler: async (ctx, { dayOfWeek: dow, startTime, open }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher" && user.role !== "admin") {
      throw new ConvexError("Only teachers manage their slots");
    }
    const teacherId = user.externalId;
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const slotMinutes = settings?.defaultLessonDurationMinutes ?? 60;
    await applyWeeklySlot(ctx, orgId, teacherId, dow, startTime, open, slotMinutes);
    return { open };
  },
});

async function applyWeeklySlot(
  ctx: MutationCtx,
  orgId: string,
  teacherId: string,
  dow: number,
  startTime: string,
  open: boolean,
  slotMinutes: number
) {
  {
    const startMin = timeToMin(startTime);
    const endMin = startMin + slotMinutes;

    const rows = await ctx.db
      .query("teacherVacancies")
      .withIndex("by_organization_and_teacherId_and_dayOfWeek", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", teacherId).eq("dayOfWeek", dow)
      )
      .collect();
    const activeRows = rows.filter((r) => r.isActive);

    if (open) {
      const covered = activeRows.some(
        (r) => timeToMin(r.startTime) <= startMin && timeToMin(r.endTime) >= endMin
      );
      if (!covered) {
        await ctx.db.insert("teacherVacancies", {
          organizationId: orgId,
          teacherId,
          dayOfWeek: dow,
          startTime,
          endTime: minToTime(endMin),
          validFrom: NOW().slice(0, 10),
          isActive: true,
          createdAt: NOW(),
        });
      }
    } else {
      // Remove the [startMin, endMin) span from every overlapping window,
      // splitting windows where needed.
      for (const r of activeRows) {
        const rs = timeToMin(r.startTime);
        const re = timeToMin(r.endTime);
        if (re <= startMin || rs >= endMin) continue; // no overlap
        await ctx.db.delete(r._id);
        if (rs < startMin) {
          await ctx.db.insert("teacherVacancies", {
            organizationId: orgId,
            teacherId,
            dayOfWeek: dow,
            startTime: r.startTime,
            endTime: minToTime(startMin),
            validFrom: r.validFrom,
            validUntil: r.validUntil,
            isActive: true,
            createdAt: NOW(),
          });
        }
        if (re > endMin) {
          await ctx.db.insert("teacherVacancies", {
            organizationId: orgId,
            teacherId,
            dayOfWeek: dow,
            startTime: minToTime(endMin),
            endTime: r.endTime,
            validFrom: r.validFrom,
            validUntil: r.validUntil,
            isActive: true,
            createdAt: NOW(),
          });
        }
      }
    }
    // Clear any per-date exceptions for this weekday+time — the weekly
    // decision supersedes them.
    const excs = await ctx.db
      .query("slotExceptions")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", teacherId)
      )
      .collect();
    for (const e of excs) {
      if (e.startTime === startTime && dayOfWeek(e.date) === dow) {
        await ctx.db.delete(e._id);
      }
    }
  }
}

/**
 * Bulk slot toggle from drag-painting (§13.10). scope "date" writes
 * per-date exceptions; scope "weekly" edits the weekly pattern for each
 * unique (weekday, time) in the selection.
 */
export const setSlotsBulk = mutation({
  args: {
    slots: v.array(v.object({ date: v.string(), startTime: v.string() })),
    open: v.boolean(),
    scope: v.union(v.literal("date"), v.literal("weekly")),
  },
  handler: async (ctx, { slots, open, scope }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher" && user.role !== "admin") {
      throw new ConvexError("Only teachers manage their slots");
    }
    if (slots.length === 0 || slots.length > 200) {
      throw new ConvexError("Select between 1 and 200 slots");
    }
    const teacherId = user.externalId;
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const slotMinutes = settings?.defaultLessonDurationMinutes ?? 60;

    if (scope === "weekly") {
      const seen = new Set<string>();
      for (const slot of slots) {
        const dow = dayOfWeek(slot.date);
        const k = `${dow}|${slot.startTime}`;
        if (seen.has(k)) continue;
        seen.add(k);
        await applyWeeklySlot(ctx, orgId, teacherId, dow, slot.startTime, open, slotMinutes);
      }
      return { applied: seen.size, skippedLessons: 0, scope };
    }

    // per-date exceptions
    const src = await loadSlotSources(ctx, orgId, teacherId);
    let skippedLessons = 0;
    for (const slot of slots) {
      if (!open) {
        const events = await loadTeacherEvents(ctx, orgId, teacherId, slot.date, slot.date);
        const hasLesson = events.some(
          (e) =>
            e.startTime === slot.startTime &&
            (e.status === "scheduled" || e.status === "makeup")
        );
        if (hasLesson) {
          skippedLessons++;
          continue;
        }
      }
      const patternOpen = isSlotOpen(
        { vacancies: src.vacancies, exceptions: [] },
        slot.date,
        slot.startTime
      );
      const dayExcs = await ctx.db
        .query("slotExceptions")
        .withIndex("by_organization_and_teacherId_and_date", (q) =>
          q.eq("organizationId", orgId).eq("teacherId", teacherId).eq("date", slot.date)
        )
        .collect();
      for (const e of dayExcs) {
        if (e.startTime === slot.startTime) await ctx.db.delete(e._id);
      }
      if (open !== patternOpen) {
        await ctx.db.insert("slotExceptions", {
          organizationId: orgId,
          teacherId,
          date: slot.date,
          startTime: slot.startTime,
          endTime: minToTime(timeToMin(slot.startTime) + slotMinutes),
          kind: open ? "open" : "closed",
          createdAt: NOW(),
        });
      }
    }
    return { applied: slots.length - skippedLessons, skippedLessons, scope };
  },
});

/**
 * §14.6 — copy one week's availability forward. Reads the source week's
 * effective open windows (pattern + exceptions) and writes them as per-date
 * open exceptions onto each target week, replacing any open exceptions already
 * there. Weekly time-off (closed) is left untouched. `fromMonday`/`toMondays`
 * are academy-tz "YYYY-MM-DD" Mondays.
 */
export const copyWeekAvailability = mutation({
  args: {
    fromMonday: v.string(),
    toMondays: v.array(v.string()),
    teacherId: v.optional(v.string()), // admin acting for a teacher
  },
  handler: async (ctx, { fromMonday, toMondays, teacherId: forTeacher }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher" && user.role !== "admin") {
      throw new ConvexError("Only teachers manage their availability");
    }
    const teacherId =
      user.role === "admin" ? (forTeacher ?? user.externalId) : user.externalId;

    const addDate = (d: string, days: number) => {
      const dt = new Date(`${d}T12:00:00`);
      dt.setDate(dt.getDate() + days);
      return dt.toISOString().slice(0, 10);
    };

    const src = await loadSlotSources(ctx, orgId, teacherId);
    // Source ranges per weekday offset (0=Mon … 6=Sun).
    const weekRanges = Array.from({ length: 7 }, (_, i) =>
      openRangesForDate(src, addDate(fromMonday, i))
    );

    const existing = await ctx.db
      .query("slotExceptions")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", teacherId)
      )
      .collect();

    let copied = 0;
    for (const toMonday of toMondays) {
      if (toMonday === fromMonday) continue;
      for (let i = 0; i < 7; i++) {
        const dstDate = addDate(toMonday, i);
        // Clear existing OPEN exceptions on the target date (closed/time-off
        // stays — copying availability shouldn't wipe a vacation block).
        for (const ex of existing) {
          if (ex.date === dstDate && ex.kind === "open") {
            await ctx.db.delete(ex._id);
          }
        }
        for (const r of weekRanges[i]) {
          await ctx.db.insert("slotExceptions", {
            organizationId: orgId,
            teacherId,
            date: dstDate,
            startTime: minToTime(r.startMin),
            endTime: minToTime(r.endMin),
            kind: "open",
            createdAt: NOW(),
          });
          copied++;
        }
      }
    }
    return { copied, weeks: toMondays.filter((m) => m !== fromMonday).length };
  },
});

/**
 * Admin assigns a student into a teacher's OPEN slot (§13.1/13.2).
 * Deducts the lesson credit at booking time (fixes Z.A.CAL-1) — throws
 * on insufficient balance, rolling back the event insert.
 */
export const assignLesson = mutation({
  args: {
    teacherId: v.string(),
    studentId: v.string(),
    date: v.string(),
    startTime: v.string(),
    googleMeetLink: v.optional(v.string()),
    // Confirm-through of the soft rest-break warning (POLICY §5).
    overrideBuffer: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "admin") throw new ConvexError("Admins only");
    return await assignLessonCore(
      ctx,
      orgId,
      user.externalId,
      args,
      "admin",
      args.overrideBuffer ?? false
    );
  },
});

/**
 * §13.6 — Teacher blocks a date range (vacation / time off). One
 * full-day "closed" exception per day. Returns lessons still scheduled
 * inside the range — teacher must move or cancel them separately
 * (EnglishDom rule: a slot holding a lesson can't just vanish).
 */
export const blockTimeOff = mutation({
  args: { fromDate: v.string(), toDate: v.string() },
  handler: async (ctx, { fromDate, toDate }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher" && user.role !== "admin") {
      throw new ConvexError("Only teachers block time off");
    }
    const teacherId = user.externalId;
    if (toDate < fromDate) throw new ConvexError("End date before start date");
    const days =
      (new Date(`${toDate}T12:00:00`).getTime() -
        new Date(`${fromDate}T12:00:00`).getTime()) /
        86_400_000 +
      1;
    if (days > 31) throw new ConvexError("Time off is limited to 31 days at once");

    for (
      let d = new Date(`${fromDate}T12:00:00`);
      d <= new Date(`${toDate}T12:00:00`);
      d.setDate(d.getDate() + 1)
    ) {
      const date = d.toISOString().slice(0, 10);
      // Drop existing exceptions for the day — the block supersedes them
      const existing = await ctx.db
        .query("slotExceptions")
        .withIndex("by_organization_and_teacherId_and_date", (q) =>
          q.eq("organizationId", orgId).eq("teacherId", teacherId).eq("date", date)
        )
        .collect();
      for (const e of existing) await ctx.db.delete(e._id);
      await ctx.db.insert("slotExceptions", {
        organizationId: orgId,
        teacherId,
        date,
        startTime: "00:00",
        endTime: "24:00",
        kind: "closed",
        createdAt: NOW(),
      });
    }

    // Lessons still inside the range need attention
    const events = await loadTeacherEvents(ctx, orgId, teacherId, fromDate, toDate);
    const affected = events.filter(
      (e) => e.status === "scheduled" || e.status === "makeup"
    );
    return { blockedDays: days, affectedLessons: affected.length };
  },
});

/** Undo a time-off block: removes full-day closed exceptions in range. */
export const unblockTimeOff = mutation({
  args: { fromDate: v.string(), toDate: v.string() },
  handler: async (ctx, { fromDate, toDate }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher" && user.role !== "admin") {
      throw new ConvexError("Only teachers manage time off");
    }
    const teacherId = user.externalId;
    const excs = await ctx.db
      .query("slotExceptions")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", teacherId)
      )
      .collect();
    let removed = 0;
    for (const e of excs) {
      if (
        e.date >= fromDate &&
        e.date <= toDate &&
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

/**
 * Student self-books into their assigned teacher's OPEN slot (§13.2).
 * Booking window: ≥12h notice, ≤28 days ahead. Deducts 1 lesson credit.
 */
export const bookLesson = mutation({
  args: {
    date: v.string(),
    startTime: v.string(),
    repeatWeekly: v.optional(v.boolean()),
  },
  handler: async (ctx, { date, startTime, repeatWeekly }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") throw new ConvexError("Students only");
    if (!user.teacherId) {
      throw new ConvexError("No teacher assigned yet — ask your academy admin");
    }

    const now = new Date();
    // Stored times are academy wall-clock — parsing them as server-local (UTC)
    // skews the notice window by the academy's offset ([[walltime-utc-pattern]]).
    const orgTz = await orgTimezone(ctx, orgId);
    const startMs = wallTimeToMs(date, startTime, orgTz);
    if (Number.isNaN(startMs)) throw new ConvexError("Invalid booking time");
    const noticeHours = (startMs - now.getTime()) / 3_600_000;
    if (noticeHours < POLICY.bookingMinNoticeHours) {
      throw new ConvexError(
        `Lessons must be booked at least ${POLICY.bookingMinNoticeHours} hours in advance`
      );
    }
    if (noticeHours > POLICY.bookingHorizonDays * 24) {
      throw new ConvexError(
        `Lessons can be booked at most ${POLICY.bookingHorizonDays} days ahead`
      );
    }

    // §13.2 anti-hoarding: cap bookings per day and per week
    const own = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", user.externalId)
      )
      .collect();
    const active = own.filter(
      (e) => !e.isDeleted && (e.status === "scheduled" || e.status === "makeup")
    );
    const sameDay = active.filter((e) => e.date === date).length;
    if (sameDay >= POLICY.maxStudentBookingsPerDay) {
      throw new ConvexError(
        `You already have a lesson on ${date} — one lesson per day`
      );
    }
    const weekStart = new Date(`${date}T12:00:00`);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    const sameWeek = active.filter(
      (e) => e.date >= weekStartStr && e.date <= weekEndStr
    ).length;
    if (sameWeek >= POLICY.maxStudentBookingsPerWeek) {
      throw new ConvexError(
        `Maximum ${POLICY.maxStudentBookingsPerWeek} lessons per week reached`
      );
    }

    const eventId = await assignLessonCore(
      ctx,
      orgId,
      user.externalId,
      {
        teacherId: user.teacherId,
        studentId: user.externalId,
        date,
        startTime,
      },
      "student"
    );

    // §13.2 — weekly recurring schedule: remember the slot; the daily
    // cron books the following weeks automatically while balance lasts.
    if (repeatWeekly) {
      const dow = dayOfWeek(date);
      const dup = await ctx.db
        .query("recurringBookings")
        .withIndex("by_organization_and_studentId", (q) =>
          q.eq("organizationId", orgId).eq("studentId", user.externalId)
        )
        .collect();
      if (
        !dup.some(
          (r) =>
            r.status === "active" &&
            r.dayOfWeek === dow &&
            r.startTime === startTime &&
            r.teacherId === user.teacherId
        )
      ) {
        const rbId = await ctx.db.insert("recurringBookings", {
          organizationId: orgId,
          teacherId: user.teacherId,
          studentId: user.externalId,
          dayOfWeek: dow,
          startTime,
          status: "active",
          createdBy: user.externalId,
          createdAt: NOW(),
        });
        await ctx.db.patch(eventId, {
          recurringBookingId: rbId,
          recurringWeekKey: mondayKey(date),
        });
      }
    }
    return eventId;
  },
});

/** End a weekly recurring schedule. Future already-booked lessons stay —
 *  cancel them individually if needed. */
export const endRecurring = mutation({
  args: { recurringId: v.id("recurringBookings") },
  handler: async (ctx, { recurringId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const rb = await ctx.db.get(recurringId);
    if (!rb || rb.organizationId !== orgId) throw new ConvexError("Not found");
    const allowed =
      user.role === "admin" ||
      rb.studentId === user.externalId ||
      rb.teacherId === user.externalId;
    if (!allowed) throw new ConvexError("Not yours");
    await ctx.db.patch(recurringId, { status: "ended", endedAt: NOW() });
    return null;
  },
});

/**
 * §13.2 — Daily cron: materialize upcoming lessons from active weekly
 * recurring bookings, ~7 days ahead. Each materialized lesson deducts
 * 1 lesson credit; insufficient balance → occurrence skipped + student
 * and admins notified. Slot closed/taken that week → skipped silently.
 */
export const materializeRecurring = internalMutation({
  args: { horizonDays: v.optional(v.number()) },
  handler: async (ctx, { horizonDays }) => {
    const horizon = horizonDays ?? POLICY.recurringMaterializeDays;
    const all = await ctx.db.query("recurringBookings").collect();
    const active = all.filter((r) => r.status === "active");
    const now = new Date();
    let created = 0;

    for (const rb of active) {
      const settings = await ctx.db
        .query("tenantSettings")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", rb.organizationId)
        )
        .unique();
      const slotMinutes = settings?.defaultLessonDurationMinutes ?? 60;
      const types = settings?.activityTypes ?? DEFAULT_ACTIVITY_TYPES;
      const activity =
        types.find((a) => a.isActive && !a.isGroup) ??
        types.find((a) => !a.isGroup);
      if (!activity) continue;

      const teacherRow = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", rb.organizationId).eq("externalId", rb.teacherId)
        )
        .unique();

      // POLICY §6 — a paused student keeps their slot but gets no lessons
      // materialized inside the pause window. The booking stays "active", so
      // the slot is held rather than released.
      const studentRow = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", rb.organizationId).eq("externalId", rb.studentId)
        )
        .unique();

      const src = await loadSlotSources(ctx, rb.organizationId, rb.teacherId);

      // C-2: an occurrence counts as "handled" for its whole ISO week —
      // even if the student moved it to another day/time or cancelled it.
      // Collect the Monday-key of every week this booking already touches.
      const ownEvents = await ctx.db
        .query("scheduleEvents")
        .withIndex("by_organization_and_studentId", (q) =>
          q.eq("organizationId", rb.organizationId).eq("studentId", rb.studentId)
        )
        .collect();
      const coveredWeeks = new Set(
        ownEvents
          .filter((e) => !e.isDeleted && e.recurringBookingId === rb._id)
          // origin week (recurringWeekKey) survives a reschedule; fall back
          // to the event's own date for rows created before this field.
          .map((e) => e.recurringWeekKey ?? mondayKey(e.date))
      );

      for (let offset = 0; offset <= horizon; offset++) {
        const d = new Date(now.getTime() + offset * 86_400_000);
        const date = d.toISOString().slice(0, 10);
        if (dayOfWeek(date) !== rb.dayOfWeek) continue;
        const start = new Date(`${date}T${rb.startTime}:00`);
        if (start.getTime() <= now.getTime()) continue;

        // This week already has an occurrence (booked, moved, or cancelled)?
        if (coveredWeeks.has(mondayKey(date))) continue;

        // Inside a pause window → skip this date, keep the slot (POLICY §6).
        if (
          studentRow?.pausedUntil &&
          date <= studentRow.pausedUntil &&
          (!studentRow.pausedFrom || date >= studentRow.pausedFrom)
        ) {
          continue;
        }

        // C-6 — respect the same-day cap: a student with a lesson already
        // booked that day (from another weekly slot or a one-off) is skipped
        // rather than double-booked.
        const sameDay = ownEvents.filter(
          (e) =>
            !e.isDeleted &&
            e.date === date &&
            (e.status === "scheduled" || e.status === "makeup")
        ).length;
        if (sameDay >= POLICY.maxStudentBookingsPerDay) continue;

        const dayEvents = await loadTeacherEvents(
          ctx,
          rb.organizationId,
          rb.teacherId,
          date,
          date
        );
        // Slot closed (time off / pattern change), no longer inside open hours,
        // or too close to another lesson (overlap OR rest-break) → skip.
        const rbStartMin = timeToMin(rb.startTime);
        const rbEndMin = rbStartMin + slotMinutes;
        const bufferMinutes = settings?.bufferMinutes ?? 10;
        if (!isRangeOpen(src, date, rbStartMin, rbEndMin)) continue;
        if (bufferConflict(dayEvents, date, rbStartMin, rbEndMin, bufferMinutes))
          continue;

        // Book it — deduct 1 lesson; insufficient balance → notify + skip
        const eventId = await ctx.db.insert("scheduleEvents", {
          organizationId: rb.organizationId,
          externalId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: "1on1",
          teacherId: rb.teacherId,
          studentId: rb.studentId,
          title: activity.name,
          date,
          startTime: rb.startTime,
          endTime: minToTime(timeToMin(rb.startTime) + slotMinutes),
          status: "scheduled",
          activityTypeId: activity.id,
          pointCostSnapshot: activity.pointCost,
          recurringBookingId: rb._id,
          recurringWeekKey: mondayKey(date),
          googleMeetLink: teacherRow?.meetLink,
          createdAt: NOW(),
        });
        try {
          await spendPointsInternal(ctx, {
            orgId: rb.organizationId,
            studentId: rb.studentId,
            amount: activity.pointCost,
            scheduleEventId: eventId,
            reason: `Weekly schedule: ${activity.name} ${date} ${rb.startTime}`,
            performedBy: "system-recurring",
          });
          created++;
          coveredWeeks.add(mondayKey(date));
          ownEvents.push({
            ...(await ctx.db.get(eventId))!,
          });
          await ctx.runMutation(internal.notifications._notify, {
            organizationId: rb.organizationId,
            recipientId: rb.studentId,
            kind: "lesson_assigned",
            payload: { date, startTime: rb.startTime, by: "weekly-schedule" },
          });
        } catch {
          // Insufficient balance — undo the insert, warn student
          await ctx.db.delete(eventId);
          await ctx.runMutation(internal.notifications._notify, {
            organizationId: rb.organizationId,
            recipientId: rb.studentId,
            kind: "booking_reminder",
            payload: {
              date,
              startTime: rb.startTime,
              reason: "no_balance",
            },
          });
        }
      }
    }
    return { created };
  },
});

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
      user.role === "student" ? user.externalId : (args.studentId ?? user.externalId);
    if (user.role === "teacher") throw new ConvexError("Teachers cannot pause students");

    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", targetId)
      )
      .unique();
    if (!student || student.role !== "student") throw new ConvexError("Student not found");

    if (args.untilDate < args.fromDate) throw new ConvexError("End date is before the start date");
    const days =
      Math.round(
        (Date.parse(`${args.untilDate}T00:00:00Z`) -
          Date.parse(`${args.fromDate}T00:00:00Z`)) /
          86_400_000
      ) + 1;
    if (Number.isNaN(days)) throw new ConvexError("Invalid dates");
    // Admins may override the cap; students are held to policy.
    if (user.role !== "admin" && days > PAUSE_MAX_DAYS) {
      throw new ConvexError(`A pause can last at most ${PAUSE_MAX_DAYS} days`);
    }

    // Rolling 6-month quota, counted from the ledger of past pauses.
    if (user.role !== "admin") {
      const since = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
      const past = await ctx.db
        .query("studentPauses")
        .withIndex("by_organization_and_studentId", (q) =>
          q.eq("organizationId", orgId).eq("studentId", targetId)
        )
        .collect();
      const recent = past.filter((p) => p.fromDate >= since).length;
      if (recent >= PAUSE_MAX_PER_180_DAYS) {
        throw new ConvexError(
          `Only ${PAUSE_MAX_PER_180_DAYS} pauses are allowed every 6 months — talk to your academy`
        );
      }
    }

    // Freeze the expiry clock: push every activated grant's expiry out by the
    // length of the pause. Un-activated grants have no clock to freeze yet.
    const pausedDays = days;
    const grants = await ctx.db
      .query("pointGrants")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", targetId)
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
      user.role === "student" ? user.externalId : (args.studentId ?? user.externalId);
    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", targetId)
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
    const today = new Date().toISOString().slice(0, 10);
    const paused = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("studentStatus"), "paused"))
      .collect();
    let resumed = 0;
    for (const s of paused) {
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
      });
      resumed++;
    }
    return { resumed };
  },
});

/** Dev/CI helper — set an event's status directly (no policy). */
export const _devSetEventStatus = internalMutation({
  args: { eventId: v.id("scheduleEvents"), status: v.string() },
  handler: async (ctx, { eventId, status }) => {
    await ctx.db.patch(eventId, { status: status as any });
    return null;
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
  overrideBuffer = false
) {
  {
    if (new Date(`${date}T${startTime}:00`) <= new Date()) {
      throw new ConvexError("Slot is in the past");
    }

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const lessonMinutes = settings?.defaultLessonDurationMinutes ?? 60;
    const bufferMinutes = settings?.bufferMinutes ?? 10;
    const granularity = settings?.bookingGranularityMinutes ?? 15;
    const startMin = timeToMin(startTime);
    const endMin = startMin + lessonMinutes;

    const src = await loadSlotSources(ctx, orgId, teacherId);
    const dayEvents = await loadTeacherEvents(ctx, orgId, teacherId, date, date);
    const hit = bufferConflict(dayEvents, date, startMin, endMin, bufferMinutes);

    if (by === "student") {
      // Range model (POLICY §5): student picks any start on the booking grid,
      // fully inside open hours, with a mandatory break each side — all hard.
      if (startMin % granularity !== 0) {
        throw new ConvexError(`Start time must be on a ${granularity}-minute mark`);
      }
      if (!isRangeOpen(src, date, startMin, endMin)) {
        throw new ConvexError("That time isn't inside the teacher's open hours");
      }
      if (hit) {
        throw new ConvexError(
          hit.kind === "overlap"
            ? "That time overlaps another lesson"
            : `Too close to the ${hit.startTime} lesson — a ${bufferMinutes}-minute break is required between lessons`
        );
      }
    } else {
      // Admin/teacher one-time lesson: any minute, may sit outside published
      // hours. Overlap is always a hard block; the rest-break is a soft warn
      // the caller can override (POLICY §5 — admin assigns anywhere).
      if (hit?.kind === "overlap") {
        throw new ConvexError(
          `That time overlaps the ${hit.startTime}–${hit.endTime} lesson`
        );
      }
      if (hit?.kind === "buffer" && !overrideBuffer) {
        // Sentinel the UI parses to show a confirm-and-retry dialog.
        throw new ConvexError(
          `BUFFER:${hit.startTime}:${bufferMinutes}:Within ${bufferMinutes} min of the ${hit.startTime}–${hit.endTime} lesson`
        );
      }
    }

    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", studentId)
      )
      .unique();
    if (!student || student.role !== "student") throw new ConvexError("Student not found");

    // C-8 — no explicit link? use the teacher's permanent meeting room.
    let meetLink = googleMeetLink;
    if (!meetLink) {
      const teacher = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", teacherId)
        )
        .unique();
      meetLink = teacher?.meetLink;
    }

    const types = settings?.activityTypes ?? DEFAULT_ACTIVITY_TYPES;
    const activity =
      types.find((a) => a.isActive && !a.isGroup) ??
      types.find((a) => !a.isGroup);
    if (!activity) throw new ConvexError("No 1-on-1 activity type configured");

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
      });
    }
    return eventId;
  }
}

/** Active lessons overlap when their [start, end) intervals intersect. */
function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return timeToMin(aStart) < timeToMin(bEnd) && timeToMin(bStart) < timeToMin(aEnd);
}

const ACTIVE_STATUSES = ["scheduled", "makeup"];

/**
 * One-time lesson — a real dated lesson at ANY time, deliberately not
 * restricted to the availability lattice. Two entry points share it:
 * the teacher/admin "One-time lesson" button, and a session started from
 * Live with no scheduled event behind it.
 *
 * Start times are free-form (16:15, 10:30) — the grid renders 15-minute
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
    date: v.string(),
    startTime: v.string(),
    durationMinutes: v.optional(v.number()),
    teacherId: v.optional(v.string()), // admin acting for a teacher
    googleMeetLink: v.optional(v.string()),
    // Confirm-through of the soft rest-break warning (POLICY §5).
    overrideBuffer: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role === "student") throw new ConvexError("Only teachers and admins can do this");

    const teacherId =
      user.role === "admin" ? (args.teacherId ?? user.externalId) : user.externalId;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new ConvexError("Invalid date");
    if (!/^\d{2}:\d{2}$/.test(args.startTime)) throw new ConvexError("Invalid start time");

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const duration = args.durationMinutes ?? settings?.defaultLessonDurationMinutes ?? 60;
    if (duration <= 0 || duration > 24 * 60) throw new ConvexError("Invalid duration");

    const startMin = timeToMin(args.startTime);
    if (startMin + duration > 24 * 60) {
      throw new ConvexError("A lesson can't run past midnight — split it across two days");
    }
    const endTime = minToTime(startMin + duration);

    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", args.studentId)
      )
      .unique();
    if (!student || student.role !== "student") throw new ConvexError("Student not found");

    // Neither party can be double-booked. Teacher side: overlap is a hard
    // block; the rest-break (POLICY §5) is a soft warn the caller can override.
    const bufferMinutes = settings?.bufferMinutes ?? 10;
    const teacherDay = await loadTeacherEvents(ctx, orgId, teacherId, args.date, args.date);
    const hit = bufferConflict(teacherDay, args.date, startMin, startMin + duration, bufferMinutes);
    if (hit?.kind === "overlap") {
      throw new ConvexError(`That overlaps the ${hit.startTime}–${hit.endTime} lesson`);
    }
    if (hit?.kind === "buffer" && !args.overrideBuffer) {
      throw new ConvexError(
        `BUFFER:${hit.startTime}:${bufferMinutes}:Within ${bufferMinutes} min of the ${hit.startTime}–${hit.endTime} lesson`
      );
    }
    // …and the student side, who may sit with another teacher.
    const studentDay = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", args.studentId)
      )
      .collect();
    for (const e of studentDay) {
      if (e.isDeleted || e.date !== args.date) continue;
      if (!ACTIVE_STATUSES.includes(e.status)) continue;
      if (overlaps(args.startTime, endTime, e.startTime, e.endTime)) {
        throw new ConvexError(`The student already has a lesson at ${e.startTime}`);
      }
    }

    const types = settings?.activityTypes ?? DEFAULT_ACTIVITY_TYPES;
    const activity =
      types.find((a) => a.isActive && !a.isGroup) ?? types.find((a) => !a.isGroup);
    if (!activity) throw new ConvexError("No 1-on-1 activity type configured");

    let meetLink = args.googleMeetLink;
    if (!meetLink) {
      const teacher = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", teacherId)
        )
        .unique();
      meetLink = teacher?.meetLink;
    }

    // Can the student pay for it? Checked before insert so we can stamp the flag.
    const today = new Date().toISOString().slice(0, 10);
    const grants = await ctx.db
      .query("pointGrants")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", args.studentId)
      )
      .collect();
    let balance = 0;
    for (const g of grants) {
      if (g.isExpired || g.expiresAt < today || g.remainingPoints <= 0) continue;
      balance += g.remainingPoints;
    }
    const canPay = balance >= activity.pointCost;

    const eventId = await ctx.db.insert("scheduleEvents", {
      organizationId: orgId,
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
          q.eq("organizationId", orgId).eq("role", "admin")
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
        });
      }
    }

    await ctx.runMutation(internal.notifications._notify, {
      organizationId: orgId,
      recipientId: args.studentId,
      kind: "lesson_assigned",
      payload: { date: args.date, startTime: args.startTime, by: user.role },
    });

    return { eventId, unpaid: !canPay };
  },
});

/** Policy-aware cancellation (§13.3). */
export const cancelEvent = mutation({
  args: { eventId: v.id("scheduleEvents") },
  handler: async (ctx, { eventId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const event = await ctx.db.get(eventId);
    if (!event || event.organizationId !== orgId) throw new ConvexError("Event not found");

    const actor: Actor =
      user.role === "admin" ? "admin" : user.role === "teacher" ? "teacher" : "student";
    if (actor === "teacher" && event.teacherId !== user.externalId)
      throw new ConvexError("Not your lesson");
    if (actor === "student" && event.studentId !== user.externalId)
      throw new ConvexError("Not your lesson");

    const now = new Date();
    const verdict = cancelVerdict({
      actor,
      event,
      now,
      orgTz: await orgTimezone(ctx, orgId),
      studentRecentFreeCancels: await countRecentFreeCancels(ctx, orgId, event.studentId),
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
    if (verdict.refund && event.studentId && (event.pointCostSnapshot ?? 0) > 0) {
      const txs = await ctx.db
        .query("pointTransactions")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .collect();
      const spend = txs.find(
        (t) => t.scheduleEventId === eventId && t.type === "spend"
      );
      const refunded = txs.some(
        (t) => t.scheduleEventId === eventId && t.type === "refund"
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
      });
    }
    return { charged: !verdict.refund, trackedLate: verdict.trackedLate };
  },
});

/** Policy-aware reschedule (§13.4): move lesson to an OPEN slot within 7 days. */
export const rescheduleEvent = mutation({
  args: {
    eventId: v.id("scheduleEvents"),
    toDate: v.string(),
    toStartTime: v.string(),
  },
  handler: async (ctx, { eventId, toDate, toStartTime }) => {
    const { orgId, user } = await requireTenant(ctx);
    const event = await ctx.db.get(eventId);
    if (!event || event.organizationId !== orgId) throw new ConvexError("Event not found");
    if (!event.teacherId) throw new ConvexError("Event has no teacher");

    const actor: Actor =
      user.role === "admin" ? "admin" : user.role === "teacher" ? "teacher" : "student";
    if (actor === "teacher" && event.teacherId !== user.externalId)
      throw new ConvexError("Not your lesson");
    if (actor === "student" && event.studentId !== user.externalId)
      throw new ConvexError("Not your lesson");

    const now = new Date();
    const orgTz = await orgTimezone(ctx, orgId);
    const verdict = rescheduleVerdict({ actor, event, now, orgTz });
    if (!verdict.allowed) throw new ConvexError(verdict.reason);

    // Target must be inside the horizon and in the future (admin exempt)
    const target = { ...event, date: toDate, startTime: toStartTime };
    if (actor !== "admin" && !withinActionHorizon(target, now, orgTz)) {
      throw new ConvexError(
        `New time must be within the next ${POLICY.actionHorizonDays} days`
      );
    }
    const targetMs = wallTimeToMs(toDate, toStartTime, orgTz);
    if (Number.isNaN(targetMs) || targetMs <= now.getTime()) {
      throw new ConvexError("New time must be in the future");
    }

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const slotMinutes = settings?.defaultLessonDurationMinutes ?? 60;
    const bufferMinutes = settings?.bufferMinutes ?? 10;
    const toStartMin = timeToMin(toStartTime);
    const toEndMin = toStartMin + slotMinutes;

    // Target must sit inside open hours (admin exempt) and clear of other
    // lessons + the rest-break on both sides. Range model (POLICY §5).
    const src = await loadSlotSources(ctx, orgId, event.teacherId);
    if (actor !== "admin" && !isRangeOpen(src, toDate, toStartMin, toEndMin)) {
      throw new ConvexError("That time isn't inside the teacher's open hours");
    }
    const dayEvents = await loadTeacherEvents(ctx, orgId, event.teacherId, toDate, toDate);
    const hit = bufferConflict(
      dayEvents,
      toDate,
      toStartMin,
      toEndMin,
      bufferMinutes,
      eventId
    );
    if (hit) {
      throw new ConvexError(
        hit.kind === "overlap"
          ? "That time overlaps another lesson"
          : `Too close to the ${hit.startTime} lesson — a ${bufferMinutes}-minute break is required between lessons`
      );
    }

    // POLICY §4 late-move rule. A student moving inside the 6h cancel window
    // pays for it: the credit already spent on this lesson is burned (the
    // teacher held the hour and gets paid for it) and the new time consumes
    // a fresh credit. Spending first means an empty balance throws and rolls
    // back the whole move, so a student can never dodge the charge.
    if (verdict.chargesLesson && event.studentId) {
      await spendPointsInternal(ctx, {
        orgId,
        studentId: event.studentId,
        amount: event.pointCostSnapshot ?? 1,
        scheduleEventId: eventId,
        reason: `Late move (<${POLICY.studentCancelNoticeHours}h) of ${event.date} ${event.startTime}`,
        performedBy: user.externalId,
      });
    }

    await ctx.db.patch(eventId, {
      date: toDate,
      startTime: toStartTime,
      endTime: minToTime(timeToMin(toStartTime) + slotMinutes),
      rescheduledBy: actor,
      lateMoveCharged: verdict.chargesLesson ? true : undefined,
    });

    const recipients = [
      actor !== "student" ? event.studentId : null,
      actor !== "teacher" ? event.teacherId : null,
    ].filter(Boolean) as string[];
    for (const r of recipients) {
      await ctx.runMutation(internal.notifications._notify, {
        organizationId: orgId,
        recipientId: r,
        kind: "lesson_rescheduled",
        payload: {
          fromDate: event.date,
          fromTime: event.startTime,
          toDate,
          toTime: toStartTime,
          by: actor,
        },
      });
    }
    return { trackedLate: verdict.trackedLate, charged: verdict.chargesLesson };
  },
});
