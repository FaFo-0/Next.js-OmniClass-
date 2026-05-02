import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requirePermission } from "./lib/auth";

// ── Queries ──────────────────────────────────────────────────────────

export const listUsers = query({
  handler: async (ctx) => {
    await requirePermission(ctx, "users.view.any");
    return await ctx.db.query("users").collect();
  },
});

/** Lightweight user list accessible to any authenticated user (for name resolution in calendars etc.) */
export const listAllUsers = query({
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.db.query("users").collect();
  },
});

export const getUser = query({
  args: { externalId: v.string() },
  handler: async (ctx, { externalId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
      .unique();
  },
});

/** Get the currently authenticated user (looks up by Clerk token identity). */
export const getMe = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
  },
});

export const getStudentsForTeacher = query({
  args: { teacherId: v.string() },
  handler: async (ctx, { teacherId }) => {
    await requirePermission(ctx, "users.view.any");
    return await ctx.db
      .query("users")
      .withIndex("by_teacherId", (q) => q.eq("teacherId", teacherId))
      .collect();
  },
});

// ── Mutations ────────────────────────────────────────────────────────

/**
 * Upsert user from Clerk auth.
 * Called on the client after sign-in to ensure the user exists in our DB.
 *
 * Priority:
 * 1. If a user with this tokenIdentifier exists → update name/email/avatar
 * 2. If an admin pre-created a user with the same email → link Clerk identity to that user (preserving role/teacherId)
 * 3. Otherwise → create a new user with default role "student"
 */
export const upsertFromAuth = mutation({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // 1. Already linked — just update profile info
    const byToken = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (byToken) {
      await ctx.db.patch(byToken._id, {
        name: identity.name ?? byToken.name,
        email: identity.email ?? byToken.email,
        avatarUrl: identity.pictureUrl ?? byToken.avatarUrl,
      });
      return byToken.externalId;
    }

    // 2. Admin pre-created user with matching email — link Clerk identity
    if (identity.email) {
      const byEmail = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", identity.email!))
        .unique();

      if (byEmail && !byEmail.tokenIdentifier) {
        await ctx.db.patch(byEmail._id, {
          externalId: identity.subject,
          tokenIdentifier: identity.tokenIdentifier,
          name: identity.name ?? byEmail.name,
          avatarUrl: identity.pictureUrl ?? byEmail.avatarUrl,
        });
        return byEmail.externalId;
      }
    }

    // 3. Brand new user — default to student
    const externalId = identity.subject;
    await ctx.db.insert("users", {
      externalId,
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name ?? "New User",
      email: identity.email ?? "",
      role: "student",
      createdAt: new Date().toISOString(),
      avatarUrl: identity.pictureUrl,
    });

    return externalId;
  },
});

export const createUser = mutation({
  args: {
    externalId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("teacher"),
      v.literal("student"),
      v.literal("admin")
    ),
    avatarUrl: v.optional(v.string()),
    teacherId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "users.create");
    return await ctx.db.insert("users", {
      ...args,
      createdAt: new Date().toISOString(),
    });
  },
});

export const updateUser = mutation({
  args: {
    externalId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    role: v.optional(
      v.union(
        v.literal("teacher"),
        v.literal("student"),
        v.literal("admin")
      )
    ),
    avatarUrl: v.optional(v.string()),
    teacherId: v.optional(v.string()),
  },
  handler: async (ctx, { externalId, ...updates }) => {
    await requirePermission(ctx, "users.edit");
    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
      .unique();
    if (!user) throw new Error(`User not found: ${externalId}`);

    const patch: Record<string, any> = {};
    for (const [k, val] of Object.entries(updates)) {
      if (val !== undefined) {
        // Empty string for teacherId means "unassign"
        if (k === "teacherId" && val === "") {
          patch[k] = undefined;
        } else {
          patch[k] = val;
        }
      }
    }
    await ctx.db.patch(user._id, patch);
  },
});

/**
 * Bootstrap an admin by email. Internal-only — invoke via CLI:
 *   npx convex run users:promoteToAdmin '{"email":"you@example.com"}'
 * Use once to seat the first admin, since the normal createUser path is admin-only.
 */
export const promoteToAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) throw new Error(`No user with email ${email}`);
    await ctx.db.patch(user._id, { role: "admin" });
    return user.externalId;
  },
});

export const deleteUser = mutation({
  args: { externalId: v.string() },
  handler: async (ctx, { externalId }) => {
    await requirePermission(ctx, "users.delete");
    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", externalId))
      .unique();
    if (!user) throw new Error(`User not found: ${externalId}`);
    await ctx.db.delete(user._id);
  },
});
