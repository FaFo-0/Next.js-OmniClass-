// Org-scoped seed for Omnica English. Run once per org.
//
// Usage:
//   npx convex run seed:seedOmnicaEnglish '{"organizationId":"org_xxx","adminEmail":"you@example.com","adminName":"Mustafa"}'
//
// Idempotent: safe to re-run; skips rows that already exist for the org.

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { defaultPromptConfigs } from "./lib/defaultPrompts";

const OMNICA_DEFAULTS = {
  name: "Omnica English",
  tagline: "Speak English with confidence.",
  logoUrl: "/brand/tenant/logo.svg",
  logoDarkUrl: "/brand/tenant/logo-dark.svg",
  faviconUrl: "/brand/tenant/favicon.svg",
  supportEmail: "hello@omnica.app",
  websiteUrl: "https://omnica.app",
  primaryColor: "#6716A4",
  primaryColorHover: "#581289",
  backgroundColor: "#FFCA00",
  defaultLocale: "en" as const,
  enabledLocales: ["en", "ru", "ar"],
  timezone: "Asia/Bishkek",
  baseCurrency: "USD",
  maxReschedulesPerMonth: 4,
  rescheduleWindowHours: 6,
  cancelWindowHours: 24,
  defaultLessonDurationMinutes: 60,
  noShowConsumesLesson: true,
  features: {
    gamification: true,
    achievements: true,
    library: true,
    liveQuizGen: true,
    payments: false,
  },
  ai: {
    sonioxCostPerMinute: 0.0067,
    avgLessonMinutes: 60,
  },
};

const DEFAULT_ACHIEVEMENTS = [
  { externalId: "first_lesson", name: "First Steps", description: "Complete your first lesson", icon: "🎯", conditionType: "lessons_completed" as const, conditionThreshold: 1 },
  { externalId: "five_lessons", name: "Getting Started", description: "Complete 5 lessons", icon: "📚", conditionType: "lessons_completed" as const, conditionThreshold: 5 },
  { externalId: "ten_lessons", name: "Dedicated Learner", description: "Complete 10 lessons", icon: "🎓", conditionType: "lessons_completed" as const, conditionThreshold: 10 },
  { externalId: "first_review", name: "First Review", description: "Review your first flashcard", icon: "🃏", conditionType: "cards_reviewed" as const, conditionThreshold: 1 },
  { externalId: "fifty_reviews", name: "Card Master", description: "Review 50 flashcards", icon: "🏆", conditionType: "cards_reviewed" as const, conditionThreshold: 50 },
  { externalId: "two_hundred_reviews", name: "Card Champion", description: "Review 200 flashcards", icon: "⭐", conditionType: "cards_reviewed" as const, conditionThreshold: 200 },
  { externalId: "perfect_quiz", name: "Quiz Whiz", description: "Score 100% on a quiz", icon: "💯", conditionType: "quiz_perfect" as const, conditionThreshold: 1 },
  { externalId: "five_perfect_quizzes", name: "Quiz Master", description: "Score 100% on 5 quizzes", icon: "🥇", conditionType: "quiz_perfect" as const, conditionThreshold: 5 },
  { externalId: "week_streak", name: "Week Warrior", description: "Maintain a 7-day streak", icon: "🔥", conditionType: "streak_days" as const, conditionThreshold: 7 },
  { externalId: "month_streak", name: "Monthly Maven", description: "Maintain a 30-day streak", icon: "💪", conditionType: "streak_days" as const, conditionThreshold: 30 },
  { externalId: "hundred_words", name: "Word Collector", description: "Learn 100 vocabulary words", icon: "📖", conditionType: "vocab_learned" as const, conditionThreshold: 100 },
];

export const seedOmnicaEnglish = internalMutation({
  args: {
    organizationId: v.string(),
    adminEmail: v.string(),
    adminName: v.optional(v.string()),
  },
  handler: async (ctx, { organizationId, adminEmail, adminName }) => {
    const now = new Date().toISOString();

    // 1. tenantSettings
    const existingSettings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (!existingSettings) {
      await ctx.db.insert("tenantSettings", {
        organizationId,
        ...OMNICA_DEFAULTS,
        createdAt: now,
      });
    }

    // 2. AI prompt configs
    const existingPrompts = await ctx.db
      .query("promptConfigs")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect();
    const haveConfigIds = new Set(existingPrompts.map((p) => p.configId));
    for (const config of defaultPromptConfigs) {
      if (!haveConfigIds.has(config.configId)) {
        await ctx.db.insert("promptConfigs", {
          organizationId,
          ...config,
        });
      }
    }

    // 3. Achievements
    const existingAch = await ctx.db
      .query("achievements")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect();
    const haveAch = new Set(existingAch.map((a) => a.externalId));
    for (const ach of DEFAULT_ACHIEVEMENTS) {
      if (!haveAch.has(ach.externalId)) {
        await ctx.db.insert("achievements", { organizationId, ...ach });
      }
    }

    // 4. Pre-create admin row by email so first sign-in links to it.
    const existingAdmin = await ctx.db
      .query("users")
      .withIndex("by_organization_and_email", (q) =>
        q.eq("organizationId", organizationId).eq("email", adminEmail)
      )
      .unique();
    if (!existingAdmin) {
      await ctx.db.insert("users", {
        organizationId,
        externalId: `seed-admin-${organizationId}`,
        name: adminName ?? "Admin",
        email: adminEmail,
        role: "admin",
        createdAt: now,
      });
    }

    return { ok: true, organizationId };
  },
});
