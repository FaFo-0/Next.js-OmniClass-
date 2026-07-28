import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTenant } from "./lib/tenant";
import { bumpStreak } from "./streaks";
import { evaluateAchievements } from "./achievements";

export const recordSession = mutation({
  args: {
    type: v.union(v.literal("flashcard"), v.literal("quiz")),
    cardsReviewed: v.number(),
    startedAt: v.string(),
    endedAt: v.string(),
    durationMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    const id = await ctx.db.insert("studySessions", {
      organizationId: orgId,
      studentId: user.externalId,
      ...args,
    });
    // Studying is what a streak measures — recording a session IS the bump.
    await bumpStreak(ctx, orgId, user);
    await evaluateAchievements(ctx, orgId, user.externalId);
    return id;
  },
});

export const recordQuizAttempt = mutation({
  args: {
    lessonId: v.string(),
    score: v.number(),
    total: v.number(),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    const id = await ctx.db.insert("quizAttempts", {
      organizationId: orgId,
      lessonId: args.lessonId,
      studentId: user.externalId,
      score: args.score,
      total: args.total,
      completedAt: new Date().toISOString(),
    });
    await bumpStreak(ctx, orgId, user);
    await evaluateAchievements(ctx, orgId, user.externalId);
    return id;
  },
});

export const listSessions = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    return await ctx.db
      .query("studySessions")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", user.externalId)
      )
      .order("desc")
      .take(50);
  },
});

export const totalStudyMinutes = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    const rows = await ctx.db
      .query("studySessions")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", user.externalId)
      )
      .collect();
    return rows.reduce((sum, r) => sum + (r.durationMinutes ?? 0), 0);
  },
});

export const listQuizAttempts = query({
  args: { lessonId: v.optional(v.string()) },
  handler: async (ctx, { lessonId }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (lessonId) {
      return await ctx.db
        .query("quizAttempts")
        .withIndex("by_organization_and_lessonId", (q) =>
          q.eq("organizationId", orgId).eq("lessonId", lessonId)
        )
        .filter((q) => q.eq(q.field("studentId"), user.externalId))
        .order("desc")
        .take(20);
    }
    return await ctx.db
      .query("quizAttempts")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", user.externalId)
      )
      .order("desc")
      .take(50);
  },
});
