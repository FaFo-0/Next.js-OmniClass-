import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireTenant, requireTenantPermission } from "./lib/tenant";

export const list = query({
  handler: async (ctx) => {
    const { orgId } = await requireTenant(ctx);
    return await ctx.db
      .query("achievements")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
  },
});

export const listForStudent = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const sid = studentId ?? user.externalId;

    const achievements = await ctx.db
      .query("achievements")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();

    const unlocked = await ctx.db
      .query("studentAchievements")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", sid)
      )
      .collect();

    const unlockedMap = new Map(
      unlocked.map((u) => [u.achievementId, u.unlockedAt])
    );

    return achievements.map((a) => ({
      ...a,
      unlocked: unlockedMap.has(a.externalId),
      unlockedAt: unlockedMap.get(a.externalId) ?? null,
    }));
  },
});

export const create = mutation({
  args: {
    externalId: v.string(),
    name: v.string(),
    description: v.string(),
    icon: v.string(),
    conditionType: v.union(
      v.literal("lessons_completed"),
      v.literal("cards_reviewed"),
      v.literal("quiz_perfect"),
      v.literal("streak_days"),
      v.literal("vocab_learned")
    ),
    conditionThreshold: v.number(),
    reward: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireTenantPermission(ctx, "achievements.edit");
    return await ctx.db.insert("achievements", {
      organizationId: orgId,
      ...args,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("achievements") },
  handler: async (ctx, { id }) => {
    const { orgId } = await requireTenantPermission(ctx, "achievements.edit");
    const doc = await ctx.db.get(id);
    if (!doc || doc.organizationId !== orgId) throw new Error("Not found");
    await ctx.db.delete(id);
  },
});
