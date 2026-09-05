import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTranscriptAnchorIsRetained,
  anchorTranscriptVocabularyCandidate,
  resolveCandidateExternalId,
  type PersistedTranscriptUtterance,
} from "../convex/lib/transcriptVocabularyCandidates.ts";

const utterance: PersistedTranscriptUtterance = {
  utteranceId: "teacher-1",
  text: "Please look after the pronunciation in this sentence.",
  speaker: "Teacher",
  startMs: 12_000,
  endMs: 16_500,
};

test("anchors a proposed phrase to the exact recorded utterance", () => {
  const candidate = anchorTranscriptVocabularyCandidate({
    lessonExternalId: "lesson-42",
    surface: "look after",
    utterance,
  });

  assert.equal(candidate.candidateId, "lesson-42::teacher-1::look after");
  assert.equal(candidate.utteranceId, "teacher-1");
  assert.equal(candidate.sentence, utterance.text);
  assert.equal(candidate.speaker, "Teacher");
  assert.deepEqual(candidate.range, { start: 12_000, end: 16_500 });
});

test("uses word boundaries so a short word cannot match inside another word", () => {
  assert.throws(
    () =>
      anchorTranscriptVocabularyCandidate({
        lessonExternalId: "lesson-42",
        surface: "he",
        utterance: { ...utterance, text: "The pronunciation is clear." },
      }),
    /not present as a complete word or phrase/
  );
});

test("rejects a suggested word that was not actually said", () => {
  assert.throws(
    () =>
      anchorTranscriptVocabularyCandidate({
        lessonExternalId: "lesson-42",
        surface: "run away",
        utterance,
      }),
    /not present as a complete word or phrase/
  );
});

test("normalizes equivalent spacing in a phrase without changing the source sentence", () => {
  const candidate = anchorTranscriptVocabularyCandidate({
    lessonExternalId: "lesson-42",
    surface: " look   after ",
    utterance,
  });

  assert.equal(candidate.candidateId, "lesson-42::teacher-1::look after");
  assert.equal(candidate.sentence, utterance.text);
});

test("rejects removing an existing transcript anchor during review", () => {
  assert.throws(
    () => assertTranscriptAnchorIsRetained("teacher-1", undefined),
    /cannot be converted to a manual candidate/
  );
});
test("keeps a known teacher-added candidate ID across edits", () => {
  const externalId = resolveCandidateExternalId({
    lessonExternalId: "lesson-42",
    suppliedExternalId: "lesson-42::manual::1710000000000::1",
    knownExistingIds: new Set(["lesson-42::manual::1710000000000::1"]),
    manualOrdinal: 2,
    nowMs: 1720000000000,
  });

  assert.equal(externalId, "lesson-42::manual::1710000000000::1");
});

test("does not trust an unknown teacher-supplied candidate ID", () => {
  const externalId = resolveCandidateExternalId({
    lessonExternalId: "lesson-42",
    suppliedExternalId: "another-lesson::manual::1::1",
    knownExistingIds: new Set(),
    manualOrdinal: 2,
    nowMs: 1720000000000,
  });

  assert.equal(externalId, "lesson-42::manual::1720000000000::2");
});
