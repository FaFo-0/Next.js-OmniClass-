// §13.10 — Unified calendar backend.
// One grid: Open slots (weekly vacancy pattern ± per-date exceptions),
// Busy (everything else), Lessons (scheduleEvents). Policy-aware
// cancel/reschedule with consequence previews.

import { v } from "convex/values";
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

const NOW = () => new Date().toISOString();

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

interface SlotSources {
  vacancies: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    validFrom: string;
    validUntil?: string;
    isActive: boolean;
  }[];
  exceptions: { date: string; startTime: string; kind: "open" | "closed" }[];
}

/** Is the slot starting at date+startTime open per pattern+exceptions? */
function isSlotOpen(src: SlotSources, date: string, startTime: string): boolean {
  const exc = src.exceptions.find(
    (e) => e.date === date && e.startTime === startTime
  );
  if (exc) return exc.kind === "open";
  const dow = dayOfWeek(date);
  const min = timeToMin(startTime);
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

    // Resolve student names server-side
    const studentIds = [...new Set(events.map((e) => e.studentId).filter(Boolean))] as string[];
    const names: Record<string, string> = {};
    for (const sid of studentIds) {
      const s = await ctx.db
        .query("users")
        .withIndex("by_organization_and_externalId", (q) =>
          q.eq("organizationId", orgId).eq("externalId", sid)
        )
        .unique();
      if (s) names[sid] = s.name;
    }

    // Concrete open slots per date (skip slots holding an active lesson —
    // the UI shows the lesson instead)
    const openSlots: { date: string; startTime: string; endTime: string }[] = [];
    const active = events.filter(
      (e) => e.status === "scheduled" || e.status === "makeup"
    );
    for (
      let d = new Date(`${fromDate}T12:00:00`);
      d <= new Date(`${toDate}T12:00:00`);
      d.setDate(d.getDate() + 1)
    ) {
      const date = d.toISOString().slice(0, 10);
      for (let m = 0; m < 24 * 60; m += slotMinutes) {
        const startTime = minToTime(m);
        if (!isSlotOpen(src, date, startTime)) continue;
        const taken = active.some((e) => e.date === date && e.startTime === startTime);
        if (!taken) openSlots.push({ date, startTime, endTime: minToTime(m + slotMinutes) });
      }
    }

    return {
      slotMinutes,
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
      })),
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
    if (user.role !== "admin") throw new Error("Admins only");
    return await buildCalendar(ctx, orgId, teacherId, fromDate, toDate);
  },
});

/** Policy preview for the lesson popover: what happens on cancel/move. */
export const actionPreview = query({
  args: { eventId: v.id("scheduleEvents") },
  handler: async (ctx, { eventId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const event = await ctx.db.get(eventId);
    if (!event || event.organizationId !== orgId) throw new Error("Event not found");

    const actor: Actor =
      user.role === "admin" ? "admin" : user.role === "teacher" ? "teacher" : "student";
    const now = new Date();

    const cancel = cancelVerdict({
      actor,
      event,
      now,
      studentRecentFreeCancels: await countRecentFreeCancels(ctx, orgId, event.studentId),
      isFirstLessonWithStudent: await isFirstLesson(ctx, orgId, event),
    });
    const reschedule = rescheduleVerdict({ actor, event, now });
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
      throw new Error("Only teachers manage their slots");
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
        throw new Error("This slot has a lesson — move the lesson first");
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
      throw new Error("Only teachers manage their slots");
    }
    const teacherId = user.externalId;

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const slotMinutes = settings?.defaultLessonDurationMinutes ?? 60;
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
    return { open };
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
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "admin") throw new Error("Admins only");
    return await assignLessonCore(ctx, orgId, user.externalId, args);
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
  }
) {
  {
    if (new Date(`${date}T${startTime}:00`) <= new Date()) {
      throw new Error("Slot is in the past");
    }

    // Slot must be open per the teacher's pattern+exceptions
    const src = await loadSlotSources(ctx, orgId, teacherId);
    if (!isSlotOpen(src, date, startTime)) {
      throw new Error("That slot is not open on the teacher's calendar");
    }
    // …and lesson-free
    const dayEvents = await loadTeacherEvents(ctx, orgId, teacherId, date, date);
    if (
      dayEvents.some(
        (e) =>
          e.startTime === startTime &&
          (e.status === "scheduled" || e.status === "makeup")
      )
    ) {
      throw new Error("That slot already has a lesson");
    }

    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", studentId)
      )
      .unique();
    if (!student || student.role !== "student") throw new Error("Student not found");

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const slotMinutes = settings?.defaultLessonDurationMinutes ?? 60;
    const types = settings?.activityTypes ?? DEFAULT_ACTIVITY_TYPES;
    const activity =
      types.find((a) => a.isActive && !a.isGroup) ??
      types.find((a) => !a.isGroup);
    if (!activity) throw new Error("No 1-on-1 activity type configured");

    const eventId = await ctx.db.insert("scheduleEvents", {
      organizationId: orgId,
      externalId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "1on1",
      teacherId,
      studentId,
      title: activity.name,
      date,
      startTime,
      endTime: minToTime(timeToMin(startTime) + slotMinutes),
      status: "scheduled",
      activityTypeId: activity.id,
      pointCostSnapshot: activity.pointCost,
      googleMeetLink,
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

    for (const r of [teacherId, studentId]) {
      await ctx.runMutation(internal.notifications._notify, {
        organizationId: orgId,
        recipientId: r,
        kind: "lesson_assigned",
        payload: { date, startTime, by: "admin" },
      });
    }
    return eventId;
  }
}

/** Policy-aware cancellation (§13.3). */
export const cancelEvent = mutation({
  args: { eventId: v.id("scheduleEvents") },
  handler: async (ctx, { eventId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const event = await ctx.db.get(eventId);
    if (!event || event.organizationId !== orgId) throw new Error("Event not found");

    const actor: Actor =
      user.role === "admin" ? "admin" : user.role === "teacher" ? "teacher" : "student";
    if (actor === "teacher" && event.teacherId !== user.externalId)
      throw new Error("Not your lesson");
    if (actor === "student" && event.studentId !== user.externalId)
      throw new Error("Not your lesson");

    const now = new Date();
    const verdict = cancelVerdict({
      actor,
      event,
      now,
      studentRecentFreeCancels: await countRecentFreeCancels(ctx, orgId, event.studentId),
      isFirstLessonWithStudent: await isFirstLesson(ctx, orgId, event),
    });
    if (!verdict.allowed) throw new Error(verdict.reason);

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
    if (!event || event.organizationId !== orgId) throw new Error("Event not found");
    if (!event.teacherId) throw new Error("Event has no teacher");

    const actor: Actor =
      user.role === "admin" ? "admin" : user.role === "teacher" ? "teacher" : "student";
    if (actor === "teacher" && event.teacherId !== user.externalId)
      throw new Error("Not your lesson");
    if (actor === "student" && event.studentId !== user.externalId)
      throw new Error("Not your lesson");

    const now = new Date();
    const verdict = rescheduleVerdict({ actor, event, now });
    if (!verdict.allowed) throw new Error(verdict.reason);

    // Target must be inside the horizon and in the future (admin exempt)
    const target = { ...event, date: toDate, startTime: toStartTime };
    if (actor !== "admin" && !withinActionHorizon(target, now)) {
      throw new Error(
        `New time must be within the next ${POLICY.actionHorizonDays} days`
      );
    }
    if (new Date(`${toDate}T${toStartTime}:00`) <= now) {
      throw new Error("New time must be in the future");
    }

    // Target slot must be open (per pattern+exceptions) and lesson-free
    const src = await loadSlotSources(ctx, orgId, event.teacherId);
    if (actor !== "admin" && !isSlotOpen(src, toDate, toStartTime)) {
      throw new Error("That slot is not open");
    }
    const dayEvents = await loadTeacherEvents(ctx, orgId, event.teacherId, toDate, toDate);
    if (
      dayEvents.some(
        (e) =>
          e._id !== eventId &&
          e.startTime === toStartTime &&
          (e.status === "scheduled" || e.status === "makeup")
      )
    ) {
      throw new Error("That slot was just taken");
    }

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const slotMinutes = settings?.defaultLessonDurationMinutes ?? 60;

    await ctx.db.patch(eventId, {
      date: toDate,
      startTime: toStartTime,
      endTime: minToTime(timeToMin(toStartTime) + slotMinutes),
      rescheduledBy: actor,
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
    return { trackedLate: verdict.trackedLate };
  },
});
