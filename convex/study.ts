import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requirePermission } from "./lib/auth";
import {
  type Rating,
  createSRSCardData,
  reviewCard,
  todayStr,
} from "./lib/sm2";

// ── Queries ──────────────────────────────────────────────────────────

export const getSRSCardsForOwner = query({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("srsCards")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .collect();
  },
});

export const getDueCards = query({
  args: { ownerId: v.string(), deckIds: v.array(v.string()) },
  handler: async (ctx, { ownerId, deckIds }) => {
    await requireAuth(ctx);
    const today = todayStr();
    const cards = await ctx.db
      .query("srsCards")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .collect();
    const deckSet = new Set(deckIds);
    return cards
      .filter((c) => deckSet.has(c.deckId) && c.nextReviewDate <= today)
      .sort((a, b) => {
        if (a.interval === 0 && b.interval > 0) return -1;
        if (b.interval === 0 && a.interval > 0) return 1;
        return a.nextReviewDate.localeCompare(b.nextReviewDate);
      });
  },
});

export const getReviewLogsForOwner = query({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("reviewLogs")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .collect();
  },
});

export const getAllReviewLogs = query({
  handler: async (ctx) => {
    await requirePermission(ctx, "users.view.any");
    return await ctx.db.query("reviewLogs").collect();
  },
});

export const getQuizAttemptsForStudent = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("quizAttempts")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .collect();
  },
});

export const getAllQuizAttempts = query({
  handler: async (ctx) => {
    await requirePermission(ctx, "users.view.any");
    return await ctx.db.query("quizAttempts").collect();
  },
});

export const getStudySessionsForStudent = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("studySessions")
      .withIndex("by_studentId", (q) => q.eq("studentId", studentId))
      .collect();
  },
});

// ── Mutations ────────────────────────────────────────────────────────

const ratingValidator = v.union(
  v.literal("again"),
  v.literal("hard"),
  v.literal("good"),
  v.literal("easy")
);

export const syncCardsFromLessons = mutation({
  args: {
    ownerId: v.string(),
    deckId: v.string(),
    flashcards: v.array(
      v.object({ id: v.string(), front: v.string(), back: v.string() })
    ),
  },
  handler: async (ctx, { ownerId, deckId, flashcards }) => {
    await requireAuth(ctx);
    const existing = await ctx.db
      .query("srsCards")
      .withIndex("by_deckId", (q) => q.eq("deckId", deckId))
      .collect();
    const existingIds = new Set(existing.map((c) => c.cardId));

    for (const f of flashcards) {
      if (!existingIds.has(f.id)) {
        const card = createSRSCardData(f.id, deckId, ownerId, f.front, f.back);
        await ctx.db.insert("srsCards", card);
      }
    }
  },
});

export const importDeck = mutation({
  args: {
    ownerId: v.string(),
    deckId: v.string(),
    cards: v.array(v.object({ front: v.string(), back: v.string() })),
  },
  handler: async (ctx, { ownerId, deckId, cards }) => {
    await requireAuth(ctx);
    for (let i = 0; i < cards.length; i++) {
      const card = createSRSCardData(
        `${deckId}-${i}`,
        deckId,
        ownerId,
        cards[i].front,
        cards[i].back
      );
      await ctx.db.insert("srsCards", card);
    }
  },
});

export const reviewSRSCard = mutation({
  args: {
    ownerId: v.string(),
    cardId: v.string(),
    rating: ratingValidator,
  },
  handler: async (ctx, { ownerId, cardId, rating }) => {
    await requireAuth(ctx);
    const card = await ctx.db
      .query("srsCards")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
      .filter((q) => q.eq(q.field("cardId"), cardId))
      .first();
    if (!card) return;

    const updated = reviewCard(
      card,
      rating as Rating
    );

    await ctx.db.patch(card._id, {
      interval: updated.interval,
      easeFactor: updated.easeFactor,
      repetitions: updated.repetitions,
      nextReviewDate: updated.nextReviewDate,
      lastReviewDate: updated.lastReviewDate,
    });

    await ctx.db.insert("reviewLogs", {
      ownerId,
      cardId,
      rating,
      reviewedAt: new Date().toISOString(),
      intervalBefore: card.interval,
      intervalAfter: updated.interval,
      easeFactorBefore: card.easeFactor,
      easeFactorAfter: updated.easeFactor,
    });
  },
});

export const addQuizAttempt = mutation({
  args: {
    lessonId: v.string(),
    studentId: v.string(),
    score: v.number(),
    total: v.number(),
    completedAt: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await ctx.db.insert("quizAttempts", args);
  },
});

export const addStudySession = mutation({
  args: {
    studentId: v.string(),
    type: v.union(v.literal("flashcard"), v.literal("quiz")),
    cardsReviewed: v.number(),
    startedAt: v.string(),
    endedAt: v.string(),
    durationMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await ctx.db.insert("studySessions", args);
  },
});
