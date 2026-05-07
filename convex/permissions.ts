import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTenant, requireTenantPermission } from "./lib/tenant";
import { internal } from "./_generated/api";

const NOW = () => new Date().toISOString();

export const requestPermission = mutation({
  args: {
    action: v.string(),
    payload: v.optional(v.any()),
  },
  handler: async (ctx, { action, payload }) => {
    const { orgId, user } = await requireTenant(ctx);

    const reqId = await ctx.db.insert("permissionRequests", {
      organizationId: orgId,
      teacherId: user.externalId,
      action,
      payload: payload ?? {},
      status: "pending",
      createdAt: NOW(),
    });

    // Notify all admins
    const admins = await ctx.db
      .query("users")
      .withIndex("by_organization_and_role", (q) =>
        q.eq("organizationId", orgId).eq("role", "admin")
      )
      .collect();

    for (const admin of admins) {
      await ctx.runMutation(internal.notifications._notify, {
        organizationId: orgId,
        recipientId: admin.externalId,
        kind: "permission_request",
        payload: {
          requestId: reqId,
          teacherId: user.externalId,
          teacherName: user.name,
          action,
        },
        link: "/admin/permissions",
      });
    }

    return reqId;
  },
});

export const resolvePermission = mutation({
  args: {
    requestId: v.id("permissionRequests"),
    status: v.union(v.literal("approved"), v.literal("rejected")),
  },
  handler: async (ctx, { requestId, status }) => {
    const { orgId, user } = await requireTenantPermission(ctx, "users.edit");
    const req = await ctx.db.get(requestId);
    if (!req || req.organizationId !== orgId) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error("Already resolved");

    await ctx.db.patch(requestId, {
      status,
      resolvedBy: user.externalId,
      resolvedAt: NOW(),
    });

    // If approved, add the permission to the teacher's overrides
    if (status === "approved") {
      const teacher = await ctx.db
        .query("users")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .filter((q) => q.eq(q.field("externalId"), req.teacherId))
        .first();

      if (teacher) {
        const existing = teacher.permissions ?? [];
        if (!existing.includes(req.action)) {
          await ctx.db.patch(teacher._id, {
            permissions: [...existing, req.action],
          });
        }
      }
    }

    // Notify teacher
    await ctx.runMutation(internal.notifications._notify, {
      organizationId: orgId,
      recipientId: req.teacherId,
      kind: "reschedule_resolved",
      payload: {
        requestId,
        action: req.action,
        decision: status,
      },
    });
  },
});

export const listPendingPermissionRequests = query({
  handler: async (ctx) => {
    const { orgId } = await requireTenantPermission(ctx, "users.edit");
    return await ctx.db
      .query("permissionRequests")
      .withIndex("by_organization_and_status", (q) =>
        q.eq("organizationId", orgId).eq("status", "pending")
      )
      .order("desc")
      .take(100);
  },
});
