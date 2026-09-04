/**
 * Canonical saved-vocabulary write path.
 *
 * Every source — library reading save, teacher push, lesson publish, private
 * document save, manual add — must create or extend a learner's vocabulary
 * through `upsertSavedVocabulary`, never by inserting `srsCards` directly.
 *
 * This is what makes the redesign hold together:
 *   - identity is sense-aware (lemma + part of speech + sense), not lowercase
 *     spelling, so "bank" (finance) and "bank" (river) never collide, and a
 *     word met in a book and again in a lesson merges into ONE item.
 *   - a re-encounter appends an occurrence; it never resets SRS state and
 *     never creates a duplicate card.
 *   - occurrences live in their own table (not an unbounded array), so the
 *     learner's encounter history is preserved without hitting document limits.
 */

import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  normalizeLexeme,
  occurrenceKey,
  vocabularyIdentityKey,
  type LanguageCode,
  type Lexeme,
  type Occurrence,
  type Sense,
} from "./vocabularyIdentity";

export interface SaveVocabularyInput {
  lexeme: Lexeme;
  sense: Sense;
  translation: string;
  translationLocale: LanguageCode;
  occurrence: Occurrence;
  addedBy: "self" | "teacher" | "system";
  sourceLessonId?: Id<"lessons">;
  sourceLibraryMaterialId?: Id<"libraryMaterials">;
}

/** One student, one "My Words" deck, created lazily on first save. */
async function ensureDefaultDeck(
  ctx: MutationCtx,
  orgId: string,
  ownerId: string
): Promise<Id<"srsDecks">> {
  const existing = await ctx.db
    .query("srsDecks")
    .withIndex("by_organization_and_ownerId", (q) =>
      q.eq("organizationId", orgId).eq("ownerId", ownerId)
    )
    .filter((q) => q.eq(q.field("isDefault"), true))
    .first();
  if (existing) return existing._id;

  return await ctx.db.insert("srsDecks", {
    organizationId: orgId,
    externalId: `default-${ownerId}`,
    name: "My Words",
    ownerId,
    source: "manual",
    isDefault: true,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Legacy fallback: cards created before the sense-aware model lack an
 * `identityKey`, so they are matched by lowercased spelling. On a hit we
 * repair the card with its canonical identity and treat it as the same item.
 */
async function findLegacyCard(
  ctx: MutationCtx,
  orgId: string,
  ownerId: string,
  surface: string
): Promise<Doc<"srsCards"> | null> {
  const w = normalizeLexeme(surface);
  const cards = await ctx.db
    .query("srsCards")
    .withIndex("by_organization_and_ownerId", (q) =>
      q.eq("organizationId", orgId).eq("ownerId", ownerId)
    )
    .collect();
  return (
    cards.find(
      (c) => !c.isDeleted && normalizeLexeme(c.front) === w
    ) ?? null
  );
}

/**
 * Create or extend a learner's vocabulary item for one sense, appending the
 * given occurrence. Returns the card id. Review state (interval, ease,
 * repetitions, due date) is NEVER reset on a merge — only new cards get
 * defaults.
 */
export async function upsertSavedVocabulary(
  ctx: MutationCtx,
  orgId: string,
  ownerId: string,
  input: SaveVocabularyInput
): Promise<Id<"srsCards">> {
  const identityKey = vocabularyIdentityKey(
    input.translationLocale,
    input.lexeme,
    input.sense
  );
  const occKey = occurrenceKey(input.occurrence);

  // 1. Sense-aware lookup first.
  let card = await ctx.db
    .query("srsCards")
    .withIndex("by_organization_and_ownerId_and_identityKey", (q) =>
      q.eq("organizationId", orgId).eq("ownerId", ownerId).eq("identityKey", identityKey)
    )
    .first();

  // 2. Legacy fallback — repair on re-encounter.
  let isLegacy = false;
  if (!card) {
    const legacy = await findLegacyCard(ctx, orgId, ownerId, input.lexeme.surface);
    if (legacy) {
      card = legacy;
      isLegacy = true;
    }
  }

  if (card) {
    if (isLegacy || !card.identityKey) {
      await ctx.db.patch(card._id, {
        lemma: normalizeLexeme(input.lexeme.lemma),
        partOfSpeech: input.lexeme.partOfSpeech,
        senseId: input.sense.senseId,
        identityKey,
      });
    }
    await insertOccurrence(ctx, orgId, ownerId, card._id, input, occKey);
    return card._id;
  }

  // 3. New item: create the card, then record the first occurrence.
  const deckId = await ensureDefaultDeck(ctx, orgId, ownerId);
  const now = new Date().toISOString();
  const id = await ctx.db.insert("srsCards", {
    organizationId: orgId,
    cardId: `${ownerId}-${Date.now()}`,
    deckId,
    ownerId,
    front: input.lexeme.surface,
    back: [input.translation, input.sense.definition].filter(Boolean).join(" — "),
    translation: input.translation,
    translationLocale: input.translationLocale,
    exampleSentence: input.occurrence.sentence,
    lemma: normalizeLexeme(input.lexeme.lemma),
    partOfSpeech: input.lexeme.partOfSpeech,
    senseId: input.sense.senseId,
    identityKey,
    sourceLessonId: input.sourceLessonId,
    sourceLibraryMaterialId: input.sourceLibraryMaterialId,
    addedBy: input.addedBy,
    interval: 0,
    easeFactor: 2.5,
    repetitions: 0,
    nextReviewDate: now.slice(0, 10),
    lastReviewDate: null,
  });
  await insertOccurrence(ctx, orgId, ownerId, id, input, occKey);
  return id;
}

/** Record one encounter. Re-adding the exact same occurrence is a no-op. */
async function insertOccurrence(
  ctx: MutationCtx,
  orgId: string,
  ownerId: string,
  cardId: Id<"srsCards">,
  input: SaveVocabularyInput,
  occKey: string
): Promise<void> {
  const existing = await ctx.db
    .query("vocabularyOccurrences")
    .withIndex("by_organization_and_cardId_and_occurrenceKey", (q) =>
      q.eq("organizationId", orgId).eq("cardId", cardId).eq("occurrenceKey", occKey)
    )
    .first();
  if (existing) return;

  const o = input.occurrence;
  await ctx.db.insert("vocabularyOccurrences", {
    organizationId: orgId,
    ownerId,
    cardId,
    sourceType: o.sourceType,
    sourceId: o.sourceId,
    unitId: o.unitId,
    sentence: o.sentence,
    rangeStart: o.range?.start,
    rangeEnd: o.range?.end,
    speaker: o.speaker,
    occurrenceKey: occKey,
    createdAt: new Date().toISOString(),
  });
}
