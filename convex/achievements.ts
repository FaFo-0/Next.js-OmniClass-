import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requirePermission } from "./lib/auth";

// ── Queries ──────────────────────────────────────────────────────────

export const listAchievements = query({
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("achievements").collect();
  },
});

export const getStudentAchievements = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("studentAchievements")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .collect();
  },
});

// ── Mutations ────────────────────────────────────────────────────────

const conditionTypeValidator = v.union(
  v.literal("lessons_completed"),
  v.literal("cards_reviewed"),
  v.literal("quiz_perfect"),
  v.literal("streak_days"),
  v.literal("vocab_learned")
);

export const checkAndGrantAchievements = mutation({
  args: {
    studentId: v.string(),
    stats: v.object({
      lessonsCompleted: v.number(),
      totalCardsReviewed: v.number(),
      perfectQuizzes: v.number(),
      vocabLearned: v.number(),
      currentStreak: v.number(),
    }),
  },
  handler: async (ctx, { studentId, stats }) => {
    await requireAuth(ctx);
    const achievements = await ctx.db.query("achievements").collect();
    const earned = await ctx.db
      .query("studentAchievements")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .collect();
    const earnedIds = new Set(earned.map((sa) => sa.achievementId));

    const newlyUnlocked: string[] = [];

    for (const ach of achievements) {
      if (earnedIds.has(ach.externalId)) continue;

      let met = false;
      switch (ach.conditionType) {
        case "lessons_completed":
          met = stats.lessonsCompleted >= ach.conditionThreshold;
          break;
        case "cards_reviewed":
          met = stats.totalCardsReviewed >= ach.conditionThreshold;
          break;
        case "quiz_perfect":
          met = stats.perfectQuizzes >= ach.conditionThreshold;
          break;
        case "streak_days":
          met = stats.currentStreak >= ach.conditionThreshold;
          break;
        case "vocab_learned":
          met = stats.vocabLearned >= ach.conditionThreshold;
          break;
      }

      if (met) {
        await ctx.db.insert("studentAchievements", {
          achievementId: ach.externalId,
          studentId,
          unlockedAt: new Date().toISOString(),
        });
        newlyUnlocked.push(ach.externalId);
      }
    }

    return newlyUnlocked;
  },
});

export const createAchievement = mutation({
  args: {
    externalId: v.string(),
    name: v.string(),
    description: v.string(),
    icon: v.string(),
    conditionType: conditionTypeValidator,
    conditionThreshold: v.number(),
    reward: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "achievements.edit");
    await ctx.db.insert("achievements", args);
  },
});

export const updateAchievement = mutation({
  args: {
    externalId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    conditionType: v.optional(conditionTypeValidator),
    conditionThreshold: v.optional(v.number()),
    reward: v.optional(v.string()),
  },
  handler: async (ctx, { externalId, ...updates }) => {
    await requirePermission(ctx, "achievements.edit");
    const doc = await ctx.db
      .query("achievements")
      .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
      .first();
    if (!doc) return;

    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) patch[k] = val;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch(doc._id, patch);
    }
  },
});

export const deleteAchievement = mutation({
  args: { externalId: v.string() },
  handler: async (ctx, { externalId }) => {
    await requirePermission(ctx, "achievements.edit");
    const doc = await ctx.db
      .query("achievements")
      .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
      .first();
    if (doc) await ctx.db.delete(doc._id);
  },
});
