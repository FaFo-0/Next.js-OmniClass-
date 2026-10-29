// Pre-launch data reset. Wipes transactional/test data from every tenant but
// KEEPS people (`users`) and academy config (settings, pricing, FX, prompt
// configs, achievement definitions, certificate templates, library content).
//
// Internal-only (never exposed to the public API). Run via:
//   npx convex run maintenance:_wipeOldData
// It deletes in bounded batches and re-schedules itself until everything is
// gone, so it never exceeds a single transaction's limits.

import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";

// Everything transactional. NOT here (kept): users, tenantSettings,
// exchangeRates, promptConfigs, achievements,
// certificateTemplates, libraryWorks/libraryUnits.
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
  "expenses",
  "notifications",
  "permissionRequests",
  "teacherInvites",
  "issuedCertificates",
  "libraryWordLookups",
  "vocabularyOccurrences",
  "lessonTranscriptUtterances",
];

const BATCH = 100;
const LEGACY_VOCAB_CUTOFF = new Date("2026-07-29T00:00:00.000Z").getTime();
const localeArg = v.union(v.literal("en"), v.literal("ru"), v.literal("ar"), v.literal("kk"));

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
  args: { email: v.string(), locale: localeArg },
  handler: async (ctx, { email, locale }) => {
    const u = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), email))
      .first();
    if (!u) throw new Error("User not found");
    await ctx.db.patch(u._id, { locale });
    return { ok: true, name: u.name };
  },
});

/**
 * Dev-only: delete every library reading (works, units, progress) and any
 * stored cover file.
 *
 * `_wipeOldData` deliberately KEEPS library content — it's academy content,
 * not transactional data. This is the separate, explicit switch for when the
 * library itself is test material.
 */
export const _wipeLibrary = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    let deleted = 0;
    const works = await ctx.db.query("libraryWorks").take(500);
    for (const w of works) {
      if (w.coverImageId) {
        await ctx.storage.delete(w.coverImageId).catch(() => {});
      }
      await ctx.db.delete(w._id);
      deleted++;
    }
    const units = await ctx.db.query("libraryUnits").take(5000);
    for (const u of units) {
      await ctx.db.delete(u._id);
      deleted++;
    }
    const progress = await ctx.db.query("libraryProgress").take(5000);
    for (const p of progress) {
      await ctx.db.delete(p._id);
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

/**
 * Preview the one-time cleanup for development-era lesson vocabulary rows
 * without definitions. The delete path is internal-only and requires an
 * explicit confirmation token; reviewed or independently saved learner cards
 * are never included.
 */
export const previewMissingLessonDefinitions = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("lessonVocabulary").collect();
    const missing = rows.filter(
      (row) => row._creationTime < LEGACY_VOCAB_CUTOFF && !row.definition?.trim()
    );
    const missingLessonIds = new Set(missing.map((row) => row.lessonId));
    const cards = await ctx.db.query("srsCards").collect();
    const candidateCardRows = cards.filter(
      (card) =>
        card.sourceLessonId &&
        missingLessonIds.has(card.sourceLessonId) &&
        card.addedBy === "system" &&
        !card.sourceWorkId &&
        !card.firstReviewedAt &&
        !card.isDeleted
    );
    return {
      lessonVocabularyRows: missing.length,
      candidateCardRows: candidateCardRows.length,
    };
  },
});

export const cleanupMissingLessonDefinitions = internalMutation({
  args: { confirmation: v.literal("DELETE_MISSING_DEFINITIONS") },
  handler: async (ctx) => {
    const rows = (await ctx.db.query("lessonVocabulary").collect()).filter(
      (row) => row._creationTime < LEGACY_VOCAB_CUTOFF && !row.definition?.trim()
    );
    const cards = await ctx.db.query("srsCards").collect();
    const lessonIds = new Set(rows.map((row) => row.lessonId));
    let cardsSoftDeleted = 0;
    for (const card of cards) {
      if (
        card.sourceLessonId &&
        lessonIds.has(card.sourceLessonId) &&
        card.addedBy === "system" &&
        !card.sourceWorkId &&
        !card.firstReviewedAt &&
        !card.isDeleted
      ) {
        await ctx.db.patch(card._id, {
          isDeleted: true,
          deletedAt: new Date().toISOString(),
        });
        cardsSoftDeleted++;
      }
    }
    for (const row of rows) await ctx.db.delete(row._id);
    return { lessonVocabularyRowsDeleted: rows.length, cardsSoftDeleted };
  },
});

// ════════════════════════════════════════════════════════════════════════════
//  Permanent account/data removal (operator tool, internal-only)
// ════════════════════════════════════════════════════════════════════════════
//
// Used to remove an account and every row that belongs to it — not the soft
// `role: "removed"` archive the admin UI does, which keeps the data. Nothing
// here is reachable from the client; it runs from a terminal:
//
//   npx convex run maintenance:_purgeAccountData \
//     '{"targets":["user_..."],"accountIds":["user_..."],"deleteAccounts":true,
//       "extraTables":[],"apply":false}' --prod
//
// Rows are found by reference, not by a hand-written field list: a document is
// deleted when any of its string values contains a target id. That is repeated
// in passes so children follow their parents (lesson → transcript/vocabulary,
// deck → cards, order → grant → ledger transaction, event → notifications,
// …). `_purgeLeftoverReferences` then proves the result by scanning every
// table for any surviving reference.
//
// Kept deliberately: the account row itself when `deleteAccounts` is false,
// and everything the account's teacher owns outside those lessons.

/** Student-owned tables worth scanning. Library/academy content and the
 *  teacher's own availability are scanned for leftovers by the verifier
 *  instead — they never hold a student reference. */
const PURGE_TABLES: TableNames[] = [
  "users",
  "lessons",
  "lessonVocabulary",
  "lessonTranscriptUtterances",
  "lessonFlashcards",
  "lessonQuizQuestions",
  "inLessonQuizDrafts",
  "homework",
  "scheduleEvents",
  "calendarBookingRequests",
  "rescheduleRequests",
  "studentRescheduleQuota",
  "makeupCredits",
  "pointGrants",
  "pointTransactions",
  "studentOnboarding",
  "studentPauses",
  "recurringBookings",
  "scheduleEnrollments",
  "attentionDismissals",
  "notifications",
  "issuedCertificates",
  "studentAchievements",
  "srsDecks",
  "srsCards",
  "reviewLogs",
  "vocabularyOccurrences",
  "quizAttempts",
  "studySessions",
  "streaks",
  "studentProfiles",
  "libraryProgress",
  "libraryWordLookups",
  "payrollRuns",
  "billingOrders",
  "billingDiscountRedemptions",
  "billingDiscountEligibleStudents",
  "financeEntries",
  "financeReminders",
  "expenses",
  "permissionRequests",
  "teacherInvites",
  "slotExceptions",
  "calendarAvailabilityChanges",
  "teacherVacancies",
];

/** Every table in the schema — the verifier's reach. */
const ALL_TABLES: TableNames[] = [
  "tenantSettings", "users", "lessons", "lessonVocabulary", "lessonTranscriptUtterances",
  "lessonFlashcards", "lessonQuizQuestions", "inLessonQuizDrafts", "libraryWordLookups",
  "libraryWorks", "libraryUnitBodies", "libraryUnits", "libraryPreparationUsage",
  "libraryVocabularyBatches", "libraryProgress", "srsDecks", "srsCards", "reviewLogs",
  "vocabularyOccurrences", "quizAttempts", "achievements", "studentAchievements", "streaks",
  "studySessions", "scheduleEvents", "calendarAvailabilityChanges", "calendarBookingRequests",
  "rescheduleRequests", "studentRescheduleQuota", "makeupCredits", "pointGrants",
  "pointTransactions", "studentOnboarding", "teacherVacancies", "studentPauses",
  "recurringBookings", "slotExceptions", "teacherInvites", "scheduleEnrollments",
  "attentionDismissals", "notifications", "permissionRequests", "aiModelCatalog",
  "promptConfigs", "certificateTemplates", "issuedCertificates", "studentProfiles",
  "packFamilies", "packs", "billingFamilies", "billingPlans", "billingPlanVersions",
  "billingPlanBenefits", "billingDiscounts", "billingDiscountEligibleStudents",
  "billingDiscountRedemptions", "discountCodes", "billingOrders", "expenses", "financeEntries",
  "financeReminders", "payrollRuns", "fxDaily", "exchangeRates", "homework",
];

const PURGE_PASSES = 3;

async function sweepTable<T extends TableNames>(
  ctx: MutationCtx,
  table: T,
  state: {
    targets: Set<string>;
    removed: Set<string>;
    counts: Map<string, number>;
    storageIds: Set<string>;
    eventTeacherIds: Set<string>;
    removedEventDates: Set<string>;
    accountIds: Set<string>;
    deleteAccounts: boolean;
    apply: boolean;
  }
) {
  const rows = await ctx.db.query(table).collect();
  for (const row of rows) {
    // A later pass re-reads the same rows; skip what this run already took so
    // nothing is counted or deleted twice.
    if (state.removed.has(row._id)) continue;
    const flat = JSON.stringify(row);
    let hit = false;
    for (const id of state.targets) {
      if (flat.includes(id)) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;

    if (table === "users") {
      const externalId = (row as { externalId?: string }).externalId ?? "";
      // Only the accounts named in this run lose their row; a kept login
      // survives with its data gone.
      if (!state.deleteAccounts || !state.accountIds.has(externalId)) continue;
    }
    if (table === "scheduleEvents") {
      const event = row as { teacherId?: string; date?: string };
      if (event.teacherId) state.eventTeacherIds.add(event.teacherId);
      if (event.date) state.removedEventDates.add(event.date);
    }
    if (table === "lessons") {
      const audioFileId = (row as { audioFileId?: string }).audioFileId;
      if (audioFileId) state.storageIds.add(audioFileId);
    }

    state.counts.set(table, (state.counts.get(table) ?? 0) + 1);
    state.removed.add(row._id);
    state.targets.add(row._id);
    if (state.apply) await ctx.db.delete(row._id);
  }
}

export const _purgeAccountData = internalMutation({
  args: {
    /** Account ids (Clerk `externalId`s) whose rows go. */
    targets: v.array(v.string()),
    /** Subset of `targets` whose `users` row may be deleted. */
    accountIds: v.array(v.string()),
    deleteAccounts: v.boolean(),
    /** false = count only, change nothing (review the numbers first). */
    apply: v.boolean(),
  },
  handler: async (ctx, args) => {
    const state = {
      targets: new Set(args.targets),
      removed: new Set<string>(),
      counts: new Map<string, number>(),
      storageIds: new Set<string>(),
      eventTeacherIds: new Set<string>(),
      removedEventDates: new Set<string>(),
      accountIds: new Set(args.accountIds),
      deleteAccounts: args.deleteAccounts,
      apply: args.apply,
    };

    // Session dates are read up front: inside one transaction the later reads
    // still return rows this run deleted, so the survivor set cannot be
    // re-derived from the table afterwards.
    const allEventDates = new Set(
      (await ctx.db.query("scheduleEvents").collect()).map((event) => event.date)
    );

    let passes = 0;
    for (let pass = 0; pass < PURGE_PASSES; pass++) {
      const before = state.removed.size;
      passes++;
      for (const table of PURGE_TABLES) await sweepTable(ctx, table, state);
      if (state.removed.size === before) break;
    }

    // Session notifications to a teacher carry no ids, only the session date,
    // so they are matched by the date of a session this run removed. A
    // notification naming a date that still has a surviving session is kept.
    const survivingDates = [...allEventDates].filter((d) => !state.removedEventDates.has(d));
    const orphanNotifications: string[] = [];
    if (state.eventTeacherIds.size) {
      for (const note of await ctx.db.query("notifications").collect()) {
        if (state.removed.has(note._id)) continue;
        const payload = note.payload as { date?: string; fromDate?: string; toDate?: string };
        if (!state.eventTeacherIds.has(note.recipientId)) continue;
        if (!note.kind.startsWith("lesson_")) continue;
        const dates = [payload.date, payload.fromDate, payload.toDate].filter(
          (d): d is string => typeof d === "string"
        );
        if (!dates.some((d) => state.removedEventDates.has(d))) continue;
        if (dates.some((d) => survivingDates.includes(d))) continue;
        orphanNotifications.push(note._id);
        state.counts.set("notifications", (state.counts.get("notifications") ?? 0) + 1);
        if (state.apply) await ctx.db.delete(note._id);
      }
    }

    // Recordings are stored outside the tables; they follow their lesson.
    if (state.apply) {
      for (const fileId of state.storageIds) {
        await ctx.storage.delete(fileId as Parameters<typeof ctx.storage.delete>[0]);
      }
    }

    return {
      applied: args.apply,
      passes,
      documentsDeleted: [...state.counts.values()].reduce((a, b) => a + b, 0),
      byTable: Object.fromEntries([...state.counts.entries()].sort((a, b) => b[1] - a[1])),
      recordingsDeleted: state.storageIds.size,
      teacherSessionNotificationsDeleted: orphanNotifications.length,
    };
  },
});

/** Read-only proof: does any surviving row still reference a target id?
 *  `expectedKept` lists accounts deliberately left in place — their own row
 *  references itself, which is not a leftover. */
export const _purgeLeftoverReferences = internalQuery({
  args: { targets: v.array(v.string()), expectedKept: v.array(v.string()) },
  handler: async (ctx, { targets, expectedKept }) => {
    const kept = new Set(expectedKept);
    const leftovers: Record<string, string[]> = {};
    for (const table of ALL_TABLES) {
      const rows = await ctx.db.query(table).collect();
      const hits = rows
        .filter((row) => {
          if (table === "users") {
            const externalId = (row as { externalId?: string }).externalId ?? "";
            if (kept.has(externalId)) return false;
          }
          const flat = JSON.stringify(row);
          return targets.some((id) => flat.includes(id));
        })
        .map((row) => row._id as string);
      if (hits.length) leftovers[table] = hits;
    }
    return { clean: Object.keys(leftovers).length === 0, leftovers };
  },
});
