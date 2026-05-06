// Prompt configs are seeded per-org via seed.ts. Listing + per-config
// lookup is read-only here. Editor UI in /admin/ai (Phase F) will write
// via dedicated admin mutations.

import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireTenant } from "./lib/tenant";

export const listForOrg = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenant(ctx);
    return await ctx.db
      .query("promptConfigs")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
  },
});

export const getByConfigId = query({
  args: { configId: v.string() },
  handler: async (ctx, { configId }) => {
    const { orgId } = await requireTenant(ctx);
    return await ctx.db
      .query("promptConfigs")
      .withIndex("by_organization_and_configId", (q) =>
        q.eq("organizationId", orgId).eq("configId", configId)
      )
      .unique();
  },
});
