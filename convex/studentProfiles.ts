import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requirePermission } from "./lib/auth";

export const getMyProfile = query({
  handler: async (ctx) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) return null;
    return await ctx.db
      .query("studentProfiles")
      .withIndex("by_studentId", (q) => q.eq("studentId", user.externalId))
      .unique();
  },
});

export const getProfileByStudentId = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("studentProfiles")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .unique();
  },
});

export const listAllProfiles = query({
  handler: async (ctx) => {
    await requirePermission(ctx, "users.view.any");
    return await ctx.db.query("studentProfiles").collect();
  },
});

export const submitOnboarding = mutation({
  args: {
    phoneCountryCode: v.string(),
    phoneNumber: v.string(),
    country: v.string(),
    age: v.number(),
    englishLevel: v.union(
      v.literal("beginner"),
      v.literal("intermediate"),
      v.literal("advanced")
    ),
    studiedBefore: v.optional(v.string()),
    studyReason: v.optional(v.string()),
    referralSource: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_tokenIdentifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
    if (!user) throw new Error("User not found");

    // Check if already completed
    const existing = await ctx.db
      .query("studentProfiles")
      .withIndex("by_studentId", (q) => q.eq("studentId", user.externalId))
      .unique();
    if (existing) throw new Error("Onboarding already completed");

    // Create profile
    await ctx.db.insert("studentProfiles", {
      studentId: user.externalId,
      phoneCountryCode: args.phoneCountryCode,
      phoneNumber: args.phoneNumber,
      country: args.country,
      age: args.age,
      englishLevel: args.englishLevel,
      studiedBefore: args.studiedBefore,
      studyReason: args.studyReason,
      referralSource: args.referralSource,
      completedAt: new Date().toISOString(),
    });

    // Mark user as onboarding complete + trial (admin activates after payment)
    await ctx.db.patch(user._id, { onboardingComplete: true, studentStatus: "trial" as const });
  },
});

// Admin: update a student's profile
export const updateProfile = mutation({
  args: {
    studentId: v.string(),
    phoneCountryCode: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    country: v.optional(v.string()),
    age: v.optional(v.number()),
    englishLevel: v.optional(
      v.union(v.literal("beginner"), v.literal("intermediate"), v.literal("advanced"))
    ),
    studiedBefore: v.optional(v.string()),
    studyReason: v.optional(v.string()),
  },
  handler: async (ctx, { studentId, ...updates }) => {
    await requirePermission(ctx, "users.edit");
    const profile = await ctx.db
      .query("studentProfiles")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .unique();
    if (!profile) throw new Error("Profile not found");

    const patch: Record<string, unknown> = {};
    if (updates.phoneCountryCode !== undefined) patch.phoneCountryCode = updates.phoneCountryCode;
    if (updates.phoneNumber !== undefined) patch.phoneNumber = updates.phoneNumber;
    if (updates.country !== undefined) patch.country = updates.country;
    if (updates.age !== undefined) patch.age = updates.age;
    if (updates.englishLevel !== undefined) patch.englishLevel = updates.englishLevel;
    if (updates.studiedBefore !== undefined) patch.studiedBefore = updates.studiedBefore;
    if (updates.studyReason !== undefined) patch.studyReason = updates.studyReason;

    await ctx.db.patch(profile._id, patch);
  },
});

// Admin: update student status
export const updateStudentStatus = mutation({
  args: {
    studentId: v.string(),
    status: v.union(v.literal("trial"), v.literal("active"), v.literal("paused"), v.literal("cancelled")),
  },
  handler: async (ctx, { studentId, status }) => {
    await requirePermission(ctx, "users.edit");
    const user = await ctx.db
      .query("users")
      .withIndex("by_externalId", (q) => q.eq("externalId", studentId))
      .unique();
    if (!user) throw new Error("User not found");
    await ctx.db.patch(user._id, { studentStatus: status });
  },
});
