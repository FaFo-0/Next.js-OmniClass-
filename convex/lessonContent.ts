// Lesson content — vocab / flashcards / quiz questions per lesson.
// Org-scoped; teacher edits + AI generation results write here.

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireTenant, requireTenantPermission } from "./lib/tenant";
import { normalizeLexeme } from "./lib/vocabularyIdentity";
import {
  anchorTranscriptVocabularyCandidate,
  resolveCandidateExternalId,
} from "./lib/transcriptVocabularyCandidates";

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
        lemma: v.optional(v.string()),
        translation: v.string(),
        definition: v.optional(v.string()),
        senseLabel: v.optional(v.string()),
        translationLocale: localeCode,
        partOfSpeech: v.optional(v.string()),
        // Only reused after server-side ownership verification; keeps a
        // teacher-added candidate stable across an ordinary edit.
        externalId: v.optional(v.string()),
        utteranceId: v.optional(v.string()),
        included: v.optional(v.boolean()),
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

    // Reconcile instead of deleting/recreating: candidate rows keep their own
    // stable identity through ordinary review edits, and only rows the teacher
    // removed are deleted.
    const existing = await ctx.db
      .query("lessonVocabulary")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
    const existingByExternalId = new Map(existing.map((row) => [row.externalId, row]));
    const retained = new Set<string>();
    const nowMs = Date.now();

    let i = 0;
    for (const item of items) {
      i += 1;
      let anchored: ReturnType<typeof anchorTranscriptVocabularyCandidate> | undefined;
      if (item.utteranceId) {
        const utterance = await ctx.db
          .query("lessonTranscriptUtterances")
          .withIndex("by_lessonId_and_utteranceId", (q) =>
            q.eq("lessonId", lessonId).eq("utteranceId", item.utteranceId!)
          )
          .unique();
        if (!utterance) {
          throw new Error("Transcript utterance not found for vocabulary candidate");
        }
        anchored = anchorTranscriptVocabularyCandidate({
          lessonExternalId: lesson.externalId,
          surface: item.word,
          utterance,
        });
      }

      const externalId = anchored?.candidateId ?? resolveCandidateExternalId({
        lessonExternalId: lesson.externalId,
        suppliedExternalId: item.externalId,
        knownExistingIds: new Set(existingByExternalId.keys()),
        manualOrdinal: i,
        nowMs,
      });
      retained.add(externalId);
      const existingRow = existingByExternalId.get(externalId);
      const record = {
        // AI output may nominate an utterance. The mutation looks it up and
        // copies the actual sentence/time/speaker from the database.
        word: item.word,
        lemma: item.lemma?.trim() || existingRow?.lemma || item.word,
        translation: item.translation,
        definition: item.definition,
        senseLabel: item.senseLabel?.trim() || existingRow?.senseLabel || item.definition || item.word,
        translationLocale: item.translationLocale,
        partOfSpeech: item.partOfSpeech,
        exampleSentence: anchored?.sentence ?? existingRow?.exampleSentence ?? item.exampleSentence,
        candidateId: anchored?.candidateId ?? existingRow?.candidateId,
        utteranceId: anchored?.utteranceId ?? existingRow?.utteranceId,
        sourceSpeaker: anchored?.speaker ?? existingRow?.sourceSpeaker,
        sourceStartMs: anchored?.range.start ?? existingRow?.sourceStartMs,
        sourceEndMs: anchored?.range.end ?? existingRow?.sourceEndMs,
        senseId: item.senseLabel?.trim()
          ? normalizeLexeme(item.senseLabel)
          : existingRow?.senseId ?? normalizeLexeme(item.definition || item.word),
        included: item.included ?? true,
        ipa: item.ipa,
        audioUrl: item.audioUrl,
      };
      if (existingRow) {
        await ctx.db.patch(existingRow._id, record);
      } else {
        await ctx.db.insert("lessonVocabulary", {
          organizationId: orgId,
          lessonId,
          externalId,
          ...record,
        });
      }
    }

    for (const row of existing) {
      if (!retained.has(row.externalId)) await ctx.db.delete(row._id);
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
