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

/** "HH:mm", 00:00–23:59. Times are compared as strings elsewhere, so the
 *  zero-padding this enforces is load-bearing, not cosmetic. */
const isHHmm = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

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
    name: v.string(),
    timezone: v.string(),
    timeFormat: v.union(v.literal("12h"), v.literal("24h")),
    locale: v.union(v.literal("en"), v.literal("ru"), v.literal("ar")),
    meetLink: v.string(),
    phoneWhatsapp: v.optional(v.string()),
    bio: v.optional(v.string()),
    ieltsCertified: v.boolean(),
    /** POLICY §8 — the teacher is recorded too. Required to finish. */
    consent: v.boolean(),
    /** Weekly working hours — one range per selected weekday. */
    weekly: v.optional(
      v.object({
        days: v.array(v.number()), // 0=Sun … 6=Sat
        startTime: v.string(), // "HH:mm", academy wall-clock
        endTime: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher") {
      throw new Error("Only teachers complete teacher onboarding");
    }

    // Everything below is validated here rather than only in the wizard: the
    // mutation is public, so the client's rules are a courtesy, not a fence.
    const name = args.name.trim();
    if (!name) throw new Error("Name cannot be empty");

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: args.timezone });
    } catch {
      throw new Error("Unknown timezone");
    }

    const meetLink = args.meetLink.trim();
    if (!/^https?:\/\/\S+\.\S+/i.test(meetLink)) {
      throw new Error("Enter a full meeting link starting with https://");
    }

    if (!args.consent) {
      throw new Error(
        "Lessons are recorded to build the student's notes — we need your agreement to continue."
      );
    }

    // Weekly hours: shape-check before anything is written, so a rejected
    // range can't leave half the days inserted.
    let weekly: { days: number[]; startTime: string; endTime: string } | null =
      null;
    if (args.weekly && args.weekly.days.length > 0) {
      const { startTime, endTime } = args.weekly;
      if (!isHHmm(startTime) || !isHHmm(endTime)) {
        throw new Error("Working hours must look like 09:00");
      }
      if (startTime >= endTime) {
        throw new Error("The finish time must be after the start time");
      }
      const days = [...new Set(args.weekly.days)];
      if (days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        throw new Error("Weekday must be 0 (Sunday) through 6 (Saturday)");
      }
      weekly = { days, startTime, endTime };
    }

    const bio = args.bio?.trim();
    await ctx.db.patch(user._id, {
      name,
      timezone: args.timezone,
      timeFormat: args.timeFormat,
      locale: args.locale,
      meetLink,
      ieltsCertified: args.ieltsCertified,
      bio: bio || undefined,
      phoneWhatsapp: args.phoneWhatsapp?.trim() || undefined,
      // Re-running the wizard shouldn't re-date a consent already given.
      recordingConsentAt: user.recordingConsentAt ?? NOW(),
      onboardingComplete: true,
    });

    // Optional starting availability. Written as ordinary weekly vacancies, so
    // it's the same data the calendar paints — nothing special about it.
    let created = 0;
    let skipped = 0;
    if (weekly) {
      const today = new Date().toISOString().slice(0, 10);
      for (const day of weekly.days) {
        // Only an ACTIVE row is a real clash. Matching on any row meant a
        // teacher who had switched Monday off could never re-open it here,
        // and the wizard reported success having written nothing.
        const existing = await ctx.db
          .query("teacherVacancies")
          .withIndex("by_organization_and_teacherId_and_dayOfWeek", (q) =>
            q
              .eq("organizationId", orgId)
              .eq("teacherId", user.externalId)
              .eq("dayOfWeek", day)
          )
          .take(20);
        if (existing.some((v) => v.isActive)) {
          skipped++;
          continue;
        }
        await ctx.db.insert("teacherVacancies", {
          organizationId: orgId,
          teacherId: user.externalId,
          dayOfWeek: day,
          startTime: weekly.startTime,
          endTime: weekly.endTime,
          validFrom: today,
          isActive: true,
          createdAt: NOW(),
        });
        created++;
      }
    }
    // `skipped` is reported so the wizard can say "already open" instead of
    // claiming a silent success.
    return { slotsCreated: created, slotsAlreadyOpen: skipped };
  },
});

/** What the teacher wizard needs to prefill itself. */
export const getMyTeacherSetup = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    if (user.role !== "teacher") return null;
    // The wizard prefills its weekday chips from what's already open, so a
    // teacher re-running it sees their real schedule rather than a Mon–Fri
    // default that would then be skipped as a clash.
    const vacancies = await ctx.db
      .query("teacherVacancies")
      .withIndex("by_organization_and_teacherId", (q) =>
        q.eq("organizationId", orgId).eq("teacherId", user.externalId)
      )
      .take(50);
    const active = vacancies.filter((v) => v.isActive);
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .unique();
    return {
      name: user.name,
      timezone: user.timezone ?? null,
      timeFormat: user.timeFormat ?? null,
      locale: user.locale ?? null,
      meetLink: user.meetLink ?? null,
      phoneWhatsapp: user.phoneWhatsapp ?? null,
      bio: user.bio ?? null,
      ieltsCertified: user.ieltsCertified ?? false,
      consentGiven: !!user.recordingConsentAt,
      onboardingComplete: user.onboardingComplete === true,
      openDays: [...new Set(active.map((v) => v.dayOfWeek))].sort(),
      openStart: active[0]?.startTime ?? null,
      openEnd: active[0]?.endTime ?? null,
      academyTimezone: settings?.timezone ?? "UTC",
      academyName: settings?.name ?? "the academy",
    };
  },
});
