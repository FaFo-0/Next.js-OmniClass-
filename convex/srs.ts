// SRS — decks + cards. Two key rules from MASTER_PLAN §3:
//   1. Each lesson finalize creates a deck `source: "lesson"` (1:1).
//   2. Each student has exactly one `isDefault: true` "My Words" deck
//      created lazily on first manual add.
//
// This file holds the cross-cutting deck/card mutations used by the
// Library Hub. Lesson-deck creation will be wired in Phase D.

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTenant, requireTenantPermission } from "./lib/tenant";
import { reviewCard, todayInTz, type Rating } from "./lib/sm2";
import type { Id } from "./_generated/dataModel";

/** Cap the study queue so a neglected deck isn't an overwhelming wall.
 *  Cards beyond this stay due and surface next session, most-overdue first. */
const SESSION_CAP = 60;

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
    return rows.filter((c) => !c.isDeleted).slice(0, SESSION_CAP);
  },
});

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
    return rows.filter((c) => !c.isDeleted).length;
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
 * Add a card to the caller's own default deck (Self-study mode in the
 * Reading Hub). Used by both students and teachers when reading alone.
 */
export const addCardToOwnDeck = mutation({
  args: {
    front: v.string(),
    back: v.string(),
    exampleSentence: v.optional(v.string()),
    sourceLibraryMaterialId: v.optional(v.id("libraryMaterials")),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireTenant(ctx);
    const deckId = await ensureDefaultDeck(ctx, orgId, user.externalId);
    const now = new Date().toISOString();
    const cardId = `${user.externalId}-${Date.now()}`;
    return await ctx.db.insert("srsCards", {
      organizationId: orgId,
      cardId,
      deckId,
      ownerId: user.externalId,
      front: args.front,
      back: args.back,
      exampleSentence: args.exampleSentence,
      sourceLibraryMaterialId: args.sourceLibraryMaterialId,
      addedBy: "self",
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      nextReviewDate: now.slice(0, 10),
      lastReviewDate: null,
    });
  },
});

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

    const deckId = await ensureDefaultDeck(ctx, orgId, args.studentId);
    const now = new Date().toISOString();
    const cardId = `${args.studentId}-${Date.now()}`;
    return await ctx.db.insert("srsCards", {
      organizationId: orgId,
      cardId,
      deckId,
      ownerId: args.studentId,
      front: args.front,
      back: args.back,
      exampleSentence: args.exampleSentence,
      sourceLibraryMaterialId: args.sourceLibraryMaterialId,
      addedBy: "teacher",
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0,
      nextReviewDate: now.slice(0, 10),
      lastReviewDate: null,
    });
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
