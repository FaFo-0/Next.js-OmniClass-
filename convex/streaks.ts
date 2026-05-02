import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requirePermission } from "./lib/auth";
import { todayStr } from "./lib/sm2";

// ── Queries ──────────────────────────────────────────────────────────

export const getStreak = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    await requireAuth(ctx);
    const doc = await ctx.db
      .query("streaks")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .first();
    return (
      doc ?? {
        studentId,
        currentStreak: 0,
        longestStreak: 0,
        lastActivityDate: null,
        activityDates: [],
      }
    );
  },
});

export const getAllStreaks = query({
  handler: async (ctx) => {
    await requirePermission(ctx, "users.view.any");
    return await ctx.db.query("streaks").collect();
  },
});

// ── Mutations ────────────────────────────────────────────────────────

export const recordActivity = mutation({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    await requireAuth(ctx);
    const today = todayStr();
    const existing = await ctx.db
      .query("streaks")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .first();

    if (!existing) {
      await ctx.db.insert("streaks", {
        studentId,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: today,
        activityDates: [today],
      });
      return { incremented: true, newStreak: 1 };
    }

    if (existing.lastActivityDate === today) {
      return { incremented: false, newStreak: existing.currentStreak };
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const isConsecutive = existing.lastActivityDate === yesterdayStr;
    const newStreak = isConsecutive ? existing.currentStreak + 1 : 1;
    const newLongest = Math.max(newStreak, existing.longestStreak);

    // Keep last 365 days of activity
    const dates = [...existing.activityDates, today].slice(-365);

    await ctx.db.patch(existing._id, {
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastActivityDate: today,
      activityDates: dates,
    });

    return { incremented: true, newStreak };
  },
});
