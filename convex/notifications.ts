import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { requireTenant, tenantTable } from "./lib/tenant";
import {
  NOTIFICATION_KINDS,
  notificationContractIssues,
  type NotifRole,
} from "./lib/notificationRegistry";

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
    sourceKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const recipients = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", args.organizationId).eq("externalId", args.recipientId)
      )
      .collect();
    const recipient = recipients
      .filter((candidate) => !candidate.retiredAt)
      .sort((a, b) =>
        Number(Boolean(a.tokenIdentifier)) - Number(Boolean(b.tokenIdentifier)) ||
        a.createdAt.localeCompare(b.createdAt)
      )[0];
    if (!recipient) throw new Error("Notification recipient not found");
    // Reconciled duplicate identities keep their history but cannot receive
    // new bell or Telegram fan-out.

    const issues = notificationContractIssues(
      args.kind,
      args.payload ?? {},
      recipient.role as NotifRole
    );
    if (issues.length > 0) throw new Error(`Invalid notification: ${issues.join("; ")}`);

    if (args.sourceKey) {
      const existing = await ctx.db
        .query("notifications")
        .withIndex("by_organization_and_recipientId_and_sourceKey", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("recipientId", args.recipientId)
            .eq("sourceKey", args.sourceKey)
        )
        .unique();
      if (existing) return existing._id;
    }

    return await ctx.db.insert("notifications", {
      organizationId: args.organizationId,
      recipientId: args.recipientId,
      kind: args.kind,
      payload: args.payload ?? {},
      link: args.link,
      sourceKey: args.sourceKey,
      readAt: undefined,
      createdAt: new Date().toISOString(),
    });
  },
});
