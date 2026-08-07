// Pre-launch data reset. Wipes transactional/test data from every tenant but
// KEEPS people (`users`) and academy config (settings, pricing, FX, prompt
// configs, achievement definitions, certificate templates, library content).
//
// Internal-only (never exposed to the public API). Run via:
//   npx convex run maintenance:_wipeOldData
// It deletes in bounded batches and re-schedules itself until everything is
// gone, so it never exceeds a single transaction's limits.

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";

// Everything transactional. NOT here (kept): users, tenantSettings,
// pointPackages, exchangeRates, promptConfigs, achievements,
// certificateTemplates, libraryMaterials.
const WIPE_TABLES: TableNames[] = [
  "scheduleEvents",
  "teacherVacancies",
  "slotExceptions",
  "recurringBookings",
  "studentPauses",
  "rescheduleRequests",
  "studentRescheduleQuota",
  "makeupCredits",
  "scheduleEnrollments",
  "lessons",
  "lessonVocabulary",
  "lessonFlashcards",
  "lessonQuizQuestions",
  "inLessonQuizDrafts",
  "homework",
  "srsDecks",
  "srsCards",
  "reviewLogs",
  "quizAttempts",
  "studySessions",
  "streaks",
  "studentAchievements",
  "studentOnboarding",
  "studentProfiles",
  "pointGrants",
  "pointTransactions",
  "priceMigrationAudit",
  "billingRecords",
  "expenses",
  "notifications",
  "permissionRequests",
  "teacherInvites",
  "issuedCertificates",
  "libraryWordLookups",
];

const BATCH = 100;

export const _wipeOldData = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number; done: boolean }> => {
    let deleted = 0;

    // Clear one table's batch at a time; reschedule the moment a table still
    // has a full batch left so each invocation stays well within limits.
    for (const table of WIPE_TABLES) {
      const rows = await ctx.db.query(table).take(BATCH);
      for (const r of rows) {
        await ctx.db.delete(r._id);
        deleted++;
      }
      if (rows.length === BATCH) {
        await ctx.scheduler.runAfter(0, internal.maintenance._wipeOldData, {});
        return { deleted, done: false };
      }
    }

    // Then the stored files (lesson recordings/audio) — orphaned once their
    // lesson rows are gone.
    const blobs = await ctx.db.system.query("_storage").take(BATCH);
    for (const b of blobs) {
      await ctx.storage.delete(b._id);
      deleted++;
    }
    if (blobs.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.maintenance._wipeOldData, {});
      return { deleted, done: false };
    }

    return { deleted, done: true };
  },
});

/** Dev helper — set a user's locale (used to exercise translation paths). */
export const _devSetLocale = internalMutation({
  args: { email: v.string(), locale: v.string() },
  handler: async (ctx, { email, locale }) => {
    const u = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), email))
      .first();
    if (!u) throw new Error("User not found");
    await ctx.db.patch(u._id, { locale: locale as any });
    return { ok: true, name: u.name };
  },
});

/**
 * Dev-only: delete every library material (and its stored file).
 *
 * `_wipeOldData` deliberately KEEPS library content — it's academy content,
 * not transactional data. This is the separate, explicit switch for when the
 * library itself is test material.
 */
export const _wipeLibrary = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    let deleted = 0;
    const rows = await ctx.db.query("libraryMaterials").take(500);
    for (const r of rows) {
      if (r.audioFileId) {
        await ctx.storage.delete(r.audioFileId).catch(() => {});
      }
      await ctx.db.delete(r._id);
      deleted++;
    }
    return { deleted };
  },
});

/**
 * Dev-only: drop seeded placeholder people.
 *
 * Seeded users have a synthetic `externalId` (`seed-…`) — no Clerk identity
 * behind them — so they can never sign in and only clutter rosters.
 */
export const _deleteSeedUsers = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: string[] }> => {
    const rows = await ctx.db.query("users").take(500);
    const deleted: string[] = [];
    for (const u of rows) {
      if (!u.externalId.startsWith("seed-")) continue;
      await ctx.db.delete(u._id);
      deleted.push(`${u.name} <${u.email}>`);
    }
    return { deleted };
  },
});

/**
 * Dev-only: return a student to day one.
 *
 * `_wipeOldData` clears their history; this clears the flags that outlive it,
 * so the next sign-in walks the real onboarding flow (including the native
 * language question that drives every flashcard translation) and the trial
 * grant fires as it would for a genuine new student. The teacher pairing is
 * academy setup, not student history, so it stays.
 */
export const _resetStudent = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<{ reset: string }> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_organization_and_email", (q) => q)
      .filter((q) => q.eq(q.field("email"), email))
      .first();
    if (!user) throw new Error(`No user ${email}`);
    await ctx.db.patch(user._id, {
      onboardingComplete: false,
      studentStatus: "trial",
      pausedFrom: undefined,
      pausedUntil: undefined,
      pauseReason: undefined,
      // An old calendar subscription shouldn't survive a reset.
      icsToken: undefined,
    });
    return { reset: `${user.name} <${user.email}>` };
  },
});

/**
 * Dev-only: send a teacher back through their onboarding wizard.
 *
 * Clears the setup the wizard writes — but NOT their availability, students
 * or pay: those are academy state, not onboarding state, and wiping them to
 * re-test a four-step form would be a much bigger reset than anyone asked for.
 */
export const _resetTeacher = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }): Promise<{ reset: string }> => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_organization_and_email", (q) => q)
      .filter((q) => q.eq(q.field("email"), email))
      .first();
    if (!user) throw new Error(`No user ${email}`);
    if (user.role !== "teacher") throw new Error(`${email} is not a teacher`);
    await ctx.db.patch(user._id, {
      onboardingComplete: false,
      recordingConsentAt: undefined,
      bio: undefined,
      ieltsCertified: undefined,
    });
    return { reset: `${user.name} <${user.email}>` };
  },
});
