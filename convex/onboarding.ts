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
import { DEFAULT_TRIAL_POLICY } from "./tenantSettings";

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
    preferredDays: v.optional(v.array(v.string())),
    preferredTimeOfDay: v.optional(v.array(v.string())),
    interests: v.optional(v.array(v.string())),
    country: v.optional(v.string()),
    referralSource: v.optional(v.string()),
    /** POLICY §8 — recording + AI consent. Required to finish. */
    consent: v.boolean(),
    /** Everything they'll ever see a lesson time in. */
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, rawArgs) => {
    const { consent, timezone, ...args } = rawArgs;
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "student") {
      throw new Error("Only students complete student onboarding");
    }
    if (!consent) {
      throw new Error(
        "Lessons are recorded to build your notes — we need your agreement to continue."
      );
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
        consentAcceptedAt: existing.consentAcceptedAt ?? now,
        completedAt: now,
      });
    } else {
      await ctx.db.insert("studentOnboarding", {
        organizationId: orgId,
        studentId: user.externalId,
        ...args,
        consentAcceptedAt: now,
        completedAt: now,
      });
    }

    // Mirror onto the users row: phone for contact, timezone because every
    // lesson time in the app is rendered through it.
    await ctx.db.patch(user._id, {
      onboardingComplete: true,
      phoneWhatsapp: args.phoneWhatsapp,
      ...(timezone ? { timezone } : {}),
    });

    // Trial grant — only on first completion, only if enabled + free.
    const firstTime = !existing;
    let granted = 0;
    if (firstTime) {
      const settings = await ctx.db
        .query("tenantSettings")
        .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
        .unique();
      const policy = settings?.trialPolicy ?? DEFAULT_TRIAL_POLICY;
      if (policy.enabled && !policy.requiresPayment && policy.points > 0) {
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
          notes: `Free trial — ${policy.points} lesson${policy.points === 1 ? "" : "s"} for ${policy.durationDays} days`,
        });
        granted = policy.points;
      }
    }
    // Report what actually landed — the welcome message reads this rather
    // than re-deriving the policy on the client.
    return { firstTime, trialLessonsGranted: granted };
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
    // One source of truth. This used to carry its own inline fallback (5
    // lessons) while the granting mutation had none at all — so a tenant
    // without an explicit policy promised the student five lessons on the
    // welcome screen and granted zero.
    return settings?.trialPolicy ?? DEFAULT_TRIAL_POLICY;
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

/**
 * Teacher onboarding.
 *
 * A teacher arriving from an invite link previously landed straight on the
 * calendar with nothing set: no timezone (so every time they read was a
 * guess), no meeting room (so lessons had nowhere to happen), no availability
 * (so nobody could book them). These are the three facts the rest of the
 * platform reads constantly, so they're asked for once, up front.
 */
export const completeTeacherOnboarding = mutation({
  args: {
    timezone: v.string(),
    meetLink: v.string(),
    phoneWhatsapp: v.optional(v.string()),
    /** Weekly working hours — one range per selected weekday. */
    weekly: v.optional(
      v.object({
        days: v.array(v.number()), // 0=Sun … 6=Sat
        startTime: v.string(), // "HH:mm", academy wall-clock
        endTime: v.string(),
      })
    ),
  },
  handler: async (ctx, { timezone, meetLink, phoneWhatsapp, weekly }) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher") {
      throw new Error("Only teachers complete teacher onboarding");
    }
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      throw new Error("Unknown timezone");
    }

    await ctx.db.patch(user._id, {
      timezone,
      meetLink: meetLink.trim() || undefined,
      ...(phoneWhatsapp ? { phoneWhatsapp } : {}),
      onboardingComplete: true,
    });

    // Optional starting availability. Written as ordinary weekly vacancies, so
    // it's the same data the calendar paints — nothing special about it.
    let created = 0;
    if (weekly && weekly.days.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      for (const day of weekly.days) {
        const clash = await ctx.db
          .query("teacherVacancies")
          .withIndex("by_organization_and_teacherId", (q) =>
            q.eq("organizationId", orgId).eq("teacherId", user.externalId)
          )
          .filter((q) => q.eq(q.field("dayOfWeek"), day))
          .first();
        if (clash) continue;
        await ctx.db.insert("teacherVacancies", {
          organizationId: orgId,
          teacherId: user.externalId,
          dayOfWeek: day,
          startTime: weekly.startTime,
          endTime: weekly.endTime,
          validFrom: today,
          isActive: true,
          createdAt: new Date().toISOString(),
        });
        created++;
      }
    }
    return { slotsCreated: created };
  },
});

/** What the teacher wizard needs to prefill itself. */
export const getMyTeacherSetup = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher") return null;
    const vacancies = await ctx.db
      .query("teacherVacancies")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", user.externalId)
      )
      .take(1);
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    return {
      name: user.name,
      timezone: user.timezone ?? null,
      meetLink: user.meetLink ?? null,
      phoneWhatsapp: user.phoneWhatsapp ?? null,
      hasAvailability: vacancies.length > 0,
      academyTimezone: settings?.timezone ?? "UTC",
      academyName: settings?.name ?? "the academy",
    };
  },
});
