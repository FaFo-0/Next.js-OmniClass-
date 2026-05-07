import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireTenant } from "./lib/tenant";

export const getForStudent = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const sid = studentId ?? user.externalId;
    return await ctx.db
      .query("streaks")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", sid)
      )
      .unique();
  },
});

export const _updateStreak = internalMutation({
  args: {
    organizationId: v.string(),
    studentId: v.string(),
  },
  handler: async (ctx, { organizationId, studentId }) => {
    const today = new Date().toISOString().slice(0, 10);
    const existing = await ctx.db
      .query("streaks")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", organizationId).eq("studentId", studentId)
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("streaks", {
        organizationId,
        studentId,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: today,
        activityDates: [today],
      });
      return { currentStreak: 1, longestStreak: 1 };
    }

    const lastDate = existing.lastActivityDate;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    let newCurrent = existing.currentStreak;
    if (lastDate === today) {
      // Already recorded today — no change
    } else if (lastDate === yesterday) {
      newCurrent = existing.currentStreak + 1;
    } else {
      newCurrent = 1;
    }

    const newLongest = Math.max(existing.longestStreak, newCurrent);
    const dates = [...(existing.activityDates ?? []), today].filter(
      (d, i, a) => a.indexOf(d) === i
    );

    await ctx.db.patch(existing._id, {
      currentStreak: newCurrent,
      longestStreak: newLongest,
      lastActivityDate: today,
      activityDates: dates,
    });

    return { currentStreak: newCurrent, longestStreak: newLongest };
  },
});
