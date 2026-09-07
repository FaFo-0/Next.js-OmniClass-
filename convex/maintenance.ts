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
  "priceMigrationAudit",
  "billingRecords",
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
 * Launch-config sync (POLICY §1/§3 — run once, idempotent, admin-invoked):
 *   - flips every tenant's trialPolicy to the PAID admin-booked model
 *     (1,500 ₸, once per student; onboarding never auto-grants),
 *   - seeds/updates the exact central-Asia pack table (Lite 4 / Standard 8 /
 *     Intensive 12 at 15,000/26,000/36,000 ₸, 60-day expiry),
 *   - archives stale launch rows ONLY when nothing real references them
 *     (a pack with purchase history is never rewritten or deactivated).
 * Run: npx convex run maintenance:_syncLaunchConfig
 */
export const _syncLaunchConfig = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tenants = await ctx.db.query("tenantSettings").collect();
    let trialFlipped = 0;
    let packsSeeded = 0;
    let packsUpdated = 0;
    let packsArchived = 0;

    for (const settings of tenants) {
      // 1) Trial policy — paid admin-booked trial, no auto-grant.
      const cur = settings.trialPolicy;
      if (!cur || cur.requiresPayment !== true) {
        await ctx.db.patch(settings._id, {
          trialPolicy: {
            enabled: true,
            points: 1,
            requiresPayment: true,
            durationDays: 0,
          },
        });
        trialFlipped++;
      }

      // 2) Launch pack table (externalId = stable identity across edits).
      const targets = [
        { externalId: "ca-lite-4", name: "Lite", points: 4, priceLocal: 15000, priceUSD: 32, sortOrder: 10 },
        { externalId: "ca-standard-8", name: "Standard", points: 8, priceLocal: 26000, priceUSD: 56, sortOrder: 20 },
        { externalId: "ca-intensive-12", name: "Intensive", points: 12, priceLocal: 36000, priceUSD: 77, sortOrder: 30 },
      ];
      const orgPacks = await ctx.db
        .query("pointPackages")
        .withIndex("by_organization", (q) => q.eq("organizationId", settings.organizationId))
        .collect();

      // A pack is "referenced" by real money/lessons — never touch those.
      const referencedIds = new Set<string>();
      const grants = await ctx.db
        .query("pointGrants")
        .withIndex("by_organization", (q) => q.eq("organizationId", settings.organizationId))
        .collect();
      for (const g of grants) if (g.packageId) referencedIds.add(g.packageId as unknown as string);
      const payments = await ctx.db
        .query("paymentEvents")
        .withIndex("by_organization", (q) => q.eq("organizationId", settings.organizationId))
        .collect();
      for (const p of payments) if (p.packageId) referencedIds.add(p.packageId as unknown as string);

      for (const t of targets) {
        const row = orgPacks.find((p) => p.externalId === t.externalId);
        if (!row) {
          await ctx.db.insert("pointPackages", {
            organizationId: settings.organizationId,
            externalId: t.externalId,
            name: t.name,
            points: t.points,
            priceUSD: t.priceUSD,
            region: "central_asia",
            currency: "KZT",
            priceLocal: t.priceLocal,
            expiryDays: 60,
            isActive: true,
            sortOrder: t.sortOrder,
            effectiveFrom: new Date().toISOString().slice(0, 10),
            createdAt: new Date().toISOString(),
          });
          packsSeeded++;
        } else if (!referencedIds.has(row._id as unknown as string)) {
          // Same identity, nothing bought under it — safe to align with the
          // confirmed launch price.
          await ctx.db.patch(row._id, {
            name: t.name,
            points: t.points,
            priceLocal: t.priceLocal,
            priceUSD: t.priceUSD,
            expiryDays: 60,
            isActive: true,
          });
          packsUpdated++;
        }
      }

      // 3) Archive stale launch rows (same region, no purchase history),
      //    i.e. anything that is not one of the three confirmed packs.
      const liveIds = new Set(targets.map((t) => t.externalId));
      for (const p of orgPacks) {
        if (liveIds.has(p.externalId)) continue;
        if (p.isActive === false) continue;
        if (referencedIds.has(p._id as unknown as string)) continue;
        await ctx.db.patch(p._id, { isActive: false, updatedAt: new Date().toISOString() });
        packsArchived++;
      }
    }
    return { tenants: tenants.length, trialFlipped, packsSeeded, packsUpdated, packsArchived };
  },
});
