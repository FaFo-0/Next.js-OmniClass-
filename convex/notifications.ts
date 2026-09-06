import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireTenant, tenantTable } from "./lib/tenant";
import { NOTIFICATION_KINDS } from "./lib/notificationRegistry";

export const listUnread = query({
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    return await ctx.db
      .query("notifications")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .filter((q) =>
        q.and(
          q.eq(q.field("recipientId"), user.externalId),
          q.eq(q.field("readAt"), undefined),
          q.eq(q.field("withdrawnAt"), undefined)
        )
      )
      .order("desc")
      .take(50);
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const { orgId, user } = await requireTenant(ctx);
    return await ctx.db
      .query("notifications")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .filter((q) =>
        q.and(
          q.eq(q.field("recipientId"), user.externalId),
          q.eq(q.field("withdrawnAt"), undefined)
        )
      )
      .order("desc")
      .take(limit ?? 20);
  },
});

export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const { orgId } = await requireTenant(ctx);
    const t = tenantTable(ctx, orgId, "notifications");
    await t.patch(notificationId, {
      readAt: new Date().toISOString(),
    });
  },
});

export const markAllRead = mutation({
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .filter((q) =>
        q.and(
          q.eq(q.field("recipientId"), user.externalId),
          q.eq(q.field("readAt"), undefined)
        )
      )
      .collect();

    const now = new Date().toISOString();
    await Promise.all(
      unread.map((n) => ctx.db.patch(n._id, { readAt: now }))
    );
  },
});

export const _notify = internalMutation({
  args: {
    organizationId: v.string(),
    recipientId: v.string(),
    // Derived from the same registry the schema uses — producers, storage,
    // rendering and destinations share one list.
    kind: v.union(...NOTIFICATION_KINDS.map((k) => v.literal(k))),
    payload: v.optional(v.any()),
    link: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("notifications", {
      organizationId: args.organizationId,
      recipientId: args.recipientId,
      kind: args.kind,
      payload: args.payload ?? {},
      link: args.link,
      readAt: undefined,
      createdAt: new Date().toISOString(),
    });
  },
});
