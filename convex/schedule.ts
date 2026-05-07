import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireTenant, requireTenantPermission, tenantTable } from "./lib/tenant";
import { internal } from "./_generated/api";

const NOW = () => new Date().toISOString();

// ─────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────

export const listForTeacher = query({
  args: { teacherId: v.optional(v.string()) },
  handler: async (ctx, { teacherId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const tid = teacherId ?? user.externalId;
    return await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", tid)
      )
      .order("desc")
      .take(200);
  },
});

export const listForStudent = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const sid = studentId ?? user.externalId;
    return await ctx.db
      .query("scheduleEvents")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", sid)
      )
      .order("desc")
      .take(200);
  },
});

export const listForOrg = query({
  handler: async (ctx) => {
    const { orgId } = await requireTenant(ctx);
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
    const { orgId, user } = await requireTenantPermission(ctx, "schedule.manage");
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

export const createEvent = mutation({
  args: {
    type: v.union(
      v.literal("1on1"),
      v.literal("group"),
      v.literal("offline"),
      v.literal("global")
    ),
    teacherId: v.optional(v.string()),
    studentId: v.optional(v.string()),
    studentIds: v.optional(v.array(v.string())),
    title: v.string(),
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    googleMeetLink: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireTenantPermission(ctx, "schedule.manage");
    const t = tenantTable(ctx, orgId, "scheduleEvents");
    const externalId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return await t.insert({
      externalId,
      type: args.type,
      teacherId: args.teacherId,
      studentId: args.studentId,
      studentIds: args.studentIds,
      title: args.title,
      date: args.date,
      startTime: args.startTime,
      endTime: args.endTime,
      status: "scheduled",
      googleMeetLink: args.googleMeetLink,
      createdAt: NOW(),
    });
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
        v.literal("no_show_student"),
        v.literal("no_show_teacher"),
        v.literal("makeup")
      )
    ),
  },
  handler: async (ctx, { eventId, ...patch }) => {
    const { orgId, user } = await requireTenant(ctx);
    const evt = await ctx.db.get(eventId);
    if (!evt || evt.organizationId !== orgId) throw new Error("Event not found");

    // Permission branching: full edit for admin; teacher needs calendar.edit.full
    if (user.role !== "admin") {
      const { userHasPermission } = await import("./lib/permissions");
      if (!userHasPermission(user, "calendar.edit.full")) {
        throw new Error("Access denied: missing calendar.edit.full");
      }
    }

    const t = tenantTable(ctx, orgId, "scheduleEvents");
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) clean[k] = v;
    }
    await t.patch(eventId, clean);
  },
});

// ─────────────────────────────────────────────────────────────────────
// Reschedule flow
// ─────────────────────────────────────────────────────────────────────

export const requestReschedule = mutation({
  args: {
    eventId: v.id("scheduleEvents"),
    toDate: v.string(),
    toStartTime: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, toDate, toStartTime, reason }) => {
    const { orgId, user } = await requireTenant(ctx);
    const evt = await ctx.db.get(eventId);
    if (!evt || evt.organizationId !== orgId) throw new Error("Event not found");

    // Determine role: student or teacher
    const isTeacher = user.role === "teacher" || user.role === "admin";
    const requestedBy = isTeacher ? "teacher" : "student";

    // Student quota check
    if (!isTeacher) {
      const settings = await ctx.db
        .query("tenantSettings")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .unique();

      if (settings) {
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

        const current = existing?.count ?? 0;
        const max = settings.maxReschedulesPerMonth ?? 4;
        if (current >= max) {
          throw new Error(`Reschedule limit reached (${max}/${max} this month)`);
        }

        // Increment quota atomically
        if (existing) {
          await ctx.db.patch(existing._id, { count: current + 1 });
        } else {
          await ctx.db.insert("studentRescheduleQuota", {
            organizationId: orgId,
            studentId: user.externalId,
            yearMonth: yyyymm,
            count: 1,
          });
        }
      }

      // Check window constraint
      if (settings?.rescheduleWindowHours) {
        const eventDt = new Date(`${evt.date}T${evt.startTime}`);
        const diffMs = eventDt.getTime() - Date.now();
        if (diffMs < settings.rescheduleWindowHours * 3600 * 1000) {
          throw new Error(
            `Too close to lesson (min ${settings.rescheduleWindowHours}h required)`
          );
        }
      }
    }

    // Teacher reschedule: check permission
    if (isTeacher && user.role !== "admin") {
      const { userHasPermission } = await import("./lib/permissions");
      if (!userHasPermission(user, "calendar.edit.full")) {
        // request_only: create request instead of direct reschedule
        const reqId = await ctx.db.insert("rescheduleRequests", {
          organizationId: orgId,
          eventId,
          requestedBy: "teacher",
          requesterId: user.externalId,
          fromDate: evt.date,
          fromStartTime: evt.startTime,
          toDate,
          toStartTime,
          reason,
          status: "pending",
          createdAt: NOW(),
        });

        // Link request to event
        await ctx.db.patch(eventId, {
          rescheduleRequestId: reqId,
        });

        // Notify admins
        const admins = await ctx.db
          .query("users")
          .withIndex("by_organization_and_role", (q) =>
            q.eq("organizationId", orgId).eq("role", "admin")
          )
          .collect();

        for (const admin of admins) {
          await ctx.runMutation(internal.notifications._notify, {
            organizationId: orgId,
            recipientId: admin.externalId,
            kind: "reschedule_request",
            payload: {
              eventId,
              teacherId: user.externalId,
              fromDate: evt.date,
              fromStartTime: evt.startTime,
              toDate,
              toStartTime,
              reason,
            },
            link: `/admin/scheduling/requests`,
          });
        }

        return { requestCreated: true, requestId: reqId };
      }
    }

    // Direct reschedule (student or full-perm teacher)
    const reqId = await ctx.db.insert("rescheduleRequests", {
      organizationId: orgId,
      eventId,
      requestedBy,
      requesterId: user.externalId,
      fromDate: evt.date,
      fromStartTime: evt.startTime,
      toDate,
      toStartTime,
      reason,
      status: isTeacher || user.role === "admin" ? "approved" : "pending",
      resolvedBy: isTeacher || user.role === "admin" ? user.externalId : undefined,
      resolvedAt: isTeacher || user.role === "admin" ? NOW() : undefined,
      createdAt: NOW(),
    });

    // If teacher with full perm: approve immediately and move event
    if (isTeacher && user.role !== "student") {
      await ctx.db.patch(eventId, {
        date: toDate,
        startTime: toStartTime,
        status: "rescheduled",
        rescheduledFromEventId: eventId,
        rescheduleRequestId: reqId,
      });
    } else {
      // Student: create pending request
      await ctx.db.patch(eventId, {
        rescheduleRequestId: reqId,
      });
    }

    return { requestCreated: true, requestId: reqId, autoApproved: isTeacher };
  },
});

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
      await ctx.db.patch(req.eventId, {
        date: req.toDate,
        startTime: req.toStartTime,
        status: "rescheduled",
        rescheduledFromEventId: req.eventId,
      });
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
    const evt = await ctx.db.get(eventId);
    if (!evt || evt.organizationId !== orgId) throw new Error("Event not found");

    const newStatus =
      party === "student" ? "no_show_student" : "no_show_teacher";
    await ctx.db.patch(eventId, { status: newStatus });

    // Decrement student package sessions for student no-show
    if (party === "student") {
      const settings = await ctx.db
        .query("tenantSettings")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .unique();

      const sid = evt.studentId;
      if (settings?.noShowConsumesLesson && sid) {
        const pkg = await ctx.db
          .query("studentPackages")
          .withIndex("by_organization_and_studentId", (q) =>
            q.eq("organizationId", orgId).eq("studentId", sid)
          )
          .filter((q) => q.eq(q.field("status"), "active"))
          .first();

        if (pkg) {
          await ctx.db.patch(pkg._id, {
            usedSessions: (pkg.usedSessions ?? 0) + 1,
          });
        }
      }
    }

    // For teacher no-show → issue make-up credit
    if (party === "teacher" && evt.studentId) {
      await ctx.db.insert("makeupCredits", {
        organizationId: orgId,
        studentId: evt.studentId,
        reason: "teacher_no_show",
        sourceEventId: eventId,
        status: "issued",
        issuedBy: user?.externalId ?? "system",
        createdAt: NOW(),
      });

      // Notify student
      await ctx.runMutation(internal.notifications._notify, {
        organizationId: orgId,
        recipientId: evt.studentId,
        kind: "makeup_credit_issued",
        payload: { eventId, sourceEventId: eventId },
        link: "/student/calendar",
      });
    }
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
// Student packages
// ─────────────────────────────────────────────────────────────────────

export const getPackage = query({
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    return await ctx.db
      .query("studentPackages")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", user.externalId)
      )
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();
  },
});

export const listPackagesForOrg = query({
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.view");
    return await ctx.db
      .query("studentPackages")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
  },
});

export const createPackage = mutation({
  args: {
    studentId: v.string(),
    totalSessions: v.number(),
    startDate: v.string(),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireTenantPermission(ctx, "billing.edit");
    return await ctx.db.insert("studentPackages", {
      organizationId: orgId,
      studentId: args.studentId,
      totalSessions: args.totalSessions,
      usedSessions: 0,
      status: "active",
      startDate: args.startDate,
      endDate: args.endDate,
      createdAt: NOW(),
    });
  },
});
