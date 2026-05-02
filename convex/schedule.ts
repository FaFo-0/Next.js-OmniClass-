import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requirePermission } from "./lib/auth";

const eventStatusValidator = v.union(
  v.literal("scheduled"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("rescheduled")
);

// ── Queries ──────────────────────────────────────────────────────────

export const getEventsForTeacher = query({
  args: { teacherId: v.string() },
  handler: async (ctx, { teacherId }) => {
    await requirePermission(ctx, "schedule.manage");
    return await ctx.db
      .query("scheduleEvents")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", teacherId))
      .collect();
  },
});

export const getEventsForStudent = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("scheduleEvents")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .collect();
  },
});

export const getPolicy = query({
  handler: async (ctx) => {
    await requireAuth(ctx);
    const doc = await ctx.db.query("schedulePolicy").first();
    return (
      doc ?? {
        rescheduleWindowHours: 6,
        cancelWindowHours: 24,
        lessonDurationMinutes: 60,
      }
    );
  },
});

// ── Mutations ────────────────────────────────────────────────────────

export const addEvent = mutation({
  args: {
    teacherId: v.string(),
    studentId: v.string(),
    title: v.string(),
    date: v.string(),
    startTime: v.string(),
    endTime: v.string(),
    status: eventStatusValidator,
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "schedule.manage");
    await ctx.db.insert("scheduleEvents", args);
  },
});

export const updateEvent = mutation({
  args: {
    id: v.id("scheduleEvents"),
    title: v.optional(v.string()),
    date: v.optional(v.string()),
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    status: v.optional(eventStatusValidator),
  },
  handler: async (ctx, { id, ...updates }) => {
    await requirePermission(ctx, "schedule.manage");
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) patch[k] = val;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(id, patch);
    }
  },
});

export const cancelEvent = mutation({
  args: { id: v.id("scheduleEvents") },
  handler: async (ctx, { id }) => {
    await requireAuth(ctx);
    await ctx.db.patch(id, { status: "cancelled" });
  },
});

export const deleteEvent = mutation({
  args: { id: v.id("scheduleEvents") },
  handler: async (ctx, { id }) => {
    await requirePermission(ctx, "schedule.manage");
    await ctx.db.delete(id);
  },
});

export const updatePolicy = mutation({
  args: {
    rescheduleWindowHours: v.optional(v.number()),
    cancelWindowHours: v.optional(v.number()),
    lessonDurationMinutes: v.optional(v.number()),
  },
  handler: async (ctx, updates) => {
    await requirePermission(ctx, "schedule.manage");
    const existing = await ctx.db.query("schedulePolicy").first();
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) patch[k] = val;
    }

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("schedulePolicy", {
        rescheduleWindowHours: updates.rescheduleWindowHours ?? 6,
        cancelWindowHours: updates.cancelWindowHours ?? 24,
        lessonDurationMinutes: updates.lessonDurationMinutes ?? 60,
      });
    }
  },
});
