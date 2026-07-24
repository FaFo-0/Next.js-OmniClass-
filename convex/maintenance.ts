// Pre-launch data reset. Wipes transactional/test data from every tenant but
// KEEPS people (`users`) and academy config (settings, pricing, FX, prompt
// configs, achievement definitions, certificate templates, library content).
//
// Internal-only (never exposed to the public API). Run via:
//   npx convex run maintenance:_wipeOldData
// It deletes in bounded batches and re-schedules itself until everything is
// gone, so it never exceeds a single transaction's limits.

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
