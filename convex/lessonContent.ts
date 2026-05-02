import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requirePermission } from "./lib/auth";

// ── Queries ──────────────────────────────────────────────────────────

export const getVocabulary = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("lessonVocabulary")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
  },
});

export const getFlashcards = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("lessonFlashcards")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
  },
});

export const getQuizQuestions = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    await requireAuth(ctx);
    return await ctx.db
      .query("lessonQuizQuestions")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
  },
});

/** Get all flashcards grouped by lesson for a student's published lessons (for SRS sync). */
export const getFlashcardsForStudentLessons = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    await requireAuth(ctx);
    const lessons = await ctx.db
      .query("lessons")
      .withIndex("by_studentId_and_status", (q) =>
        q.eq("studentId", studentId).eq("status", "published")
      )
      .collect();

    const result: Array<{
      lessonExternalId: string;
      flashcards: Array<{ id: string; front: string; back: string }>;
    }> = [];

    for (const lesson of lessons) {
      const flashcards = await ctx.db
        .query("lessonFlashcards")
        .withIndex("by_lessonId", (q) => q.eq("lessonId", lesson._id))
        .collect();
      result.push({
        lessonExternalId: lesson.externalId,
        flashcards: flashcards.map((f) => ({ id: f.externalId, front: f.front, back: f.back })),
      });
    }
    return result;
  },
});

// ── Mutations (batch replace) ────────────────────────────────────────

export const setVocabulary = mutation({
  args: {
    lessonId: v.id("lessons"),
    items: v.array(
      v.object({
        externalId: v.string(),
        arabic: v.string(),
        transliteration: v.string(),
        translation: v.string(),
        partOfSpeech: v.string(),
      })
    ),
  },
  handler: async (ctx, { lessonId, items }) => {
    await requirePermission(ctx, "lessons.edit");
    // Delete existing
    const existing = await ctx.db
      .query("lessonVocabulary")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
    for (const doc of existing) await ctx.db.delete(doc._id);

    // Insert new
    for (const item of items) {
      await ctx.db.insert("lessonVocabulary", { lessonId, ...item });
    }
  },
});

export const setFlashcards = mutation({
  args: {
    lessonId: v.id("lessons"),
    items: v.array(
      v.object({
        externalId: v.string(),
        front: v.string(),
        back: v.string(),
      })
    ),
  },
  handler: async (ctx, { lessonId, items }) => {
    await requirePermission(ctx, "lessons.edit");
    const existing = await ctx.db
      .query("lessonFlashcards")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
    for (const doc of existing) await ctx.db.delete(doc._id);

    for (const item of items) {
      await ctx.db.insert("lessonFlashcards", { lessonId, ...item });
    }
  },
});

export const setQuizQuestions = mutation({
  args: {
    lessonId: v.id("lessons"),
    items: v.array(
      v.object({
        externalId: v.string(),
        question: v.string(),
        options: v.array(v.string()),
        correctIndex: v.number(),
        explanation: v.string(),
      })
    ),
  },
  handler: async (ctx, { lessonId, items }) => {
    await requirePermission(ctx, "lessons.edit");
    const existing = await ctx.db
      .query("lessonQuizQuestions")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
    for (const doc of existing) await ctx.db.delete(doc._id);

    for (const item of items) {
      await ctx.db.insert("lessonQuizQuestions", { lessonId, ...item });
    }
  },
});
