// SRS — decks + cards. Two key rules from MASTER_PLAN §3:
//   1. Each lesson finalize creates a deck `source: "lesson"` (1:1).
//   2. Each student has exactly one `isDefault: true` "My Words" deck
//      created lazily on first manual add.
//
// This file holds the cross-cutting deck/card mutations used by the
// Library Hub. Lesson-deck creation will be wired in Phase D.

import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireTenant, requireTenantPermission } from "./lib/tenant";
import { reviewCard, todayInTz, type Rating } from "./lib/sm2";
import { resolveLearnerLocale } from "./users";
import type { Doc, Id } from "./_generated/dataModel";

/** Cap the study queue so a neglected deck isn't an overwhelming wall.
 *  Cards beyond this stay due and surface next session, most-overdue first. */
const SESSION_CAP = 60;

/**
 * How many words a learner MEETS for the first time in one day.
 *
 * Collecting while reading is deliberately unlimited — a beginner adding sixty
 * words from one text is doing the right thing. The throttle belongs here, at
 * study time: the rest of the collection simply waits its turn.
 */
const NEW_CARDS_PER_DAY = 15;

/** The reviewer's local "today": their tz → academy tz → UTC. */
async function studentToday(ctx: any, orgId: string, user: any): Promise<string> {
  let tz = user.timezone as string | undefined;
  if (!tz) {
    const settings = await ctx.db
      .query("tenantSettings")
      .withIndex("by_organization", (q: any) => q.eq("organizationId", orgId))
      .unique();
    tz = settings?.timezone ?? "UTC";
  }
  return todayInTz(tz!);
}

// ── Deck helpers ─────────────────────────────────────────────────

async function ensureDefaultDeck(
  ctx: any,
  orgId: string,
  ownerId: string
): Promise<Id<"srsDecks">> {
  const existing = await ctx.db
    .query("srsDecks")
    .withIndex("by_organization_and_ownerId", (q: any) =>
      q.eq("organizationId", orgId).eq("ownerId", ownerId)
    )
    .filter((q: any) => q.eq(q.field("isDefault"), true))
    .first();
  if (existing) return existing._id as Id<"srsDecks">;

  return await ctx.db.insert("srsDecks", {
    organizationId: orgId,
    externalId: `default-${ownerId}`,
    name: "My Words",
    ownerId,
    source: "manual" as const,
    isDefault: true,
    createdAt: new Date().toISOString(),
  });
}

// ── Queries ──────────────────────────────────────────────────────

export const listDecks = query({
  args: { ownerId: v.optional(v.string()) },
  handler: async (ctx, { ownerId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const targetOwner = ownerId ?? user.externalId;
    const rows = await ctx.db
      .query("srsDecks")
      .withIndex("by_organization_and_ownerId", (q) =>
        q.eq("organizationId", orgId).eq("ownerId", targetOwner)
      )
      .collect();
    return rows.filter((r) => !r.isDeleted);
  },
});

/**
 * Cards due for the calling student today (nextReviewDate <= today).
 * Used by the dashboard "Study Due" tile and the study page queue.
 */
export const listDueCards = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    const today = await studentToday(ctx, orgId, user);
    // The index range returns ascending nextReviewDate → most-overdue first,
    // which is the order we want; cap the session so a big backlog is chipped
    // away oldest-first rather than dumped all at once.
    const rows = await ctx.db
      .query("srsCards")
      .withIndex("by_organization_and_ownerId_and_nextReviewDate", (q) =>
        q
          .eq("organizationId", orgId)
          .eq("ownerId", user.externalId)
          .lte("nextReviewDate", today)
      )
      .collect();
    return buildQueue(rows, today);
  },
});

/**
 * Reviews first, then as many never-seen words as the day still allows.
 *
 * Reviews are debts already owed — skipping them is how a deck rots — so they
 * are never displaced by new words. New cards fill whatever room is left.
 */
function buildQueue<T extends Doc<"srsCards">>(rows: T[], today: string): T[] {
  const live = rows.filter((c) => !c.isDeleted);
  const introducedToday = live.filter((c) => c.firstReviewedAt === today).length;
  const room = Math.max(0, NEW_CARDS_PER_DAY - introducedToday);

  const reviews = live.filter((c) => c.firstReviewedAt);
  const fresh = live.filter((c) => !c.firstReviewedAt).slice(0, room);
  return [...reviews, ...fresh].slice(0, SESSION_CAP);
}

/** Count of due cards — cheap separate query for header badges. */
export const countDueCards = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    const today = await studentToday(ctx, orgId, user);
    const rows = await ctx.db
      .query("srsCards")
      .withIndex("by_organization_and_ownerId_and_nextReviewDate", (q) =>
        q
          .eq("organizationId", orgId)
          .eq("ownerId", user.externalId)
          .lte("nextReviewDate", today)
      )
      .collect();
    // Must agree with listDueCards or the badge promises work the session
    // won't show.
    return buildQueue(rows, today).length;
  },
});

export const listCardsInDeck = query({
  args: { deckId: v.id("srsDecks") },
  handler: async (ctx, { deckId }) => {
    const { orgId } = await requireTenant(ctx);
    const deck = await ctx.db.get(deckId);
    if (!deck || deck.organizationId !== orgId) return [];
    const cards = await ctx.db
      .query("srsCards")
      .withIndex("by_organization_and_deckId", (q) =>
        q.eq("organizationId", orgId).eq("deckId", deckId)
      )
      .collect();
    return cards.filter((c) => !c.isDeleted);
  },
});

// ── Mutations ────────────────────────────────────────────────────

/**
 * One list, one row per word. Tapping a word already collected must not
 * quietly create a second card — the learner would then meet the same word
 * twice in a session and wonder which one counts.
 */
async function findExistingCard(
  ctx: any,
  orgId: string,
  ownerId: string,
  front: string
) {
  const w = front.toLowerCase().trim();
  const cards = await ctx.db
    .query("srsCards")
    .withIndex("by_organization_and_ownerId", (q: any) =>
      q.eq("organizationId", orgId).eq("ownerId", ownerId)
    )
    .collect();
  return cards.find(
    (c: Doc<"srsCards">) => !c.isDeleted && c.front.toLowerCase().trim() === w
  );
}

/**
 * Add a card to the caller's own default deck (Self-study mode in the
 * Reading Hub). Used by both students and teachers when reading alone.
 */
export const addCardToOwnDeck = mutation({
  args: {
    front: v.string(),
    back: v.string(),
    translation: v.optional(v.string()),
    translationLocale: v.optional(v.string()),
    exampleSentence: v.optional(v.string()),
    sourceLibraryMaterialId: v.optional(v.id("libraryMaterials")),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    const already = await findExistingCard(ctx, orgId, user.externalId, args.front);
    if (already) return already._id as Id<"srsCards">;
    const deckId = await ensureDefaultDeck(ctx, orgId, user.externalId);
    const now = new Date().toISOString();
    const cardId = `${user.externalId}-${Date.now()}`;
    const id = await ctx.db.insert("srsCards", {
      organizationId: orgId,
      cardId,
      deckId,
      ownerId: user.externalId,
      front: args.front,
      back: args.back,
      translation: args.translation,
      translationLocale: args.translationLocale,
      exampleSentence: args.exampleSentence,
      sourceLibraryMaterialId: args.sourceLibraryMaterialId,
      addedBy: "self",
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      nextReviewDate: now.slice(0, 10),
      lastReviewDate: null,
    });
    await scheduleTranslationBackfill(ctx, id, args.translation);
    return id;
  },
});

/**
 * A card with no translation is an English-only card — useless to study
 * from. Rather than block the save (the reader is mid-text), let the card
 * exist immediately and resolve the missing side in the background.
 */
async function scheduleTranslationBackfill(
  ctx: any,
  cardDocId: Id<"srsCards">,
  translation?: string
) {
  if (translation && translation.trim()) return;
  await ctx.scheduler.runAfter(0, internal.library._backfillCardTranslation, {
    cardDocId,
  });
}

/**
 * Teacher pushes a word into a specific student's default deck (Live
 * mode). Requires `library.send_word_to_student` permission.
 *
 * Verifies the target student belongs to the same org. Optionally
 * checks the student is assigned to this teacher (skipped for admins
 * who hold the same permission).
 */
export const pushCardToStudentDeck = mutation({
  args: {
    studentId: v.string(), // users.externalId
    front: v.string(),
    back: v.string(),
    translation: v.optional(v.string()),
    translationLocale: v.optional(v.string()),
    exampleSentence: v.optional(v.string()),
    sourceLibraryMaterialId: v.optional(v.id("libraryMaterials")),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenantPermission(
      ctx,
      "library.send_word_to_student"
    );

    const student = await ctx.db
      .query("users")
      .withIndex("by_organization_and_externalId", (q) =>
        q.eq("organizationId", orgId).eq("externalId", args.studentId)
      )
      .unique();
    if (!student) throw new Error("Student not found in this organization");
    if (student.role !== "student") throw new Error("Target user is not a student");

    // Teachers may only push to their own students unless they're admin.
    if (
      user.role === "teacher" &&
      student.teacherId &&
      student.teacherId !== user.externalId
    ) {
      throw new Error(
        "Teacher can only push words to their own assigned students"
      );
    }

    const already = await findExistingCard(ctx, orgId, args.studentId, args.front);
    if (already) return already._id as Id<"srsCards">;
    const deckId = await ensureDefaultDeck(ctx, orgId, args.studentId);
    const now = new Date().toISOString();
    const cardId = `${args.studentId}-${Date.now()}`;
    const id = await ctx.db.insert("srsCards", {
      organizationId: orgId,
      cardId,
      deckId,
      ownerId: args.studentId,
      front: args.front,
      back: args.back,
      translation: args.translation,
      translationLocale: args.translationLocale,
      exampleSentence: args.exampleSentence,
      sourceLibraryMaterialId: args.sourceLibraryMaterialId,
      addedBy: "teacher",
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      nextReviewDate: now.slice(0, 10),
      lastReviewDate: null,
    });
    await scheduleTranslationBackfill(ctx, id, args.translation);
    return id;
  },
});

/**
 * Apply SM-2 to a card and write a `reviewLogs` row. Called after
 * student rates a card in the study session.
 */
export const recordReview = mutation({
  args: {
    cardDocId: v.id("srsCards"),
    rating: v.union(
      v.literal("again"),
      v.literal("hard"),
      v.literal("good"),
      v.literal("easy")
    ),
  },
  handler: async (ctx, { cardDocId, rating }) => {
    const { orgId, user } = await requireTenant(ctx);
    const card = await ctx.db.get(cardDocId);
    if (!card || card.organizationId !== orgId) {
      throw new Error("Card not found");
    }
    if (card.ownerId !== user.externalId) {
      throw new Error("Cannot review another user's card");
    }

    const today = await studentToday(ctx, orgId, user);
    const updated = reviewCard(
      {
        cardId: card.cardId,
        deckId: card.deckId as unknown as string,
        ownerId: card.ownerId,
        front: card.front,
        back: card.back,
        interval: card.interval,
        easeFactor: card.easeFactor,
        repetitions: card.repetitions,
        nextReviewDate: card.nextReviewDate,
        lastReviewDate: card.lastReviewDate,
      },
      rating as Rating,
      today
    );

    await ctx.db.patch(cardDocId, {
      // The reviewer's LOCAL date, not UTC — the cap is a day in their life.
      firstReviewedAt: card.firstReviewedAt ?? today,
      interval: updated.interval,
      easeFactor: updated.easeFactor,
      repetitions: updated.repetitions,
      nextReviewDate: updated.nextReviewDate,
      lastReviewDate: updated.lastReviewDate,
    });

    await ctx.db.insert("reviewLogs", {
      organizationId: orgId,
      ownerId: user.externalId,
      cardId: card.cardId,
      rating,
      reviewedAt: new Date().toISOString(),
      intervalBefore: card.interval,
      intervalAfter: updated.interval,
      easeFactorBefore: card.easeFactor,
      easeFactorAfter: updated.easeFactor,
    });

    return null;
  },
});

/** Total cards reviewed by caller — drives the dashboard stat card. */
export const countReviewsForStudent = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    const rows = await ctx.db
      .query("reviewLogs")
      .withIndex("by_organization_and_ownerId", (q) =>
        q.eq("organizationId", orgId).eq("ownerId", user.externalId)
      )
      .collect();
    return rows.length;
  },
});

/**
 * Every word on a learner's list, lowercased.
 *
 * This is what paints the reading view: a word is either on the list (green)
 * or it is ordinary prose. There is no third state — not judging a word is the
 * default, and costs the reader nothing. Teachers pass `studentId` to see the
 * same picture while reading with that student.
 */
export const getWordSet = query({
  args: { studentId: v.optional(v.string()) },
  handler: async (ctx, { studentId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const target = studentId ?? user.externalId;
    if (user.role === "student" && target !== user.externalId) {
      throw new Error("Not your list");
    }
    const cards = await ctx.db
      .query("srsCards")
      .withIndex("by_organization_and_ownerId", (q) =>
        q.eq("organizationId", orgId).eq("ownerId", target)
      )
      .collect();
    return [
      ...new Set(
        cards.filter((c) => !c.isDeleted).map((c) => c.front.toLowerCase().trim())
      ),
    ];
  },
});

/** A card counts as learned once SM-2 has pushed it a month out. */
const MASTERED_INTERVAL_DAYS = 21;

/**
 * The word list itself — one row per word, with the state derived from review
 * history rather than self-reported. "Learned" means the learner actually
 * recalled it after three weeks, which is worth more than a button they once
 * clicked.
 */
export const listMyWords = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenant(ctx);
    const cards = await ctx.db
      .query("srsCards")
      .withIndex("by_organization_and_ownerId", (q) =>
        q.eq("organizationId", orgId).eq("ownerId", user.externalId)
      )
      .collect();
    const today = await studentToday(ctx, orgId, user);
    return cards
      .filter((c) => !c.isDeleted)
      .sort((a, b) => b._creationTime - a._creationTime)
      .map((c) => ({
        _id: c._id,
        word: c.front,
        translation: c.translation ?? null,
        back: c.back,
        exampleSentence: c.exampleSentence ?? null,
        addedBy: c.addedBy ?? "self",
        addedAt: new Date(c._creationTime).toISOString().slice(0, 10),
        nextReviewDate: c.nextReviewDate,
        due: c.nextReviewDate <= today,
        state: !c.firstReviewedAt
          ? ("new" as const)
          : c.interval >= MASTERED_INTERVAL_DAYS
            ? ("learned" as const)
            : ("learning" as const),
      }));
  },
});

/** Remove a word from the list. Soft — review history stays meaningful. */
export const removeWord = mutation({
  args: { cardDocId: v.id("srsCards") },
  handler: async (ctx, { cardDocId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const card = await ctx.db.get(cardDocId);
    if (!card || card.organizationId !== orgId) throw new Error("Not found");
    if (card.ownerId !== user.externalId) throw new Error("Not your word");
    await ctx.db.patch(cardDocId, {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
    });
    return null;
  },
});

/** Fix a translation the machine got wrong — the learner knows better. */
export const editWordTranslation = mutation({
  args: { cardDocId: v.id("srsCards"), translation: v.string() },
  handler: async (ctx, { cardDocId, translation }) => {
    const { orgId, user } = await requireTenant(ctx);
    const card = await ctx.db.get(cardDocId);
    if (!card || card.organizationId !== orgId) throw new Error("Not found");
    if (card.ownerId !== user.externalId) throw new Error("Not your word");
    const t = translation.trim();
    if (!t) throw new Error("Translation cannot be empty");
    // Keep whatever English detail the back carried behind the new answer.
    const detail = card.translation
      ? card.back.replace(card.translation, "").replace(/^\s*—\s*/, "").trim()
      : card.back.trim();
    await ctx.db.patch(cardDocId, {
      translation: t,
      back: detail && detail !== t ? `${t} — ${detail}` : t,
    });
    return null;
  },
});

// ── Translation backfill (internal) ──────────────────────────────
//
// Reading writes a card the moment a word is tapped; the translation may
// arrive a beat later. These two are the action's hands on the database —
// it can't touch `ctx.db` itself.

/** What the backfill needs: the word, and the language to render it in. */
export const _cardTranslationTarget = internalQuery({
  args: { cardDocId: v.id("srsCards") },
  handler: async (ctx, { cardDocId }) => {
    const card = await ctx.db.get(cardDocId);
    if (!card || card.isDeleted) return null;
    if (card.translation?.trim()) return null; // already answered
    const locale = await resolveLearnerLocale(
      ctx,
      card.organizationId,
      card.ownerId
    );
    if (!locale) return null; // no L1 on file — English definition stands
    // A word already written in the learner's own script (an Arabic name in an
    // English text) has nothing to translate into that language — the back
    // already holds the English gloss, which is the useful direction.
    const script = /[؀-ۿ]/.test(card.front)
      ? "ar"
      : /[Ѐ-ӿ]/.test(card.front)
        ? "ru"
        : "en";
    if (script === locale) return null;
    return {
      organizationId: card.organizationId,
      word: card.front.toLowerCase().trim(),
      locale,
      back: card.back,
    };
  },
});

export const _writeCardTranslation = internalMutation({
  args: {
    cardDocId: v.id("srsCards"),
    translation: v.string(),
    translationLocale: v.string(),
  },
  handler: async (ctx, { cardDocId, translation, translationLocale }) => {
    const card = await ctx.db.get(cardDocId);
    if (!card || card.translation?.trim()) return;
    // The back reads translation first, English detail after — the same
    // shape the popover writes when it already knows both.
    const detail = card.back.trim();
    await ctx.db.patch(cardDocId, {
      translation,
      translationLocale,
      back: detail && detail !== translation
        ? `${translation} — ${detail}`
        : translation,
    });
  },
});

/** Cards for one learner that still have no translation. Bounded per run. */
export const _untranslatedCards = internalQuery({
  args: { organizationId: v.string(), ownerId: v.string() },
  handler: async (ctx, { organizationId, ownerId }) => {
    const cards = await ctx.db
      .query("srsCards")
      .withIndex("by_organization_and_ownerId", (q) =>
        q.eq("organizationId", organizationId).eq("ownerId", ownerId)
      )
      .take(200);
    return cards
      .filter((c) => !c.isDeleted && !c.translation?.trim())
      .map((c) => c._id);
  },
});
