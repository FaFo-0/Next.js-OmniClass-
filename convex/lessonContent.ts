// Lesson content — vocab / flashcards / quiz questions per lesson.
// Org-scoped; teacher edits + AI generation results write here.

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireTenant, requireTenantPermission } from "./lib/tenant";

const localeCode = v.union(v.literal("en"), v.literal("ru"), v.literal("ar"));

// ── Vocabulary ───────────────────────────────────────────────────

export const listVocab = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const { orgId } = await requireTenant(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== orgId) return [];
    return await ctx.db
      .query("lessonVocabulary")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
  },
});

export const listAllVocab = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requireTenant(ctx);
    return await ctx.db
      .query("lessonVocabulary")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
  },
});

export const replaceVocab = mutation({
  args: {
    lessonId: v.id("lessons"),
    items: v.array(
      v.object({
        word: v.string(),
        translation: v.string(),
        translationLocale: localeCode,
        partOfSpeech: v.string(),
        exampleSentence: v.optional(v.string()),
        ipa: v.optional(v.string()),
        audioUrl: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { lessonId, items }) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.edit");
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== orgId)
      throw new Error("Lesson not found");

    // Drop existing rows in batches.
    const existing = await ctx.db
      .query("lessonVocabulary")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    let i = 0;
    for (const item of items) {
      i += 1;
      await ctx.db.insert("lessonVocabulary", {
        organizationId: orgId,
        lessonId,
        externalId: `${lesson.externalId}-v${i}`,
        ...item,
      });
    }
  },
});

// ── Flashcards ───────────────────────────────────────────────────

export const listFlashcards = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const { orgId } = await requireTenant(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== orgId) return [];
    return await ctx.db
      .query("lessonFlashcards")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
  },
});

export const listAllFlashcards = query({
  args: { lessonIds: v.array(v.id("lessons")) },
  handler: async (ctx, { lessonIds }) => {
    const { orgId } = await requireTenant(ctx);
    const results: any[] = [];
    for (const lessonId of lessonIds) {
      const lesson = await ctx.db.get(lessonId);
      if (!lesson || lesson.organizationId !== orgId) continue;
      const cards = await ctx.db
        .query("lessonFlashcards")
        .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
        .collect();
      results.push(...cards);
    }
    return results;
  },
});

export const replaceFlashcards = mutation({
  args: {
    lessonId: v.id("lessons"),
    items: v.array(
      v.object({
        front: v.string(),
        back: v.string(),
        exampleSentence: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, { lessonId, items }) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.edit");
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== orgId)
      throw new Error("Lesson not found");

    const existing = await ctx.db
      .query("lessonFlashcards")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    let i = 0;
    for (const item of items) {
      i += 1;
      await ctx.db.insert("lessonFlashcards", {
        organizationId: orgId,
        lessonId,
        externalId: `${lesson.externalId}-f${i}`,
        ...item,
      });
    }
  },
});

// ── Quiz ─────────────────────────────────────────────────────────

export const listQuiz = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const { orgId } = await requireTenant(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== orgId) return [];
    return await ctx.db
      .query("lessonQuizQuestions")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
  },
});

export const replaceQuiz = mutation({
  args: {
    lessonId: v.id("lessons"),
    items: v.array(
      v.object({
        question: v.string(),
        options: v.array(v.string()),
        correctIndex: v.number(),
        explanation: v.string(),
      })
    ),
  },
  handler: async (ctx, { lessonId, items }) => {
    const { orgId } = await requireTenantPermission(ctx, "lessons.edit");
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== orgId)
      throw new Error("Lesson not found");

    const existing = await ctx.db
      .query("lessonQuizQuestions")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);

    let i = 0;
    for (const item of items) {
      i += 1;
      await ctx.db.insert("lessonQuizQuestions", {
        organizationId: orgId,
        lessonId,
        externalId: `${lesson.externalId}-q${i}`,
        ...item,
      });
    }
  },
});
