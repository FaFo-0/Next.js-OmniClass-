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
    return (
      settings?.trialPolicy ?? {
        enabled: true,
        points: 5,
        requiresPayment: false,
        durationDays: 14,
      }
    );
  },
});

/**
 * Teacher getting-started checklist. Each step is DERIVED from real data
 * rather than a stored flag, so it can't drift: the step is done when the
 * thing itself exists. Nothing to reset, nothing to migrate.
 */
export const teacherChecklist = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher") return null;
    const tid = user.externalId;

    const vacancies = await ctx.db
      .query("teacherVacancies")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", tid)
      )
      .take(1);

    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", tid)
      )
      .take(50);

    const homework = await ctx.db
      .query("homework")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", tid)
      )
      .take(50);

    const students = await ctx.db
      .query("users")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", tid)
      )
      .take(1);

    return {
      hasStudents: students.length > 0,
      hasAvailability: vacancies.length > 0,
      hasMeetLink: !!user.meetLink,
      hasSession: lessons.some((l) => l.status !== "scheduled"),
      hasPublished: lessons.some((l) => l.status === "published"),
      hasHomework: homework.some((h) => h.status !== "draft"),
    };
  },
});
