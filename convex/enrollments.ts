// H.10 — Group session enrollment.
// One row per (student, group event). Each enroll deducts the
// pointCost atomically; unenroll issues a refund grant of the same
// amount (no time-window enforcement in v1 — admin can refine).

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTenant, requireTenantPermission } from "./lib/tenant";
import {
  grantPointsInternal,
  spendPointsInternal,
} from "./points";

const NOW = () => new Date().toISOString();

export const listForEvent = query({
  args: { eventId: v.id("scheduleEvents") },
  handler: async (ctx, { eventId }) => {
    const { orgId } = await requireTenant(ctx);
    return await ctx.db
      .query("scheduleEnrollments")
      .withIndex("by_organization_and_eventId", (q) =>
        q.eq("organizationId", orgId).eq("eventId", eventId)
      )
      .collect();
  },
});

export const listForStudent = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = studentId ?? user.externalId;
    return await ctx.db
      .query("scheduleEnrollments")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", target)
      )
      .collect();
  },
});

export const enroll = mutation({
  args: { eventId: v.id("scheduleEvents") },
  handler: async (ctx, { eventId }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") {
      throw new Error("Only students enroll");
    }

    const event = await ctx.db.get(eventId);
    if (!event || event.organizationId !== orgId) {
      throw new Error("Event not found");
    }
    if (event.isDeleted || event.status !== "scheduled") {
      throw new Error("Event is not open for enrollment");
    }
    if (!event.activityTypeId) {
      throw new Error("Event missing activity type");
    }

    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    const activity = settings?.activityTypes?.find(
      (a) => a.id === event.activityTypeId
    );
    if (!activity || !activity.isGroup) {
      throw new Error("Activity is not a group type");
    }

    // No duplicate enroll
    const existing = await ctx.db
      .query("scheduleEnrollments")
      .withIndex("by_organization_and_eventId", (q) =>
        q.eq("organizationId", orgId).eq("eventId", eventId)
      )
      .collect();
    if (
      existing.some(
        (e) =>
          e.studentId === user.externalId &&
          (e.status === "enrolled" || e.status === "attended")
      )
    ) {
      throw new Error("Already enrolled");
    }

    // Capacity check
    if (event.capacity !== undefined) {
      const activeCount = existing.filter(
        (e) => e.status === "enrolled" || e.status === "attended"
      ).length;
      if (activeCount >= event.capacity) {
        throw new Error("Session is full");
      }
    }

    const cost = event.pointCostSnapshot ?? activity.pointCost;
    const enrollmentId = await ctx.db.insert("scheduleEnrollments", {
      organizationId: orgId,
      eventId,
      studentId: user.externalId,
      pointCostSnapshot: cost,
      status: "enrolled",
      enrolledAt: NOW(),
    });

    await spendPointsInternal(ctx, {
      orgId,
      studentId: user.externalId,
      amount: cost,
      enrollmentId,
      reason: `Enrolled in ${event.title} (${event.date})`,
      performedBy: user.externalId,
    });

    return enrollmentId;
  },
});

export const unenroll = mutation({
  args: { enrollmentId: v.id("scheduleEnrollments") },
  handler: async (ctx, { enrollmentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const row = await ctx.db.get(enrollmentId);
    if (!row || row.organizationId !== orgId) {
      throw new Error("Enrollment not found");
    }
    if (row.studentId !== user.externalId && user.role !== "admin") {
      throw new Error("Cannot unenroll another student");
    }
    if (row.status !== "enrolled") {
      throw new Error("Enrollment already finalized");
    }
    await ctx.db.patch(enrollmentId, { status: "cancelled" });
    // Refund as a fresh grant
    await grantPointsInternal(ctx, {
      orgId,
      studentId: row.studentId,
      points: row.pointCostSnapshot,
      source: "refund",
      performedBy: user.externalId,
      notes: `Refund: unenrolled from event ${row.eventId}`,
    });
  },
});

export const markAttendance = mutation({
  args: {
    enrollmentId: v.id("scheduleEnrollments"),
    status: v.union(v.literal("attended"), v.literal("no_show")),
  },
  handler: async (ctx, { enrollmentId, status }) => {
    const { orgId, user } = await requireTenantPermission(
      ctx,
      "schedule.manage"
    );
    const row = await ctx.db.get(enrollmentId);
    if (!row || row.organizationId !== orgId) {
      throw new Error("Enrollment not found");
    }
    await ctx.db.patch(enrollmentId, {
      status,
      attendanceMarkedBy: user.externalId,
      attendanceMarkedAt: NOW(),
    });
  },
});

/** Count of active enrollments per event — feeds capacity UI. */
export const countActiveForEvent = query({
  args: { eventId: v.id("scheduleEvents") },
  handler: async (ctx, { eventId }) => {
    const { orgId } = await requireTenant(ctx);
    const rows = await ctx.db
      .query("scheduleEnrollments")
      .withIndex("by_organization_and_eventId", (q) =>
        q.eq("organizationId", orgId).eq("eventId", eventId)
      )
      .collect();
    return rows.filter(
      (r) => r.status === "enrolled" || r.status === "attended"
    ).length;
  },
});
