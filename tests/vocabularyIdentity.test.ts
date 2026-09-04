import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeLexeme,
  vocabularyIdentityKey,
  occurrenceKey,
  addOccurrence,
  resolveTargetItem,
  type LearnerVocabularyItem,
  type Lexeme,
  type Sense,
  type Occurrence,
} from "../src/lib/vocabulary/identity.ts";

// A canonical lexeme + sense for reuse across cases.
const goLexeme: Lexeme = { surface: "went", lemma: "go", language: "en", partOfSpeech: "verb" };
const goSense: Sense = { senseId: "go::move", definition: "to move from one place to another" };

function item(key: string, occurrences: Occurrence[]): LearnerVocabularyItem {
  return {
    identityKey: key,
    lemma: "go",
    senseId: goSense.senseId,
    translation: "идти",
    translationLocale: "ru",
    occurrences,
  };
}

test("normalizeLexeme lowercases, trims, and collapses internal whitespace", () => {
  assert.equal(normalizeLexeme("  Look   AFTER "), "look after");
});

test("normalizeLexeme preserves multi-word expressions as a single lexeme", () => {
  assert.equal(normalizeLexeme("Look After"), "look after");
});

test("vocabularyIdentityKey separates different senses of the same spelling", () => {
  const finance = vocabularyIdentityKey("ru", { surface: "bank", lemma: "bank", language: "en", partOfSpeech: "noun" }, { senseId: "bank::finance", definition: "financial institution" });
  const river = vocabularyIdentityKey("ru", { surface: "bank", lemma: "bank", language: "en", partOfSpeech: "noun" }, { senseId: "bank::river", definition: "edge of a river" });
  assert.notEqual(finance, river);
});

test("vocabularyIdentityKey is independent of source, so library and lesson converge", () => {
  const k = vocabularyIdentityKey("ru", goLexeme, goSense);
  // The key must not mention any source type or source id.
  assert.equal(k.includes("library"), false);
  assert.equal(k.includes("lesson"), false);
});

test("vocabularyIdentityKey distinguishes by part of speech", () => {
  const verb = vocabularyIdentityKey("ru", { ...goLexeme, partOfSpeech: "verb" }, goSense);
  const noun = vocabularyIdentityKey("ru", { ...goLexeme, partOfSpeech: "noun" }, goSense);
  assert.notEqual(verb, noun);
});

test("vocabularyIdentityKey distinguishes by learner language", () => {
  const ru = vocabularyIdentityKey("ru", goLexeme, goSense);
  const ar = vocabularyIdentityKey("ar", goLexeme, goSense);
  assert.notEqual(ru, ar);
});

test("occurrenceKey distinguishes transcript revisions of the same utterance", () => {
  const base = {
    sourceType: "live_lesson" as const,
    sourceId: "lesson-1",
    unitId: "teacher-0-0",
    sentence: "Please look after your brother.",
  };
  assert.notEqual(
    occurrenceKey({ ...base, transcriptVersion: 1 }),
    occurrenceKey({ ...base, transcriptVersion: 2 })
  );
});

test("occurrenceKey is stable for the same source occurrence", () => {
  const a: Occurrence = { sourceType: "live_lesson", sourceId: "lesson-1", unitId: "utt-42", sentence: "I went home after class.", range: { start: 1200, end: 3200 }, speaker: "Student" };
  const b: Occurrence = { sourceType: "live_lesson", sourceId: "lesson-1", unitId: "utt-42", sentence: "I went home after class.", range: { start: 1200, end: 3200 }, speaker: "Student" };
  assert.equal(occurrenceKey(a), occurrenceKey(b));
});

test("addOccurrence appends a new encounter and does not duplicate an identical one", () => {
  const lessonOcc: Occurrence = { sourceType: "live_lesson", sourceId: "lesson-1", unitId: "utt-42", sentence: "I went home after class.", speaker: "Student" };
  const base = item(vocabularyIdentityKey("ru", goLexeme, goSense), [lessonOcc]);

  const libraryOcc: Occurrence = { sourceType: "library", sourceId: "work-9", unitId: "ch-2", sentence: "Then she went to the shop." };
  const merged = addOccurrence(base, libraryOcc);
  assert.equal(merged.changed, true);
  assert.equal(merged.item.occurrences.length, 2);

  // The same library occurrence again must be a no-op, not a duplicate card.
  const again = addOccurrence(merged.item, libraryOcc);
  assert.equal(again.changed, false);
  assert.equal(again.item.occurrences.length, 2);
});

test("resolveTargetItem finds the learner's existing item for the same sense across sources", () => {
  const libraryOcc: Occurrence = { sourceType: "library", sourceId: "work-9", unitId: "ch-2", sentence: "Then she went to the shop." };
  const key = vocabularyIdentityKey("ru", goLexeme, goSense);
  const existing = item(key, [libraryOcc]);
  const found = resolveTargetItem([existing], "ru", goLexeme, goSense);
  assert.equal(found, existing);
});

test("resolveTargetItem returns undefined when the same spelling has a different sense", () => {
  const riverOcc: Occurrence = { sourceType: "library", sourceId: "work-9", unitId: "ch-2", sentence: "The boat reached the far bank." };
  const riverKey = vocabularyIdentityKey("ru", { surface: "bank", lemma: "bank", language: "en", partOfSpeech: "noun" }, { senseId: "bank::river", definition: "edge of a river" });
  const existing = item(riverKey, [riverOcc]);
  const found = resolveTargetItem([existing], "ru", { surface: "bank", lemma: "bank", language: "en", partOfSpeech: "noun" }, { senseId: "bank::finance", definition: "financial institution" });
  assert.equal(found, undefined);
});
