// H.5 — Student onboarding form + trial grant.
// Flow:
//   1. User signs up (Clerk webhook upserts a users row).
//   2. App middleware sees users.onboardingComplete = false and
//      redirects to /onboarding/student.
//   3. Student fills form → completeStudentOnboarding() writes
//      studentOnboarding row, flips users.onboardingComplete = true,
//      and grants the configured trial points if trialPolicy.enabled
//      and not requiresPayment. Paid trials skip the grant; the admin
//      grants manually after payment receipt (until Stripe ships).

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTenant } from "./lib/tenant";
import { grantPointsInternal } from "./points";

const NOW = () => new Date().toISOString();

export const getMyOnboarding = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    return await ctx.db
      .query("studentOnboarding")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", user.externalId)
      )
      .unique();
  },
});

export const completeStudentOnboarding = mutation({
  args: {
    age: v.optional(v.number()),
    phoneWhatsapp: v.string(),
    cefrSelfAssessed: v.string(),
    goal: v.string(),
    preferredDaysTimes: v.string(),
    l1: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") {
      throw new Error("Only students complete student onboarding");
    }

    // Upsert the onboarding row (idempotent — student can re-edit).
    const existing = await ctx.db
      .query("studentOnboarding")
      .withIndex("by_organization_and_studentId", (q) =>
        q.eq("organizationId", orgId).eq("studentId", user.externalId)
      )
      .unique();
    const now = NOW();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        completedAt: now,
      });
    } else {
      await ctx.db.insert("studentOnboarding", {
        organizationId: orgId,
        studentId: user.externalId,
        ...args,
        completedAt: now,
      });
    }

    // Mirror phone onto users row + flip onboardingComplete.
    await ctx.db.patch(user._id, {
      onboardingComplete: true,
      phoneWhatsapp: args.phoneWhatsapp,
    });

    // Trial grant — only on first completion, only if enabled + free.
    const firstTime = !existing;
    if (firstTime) {
      const settings = await ctx.db
        .query("tenantSettings")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .unique();
      const policy = settings?.trialPolicy;
      if (policy?.enabled && !policy.requiresPayment && policy.points > 0) {
        const expiresAt = new Date(
          Date.now() + policy.durationDays * 86_400_000
        )
          .toISOString()
          .slice(0, 10);
        await grantPointsInternal(ctx, {
          orgId,
          studentId: user.externalId,
          points: policy.points,
          source: "trial",
          expiresAt,
          performedBy: "system",
          notes: `Free trial — ${policy.points} pts for ${policy.durationDays}d`,
        });
      }
    }
    return { firstTime };
  },
});

export const getTrialPolicy = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenant(ctx);
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    return settings?.trialPolicy ?? null;
  },
});
