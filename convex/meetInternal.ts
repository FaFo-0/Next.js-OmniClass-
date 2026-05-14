// Internal helpers for convex/meet.ts (which runs in the Node
// runtime). Splitting keeps the default runtime for the simple
// query/mutation surface.

import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

export const _getRefreshToken = internalQuery({
  args: { teacherId: v.string() },
  handler: async (ctx, { teacherId }) => {
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("externalId"), teacherId))
      .first();
    return user?.googleOAuthRefreshToken ?? null;
  },
});

export const _setRefreshTokenByClerkUserId = internalMutation({
  args: { clerkUserId: v.string(), refreshToken: v.string() },
  handler: async (ctx, { clerkUserId, refreshToken }) => {
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("externalId"), clerkUserId))
      .first();
    if (!user) throw new Error("User not found for Clerk id");
    await ctx.db.patch(user._id, { googleOAuthRefreshToken: refreshToken });
  },
});
