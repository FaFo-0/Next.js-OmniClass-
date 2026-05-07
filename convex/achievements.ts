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
