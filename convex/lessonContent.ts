// Lesson content — vocab / flashcards / quiz questions per lesson.
// Org-scoped; teacher edits + AI generation results write here.

import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireTenant, requireTenantPermission } from "./lib/tenant";
import { requireLessonOwnerOrAdmin } from "./lib/lessonAccess";
import { normalizeLexeme } from "./lib/vocabularyIdentity";
import {
  anchorTranscriptVocabularyCandidate,
  findTranscriptVocabularyUtterance,
  assertTranscriptAnchorIsRetained,
  resolveCandidateExternalId,
} from "./lib/transcriptVocabularyCandidates";

const localeCode = v.union(v.literal("en"), v.literal("ru"), v.literal("ar"), v.literal("kk"));

function canReadLessonContent(user: Doc<"users">, lesson: Doc<"lessons">) {
  return !lesson.isDeleted && (user.role === "admin" || (user.role === "teacher" && lesson.teacherId === user.externalId) || (lesson.studentId === user.externalId && lesson.status === "published"));
}

// ── Vocabulary ───────────────────────────────────────────────────

export const listVocab = query({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const { orgId, user } = await requireTenant(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== orgId || lesson.isDeleted) return [];
    if (!canReadLessonContent(user, lesson)) return [];
    const items = await ctx.db
      .query("lessonVocabulary")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
    const cards = user.role === "student" ? [] : await ctx.db.query("srsCards").withIndex("by_organization_and_ownerId", q => q.eq("organizationId", orgId).eq("ownerId", lesson.studentId)).collect();
    return items.map(item => ({ ...item, alreadySaved: cards.some(card => !card.isDeleted && normalizeLexeme(card.lemma ?? card.front) === normalizeLexeme(item.lemma ?? item.word)) }));
  },
});

export const listAllVocab = query({
  args: {},
  handler: async (ctx) => {
    const { orgId, user } = await requireTenantPermission(ctx, "lessons.view.any");
    if (user.role !== "admin") throw new Error("Admin vocabulary access required");
    return await ctx.db
      .query("lessonVocabulary")
      .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
      .collect();
  },
});

export const replaceVocab = mutation({
  args: {
    generated: v.optional(v.boolean()),
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
  handler: async (ctx, { lessonId, items, generated }) => {
    const { orgId, lesson } = await requireLessonOwnerOrAdmin(ctx, lessonId);

    // Reconcile instead of deleting/recreating: candidate rows keep their own
    // stable identity through ordinary review edits, and only rows the teacher
    // removed are deleted.
    const existing = await ctx.db
      .query("lessonVocabulary")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
    const existingByExternalId = new Map(existing.map((row) => [row.externalId, row]));
    const knownExistingIds = new Set(existingByExternalId.keys());
    const automaticUtterances = generated || items.some(item => !item.utteranceId)
      ? await ctx.db.query("lessonTranscriptUtterances")
          .withIndex("by_lessonId", q => q.eq("lessonId", lessonId)).collect()
      : [];
    const retained = new Set<string>();
    const nowMs = Date.now();

    let i = 0;
    for (const item of items) {
      i += 1;
      let anchored: ReturnType<typeof anchorTranscriptVocabularyCandidate> | undefined;
      let sourceTranscriptVersion: number | undefined;
      let utterance = item.utteranceId
        ? await ctx.db.query("lessonTranscriptUtterances")
            .withIndex("by_lessonId_and_utteranceId", q =>
              q.eq("lessonId", lessonId).eq("utteranceId", item.utteranceId!)).unique()
        : findTranscriptVocabularyUtterance(item.word, automaticUtterances);
      if (generated) {
        // Provider IDs are suggestions, never proof. Resolve against persisted
        // text when an ID is missing, invented, or points at the wrong sentence.
        utterance = findTranscriptVocabularyUtterance(
          item.word,
          utterance ? [utterance] : []
        ) ?? findTranscriptVocabularyUtterance(item.word, automaticUtterances);
        if (!utterance) continue;
      }
      if (item.utteranceId && !utterance) {
        throw new Error("Transcript utterance not found for vocabulary candidate");
      }
      if (utterance) {
        sourceTranscriptVersion = utterance.transcriptVersion;
        anchored = anchorTranscriptVocabularyCandidate({
          lessonExternalId: lesson.externalId,
          surface: item.word,
          utterance,
        });
      }

      const externalId = (item.externalId && knownExistingIds.has(item.externalId)
        ? item.externalId : anchored?.candidateId) ?? resolveCandidateExternalId({
        lessonExternalId: lesson.externalId,
        suppliedExternalId: item.externalId,
        knownExistingIds,
        manualOrdinal: i,
        nowMs,
      });
      if (generated && retained.has(externalId)) continue;
      if (retained.has(externalId)) throw new Error(`"${item.word}" is already included in this lesson vocabulary`);
      retained.add(externalId);
      const existingRow = existingByExternalId.get(externalId);
      assertTranscriptAnchorIsRetained(existingRow?.utteranceId, anchored?.utteranceId);
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
        sourceTranscriptVersion: sourceTranscriptVersion ?? existingRow?.sourceTranscriptVersion,
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

    if (generated && retained.size === 0) {
      throw new ConvexError("No generated words matched the recorded transcript. Your reviewed vocabulary was not changed. Please try again.");
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
    const { orgId, user } = await requireTenant(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== orgId || !canReadLessonContent(user, lesson)) return [];
    return await ctx.db
      .query("lessonFlashcards")
      .withIndex("by_lessonId", (q) => q.eq("lessonId", lessonId))
      .collect();
  },
});

export const listAllFlashcards = query({
  args: { lessonIds: v.array(v.id("lessons")) },
  handler: async (ctx, { lessonIds }) => {
    const { orgId, user } = await requireTenant(ctx);
    const results: Doc<"lessonFlashcards">[] = [];
    for (const lessonId of lessonIds) {
      const lesson = await ctx.db.get(lessonId);
      if (!lesson || lesson.organizationId !== orgId || !canReadLessonContent(user, lesson)) continue;
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
    const { orgId, lesson } = await requireLessonOwnerOrAdmin(ctx, lessonId);

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
    const { orgId, user } = await requireTenant(ctx);
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.organizationId !== orgId || !canReadLessonContent(user, lesson)) return [];
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
    const { orgId, lesson } = await requireLessonOwnerOrAdmin(ctx, lessonId);

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
