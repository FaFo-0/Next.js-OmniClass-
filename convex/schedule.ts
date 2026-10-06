import { rescheduleEventCore } from "./calendar";
import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireTenant, requireTenantPermission, tenantTable } from "./lib/tenant";
import { internal } from "./_generated/api";
import { userHasPermission } from "./lib/permissions";
import { assertGenericEventStatus } from "./lib/teacherNoShowPolicy";
import { transitionNoShowForEvent } from "./lib/teacherNoShow";
import type { Doc } from "./_generated/dataModel";

const NOW = () => new Date().toISOString();

// ─────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────

export const listForTeacher = query({
  args: { teacherId: v.optional(v.string()) },
  handler: async (ctx, { teacherId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const tid = teacherId ?? user.externalId;
    if (user.role === "teacher" && tid !== user.externalId) {
      throw new Error("Access denied: cannot list another teacher's schedule");
    }
    const events = (await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", tid)
      )
      .order("desc")
      .take(200)).filter((e) => !e.isDeleted);
    return await Promise.all(events.map(async (event) => {
      const student = event.studentId
        ? await ctx.db
            .query("users")
            .withIndex("by_organization_and_externalId", (q) =>
              q.eq("organizationId", orgId).eq("externalId", event.studentId!)
            )
            .unique()
        : null;
      return { ...event, studentName: student?.name ?? null };
    }));
  },
});

export const listForStudent = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const sid = studentId ?? user.externalId;
    if (user.role === "student" && sid !== user.externalId) {
      throw new Error("Access denied: cannot list another student's schedule");
    }
    return (await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", sid)
      )
      .order("desc")
      .take(200)).filter((e) => !e.isDeleted);
  },
});

export const listForOrg = query({
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "schedule.manage");
    return await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .order("desc")
      .take(500);
  },
});

export const get = query({
  args: { eventId: v.id("scheduleEvents") },
  handler: async (ctx, { eventId }) => {
    const { orgId } = await requireTenant(ctx);
    const t = tenantTable(ctx, orgId, "scheduleEvents");
    return await t.get(eventId);
  },
});

export const listPendingUnaccounted = query({
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "schedule.manage");
    const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const all = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_status", (q) =>
        q.eq("organizationId", orgId).eq("status", "scheduled")
      )
      .collect();
    return all.filter((e) => {
      const dt = `${e.date}T${e.startTime}`;
      return dt < cutoff;
    });
  },
});

// ─────────────────────────────────────────────────────────────────────
// Reschedule requests — queries
// ─────────────────────────────────────────────────────────────────────

export const listPendingReschedules = query({
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "schedule.manage");
    return await ctx.db
      .query("rescheduleRequests")
      .withIndex("by_organization_and_status", (q) =>
        q.eq("organizationId", orgId).eq("status", "pending")
      )
      .order("desc")
      .take(100);
  },
});

export const listRescheduleRequestsForEvent = query({
  args: { eventId: v.id("scheduleEvents") },
  handler: async (ctx, { eventId }) => {
    const { orgId } = await requireTenant(ctx);
    return await ctx.db
      .query("rescheduleRequests")
      .withIndex("by_organization_and_eventId", (q) =>
        q.eq("organizationId", orgId).eq("eventId", eventId)
      )
      .collect();
  },
});

// ─────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────

export const setMeetLink = mutation({
  args: {
    eventId: v.id("scheduleEvents"),
    meetLink: v.string(),
  },
  handler: async (ctx, { eventId, meetLink }) => {
    const { orgId, user } = await requireTenant(ctx);
    const evt = await ctx.db.get(eventId);
    if (!evt || evt.organizationId !== orgId) {
      throw new Error("Event not found");
    }
    if (
      evt.teacherId !== user.externalId &&
      user.role !== "admin"
    ) {
      throw new Error("Only the lesson teacher / admin can set Meet link");
    }
    await ctx.db.patch(eventId, { googleMeetLink: meetLink });
  },
});

export const markTeacherStarted = mutation({
  args: { eventId: v.id("scheduleEvents") },
  handler: async (ctx, { eventId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const evt = await ctx.db.get(eventId);
    if (!evt || evt.organizationId !== orgId) {
      throw new Error("Event not found");
    }
    if (evt.teacherId !== user.externalId && user.role !== "admin") {
      throw new Error("Only the booked teacher can mark started");
    }
    if (evt.teacherStartedAt) return;
    await ctx.db.patch(eventId, { teacherStartedAt: NOW() });
  },
});

/**
 * I.6 — convenience used by the live lesson page. Probes for an
 * upcoming/in-progress scheduleEvent for the calling teacher near
 * the current wall clock (±30 min) and stamps teacherStartedAt.
 * Returns the event id if found, null otherwise.
 */
export const markTeacherStartedNearby = mutation({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher" && user.role !== "admin") return null;
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const events = await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", user.externalId)
      )
      .collect();
    const best = events.find((e) => {
      if (e.isDeleted) return false;
      if (e.status !== "scheduled" && e.status !== "rescheduled") return false;
      if (e.date !== today) return false;
      if (studentId && e.studentId && e.studentId !== studentId) return false;
      const start = Date.parse(`${e.date}T${e.startTime}:00.000Z`);
      return Math.abs(start - now) <= 30 * 60_000;
    });
    if (!best) return null;
    if (!best.teacherStartedAt) {
      await ctx.db.patch(best._id, { teacherStartedAt: NOW() });
    }
    return best._id;
  },
});

export const updateEvent = mutation({
  args: {
    eventId: v.id("scheduleEvents"),
    date: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    title: v.optional(v.string()),
    googleMeetLink: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("scheduled"),
        v.literal("completed"),
        v.literal("cancelled"),
        v.literal("rescheduled"),
        v.literal("makeup")
      )
    ),
  },
  handler: async (ctx, { eventId, ...patch }) => {
    const { orgId, user } = await requireTenant(ctx);
    assertGenericEventStatus(patch.status);
    if (patch.date || patch.startTime || patch.endTime || patch.status === "cancelled" || patch.status === "rescheduled") throw new Error("Use the calendar to move or cancel a lesson");
    const evt = await ctx.db.get(eventId);
    if (!evt || evt.organizationId !== orgId) throw new Error("Event not found");

    // Permission branching: full edit for admin; teacher needs calendar.edit.full
    if (user.role !== "admin") {
      if (!userHasPermission(user, "calendar.edit.full")) {
        throw new Error("Access denied: missing calendar.edit.full");
      }
    }

    const t = tenantTable(ctx, orgId, "scheduleEvents");
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ) as Partial<Doc<"scheduleEvents">>;
    await t.patch(eventId, clean);
  },
});

// ─────────────────────────────────────────────────────────────────────
// Reschedule flow
// ─────────────────────────────────────────────────────────────────────

export const resolveReschedule = mutation({
  args: {
    requestId: v.id("rescheduleRequests"),
    action: v.union(v.literal("approved"), v.literal("rejected")),
  },
  handler: async (ctx, { requestId, action }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "schedule.manage");
    const req = await ctx.db.get(requestId);
    if (!req || req.organizationId !== orgId) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error("Request already resolved");

    const evt = await ctx.db.get(req.eventId);
    if (!evt || evt.organizationId !== orgId) throw new Error("Event not found");

    await ctx.db.patch(requestId, {
      status: action,
      resolvedBy: user.externalId,
      resolvedAt: NOW(),
    });

    if (action === "approved") {
      await rescheduleEventCore(ctx, {eventId:req.eventId,toDate:req.toDate,toStartTime:req.toStartTime});
      await ctx.db.patch(req.eventId,{rescheduleRequestId:undefined});
    } else {
      await ctx.db.patch(req.eventId, {
        rescheduleRequestId: undefined,
      });
    }

    // Notify the requester
    const requester = await ctx.db
      .query("users")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .filter((q) => q.eq(q.field("externalId"), req.requesterId))
      .first();

    if (requester) {
      await ctx.runMutation(internal.notifications._notify, {
        organizationId: orgId,
        recipientId: requester.externalId,
        kind: "reschedule_resolved",
        payload: { requestId, action, eventId: req.eventId },
        link: requester.role === "teacher"
          ? "/teacher/calendar"
          : "/student/calendar",
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────
// Quota
// ─────────────────────────────────────────────────────────────────────

export const getQuota = query({
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();

    const yyyymm = new Date().toISOString().slice(0, 7);
    const existing = await ctx.db
      .query("studentRescheduleQuota")
      .withIndex("by_organization_and_studentId_and_yearMonth", (q) =>
        q
          .eq("organizationId", orgId)
          .eq("studentId", user.externalId)
          .eq("yearMonth", yyyymm)
      )
      .unique();

    return {
      used: existing?.count ?? 0,
      max: settings?.maxReschedulesPerMonth ?? 4,
      yearMonth: yyyymm,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────
// No-show
// ─────────────────────────────────────────────────────────────────────

export const markNoShow = mutation({
  args: {
    eventId: v.id("scheduleEvents"),
    party: v.union(v.literal("student"), v.literal("teacher")),
  },
  handler: async (ctx, { eventId, party }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "lessons.mark_no_show");
    const result = await transitionNoShowForEvent(ctx, {
      organizationId: orgId,
      eventId,
      party,
      source: "manual",
      actor: user,
    });
    return result;
  },
});

// ─────────────────────────────────────────────────────────────────────
// Make-up credits
// ─────────────────────────────────────────────────────────────────────

export const getMakeupCredits = query({
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    return await ctx.db
      .query("makeupCredits")
      .withIndex("by_organization_and_studentId_and_status", (q) =>
        q.eq("organizationId", orgId).eq("studentId", user.externalId)
      )
      .filter((q) => q.eq(q.field("status"), "issued"))
      .collect();
  },
});

export const issueMakeupCredit = mutation({
  args: {
    studentId: v.string(),
    reason: v.union(v.literal("admin_grant"), v.literal("other")),
    sourceEventId: v.optional(v.id("scheduleEvents")),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(ctx, "schedule.manage");
    await ctx.db.insert("makeupCredits", {
      organizationId: orgId,
      studentId: args.studentId,
      reason: args.reason,
      sourceEventId: args.sourceEventId,
      status: "issued",
      issuedBy: user.externalId,
      expiresAt: args.expiresAt,
      createdAt: NOW(),
    });

    // Notify student
    await ctx.runMutation(internal.notifications._notify, {
      organizationId: orgId,
      recipientId: args.studentId,
      kind: "makeup_credit_issued",
      payload: { reason: args.reason },
      link: "/student/calendar",
    });
  },
});

// ─────────────────────────────────────────────────────────────────────
// Student packages — DELETED in Phase H.1
// Use `api.points.*` (getBalance / grantPoints / spendPoints / refundPoints).
// ─────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────
// Dev helper — seed a test upcoming event for focused development checks.
// This helper intentionally creates only a scheduled event.
// Usage: npx convex run schedule:seedTestEvent '{"orgId":"org_xxx","teacherEmail":"Mhd.Mustafa.allahham@gmail.com"}'
// ─────────────────────────────────────────────────────────────────────

export const seedTestEvent = internalMutation({
  args: {
    orgId: v.string(),
    teacherEmail: v.string(),
    /** Which student — defaults to the first one in the org. */
    studentEmail: v.optional(v.string()),
    /** Days from today (negative = past), so a history can be seeded. */
    dayOffset: v.optional(v.number()),
    title: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { orgId, teacherEmail, studentEmail, dayOffset, title }
  ) => {
    const now = new Date();
    const day = new Date(now.getTime() + (dayOffset ?? 0) * 86_400_000);
    const dateStr = day.toISOString().slice(0, 10);

    const teacher = await ctx.db
      .query("users")
      .withIndex("by_organization_and_email", (q) =>
        q.eq("organizationId", orgId).eq("email", teacherEmail)
      )
      .first();
    if (!teacher) throw new Error(`Teacher ${teacherEmail} not found in org ${orgId}`);

    const student = studentEmail
      ? await ctx.db
          .query("users")
          .withIndex("by_organization_and_email", (q) =>
            q.eq("organizationId", orgId).eq("email", studentEmail)
          )
          .first()
      : await ctx.db
          .query("users")
          .withIndex("by_organization_and_role", (q) =>
            q.eq("organizationId", orgId).eq("role", "student")
          )
          .first();
    if (!student) throw new Error("No students in org — seed data first");

    const hour = now.getHours();
    const startH = String((hour + 1) % 24).padStart(2, "0");
    const endH = String((hour + 2) % 24).padStart(2, "0");

    await ctx.db.insert("scheduleEvents", {
      organizationId: orgId,
      type: "1on1",
      teacherId: teacher.externalId,
      studentId: student.externalId,
      title: title ?? "Test session — English conversation",
      date: dateStr,
      startTime: `${startH}:00`,
      endTime: `${endH}:00`,
      status: "scheduled",
      createdAt: now.toISOString(),
    });
  },
});
