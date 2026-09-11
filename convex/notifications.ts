import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireTenant, tenantTable } from "./lib/tenant";
import {
  NOTIFICATION_KINDS,
  notificationContractIssues,
  type NotificationKind,
  type NotifRole,
} from "./lib/notificationRegistry";

export interface NotificationInsertArgs {
  organizationId: string;
  recipientId: string;
  kind: NotificationKind;
  payload?: Record<string, unknown>;
  link?: string;
  sourceKey?: string;
}

/**
 * Write a validated notification in the caller's transaction. No-show
 * accounting uses this instead of ctx.runMutation(_notify), so refund,
 * terminal event status, and the durable announcement commit or roll back
 * together.
 */
export async function insertNotification(
  ctx: MutationCtx,
  args: NotificationInsertArgs,
): Promise<Id<"notifications">> {
  // Legacy tenant data can contain more than one row for the same stable
  // external identity. Keep notification delivery deterministic until that
  // exceptional data is reconciled; the newest row is the active record.
  const recipients = await ctx.db
    .query("users")
    .withIndex("by_organization_and_externalId", (q) =>
      q.eq("organizationId", args.organizationId).eq("externalId", args.recipientId)
    )
    .collect();
  // Convex returns the index rows in creation order; the newest row is the
  // active record when legacy data contains duplicate stable identities.
  const recipient = recipients[recipients.length - 1];
  if (!recipient) throw new Error("Notification recipient not found");

  const payload = args.payload ?? {};
  const issues = notificationContractIssues(
    args.kind,
    payload,
    recipient.role as NotifRole,
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
    payload,
    link: args.link,
    sourceKey: args.sourceKey,
    readAt: undefined,
    createdAt: new Date().toISOString(),
  });
}

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
    return await insertNotification(ctx, args);
  },
});
