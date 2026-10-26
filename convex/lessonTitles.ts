import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { ACADEMY_ID } from "./lib/tenant";
import { syncLessonTitles } from "./lib/syncLessonTitles";

/** Idempotent rollout for existing bookings; preserves manually chosen titles. */
export const initialize = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("users").withIndex("by_organization", q => q.eq("organizationId", ACADEMY_ID)).paginate({ cursor: cursor ?? null, numItems: 20 });
    for (const user of page.page) if (user.role === "student") await syncLessonTitles(ctx, ACADEMY_ID, user.externalId);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.lessonTitles.initialize, { cursor: page.continueCursor });
    return { students: page.page.filter(u => u.role === "student").length, done: page.isDone };
  },
});
