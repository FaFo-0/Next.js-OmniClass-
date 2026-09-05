/**
 * Transcript vocabulary candidate anchoring.
 *
 * An AI may suggest a word or phrase, but it never supplies the context that a
 * learner sees. This helper verifies the suggestion against a stored utterance
 * and then copies the exact recorded sentence, speaker, and time range.
 */

export interface PersistedTranscriptUtterance {
  utteranceId: string;
  text: string;
  speaker?: string;
  startMs?: number;
  endMs?: number;
}

export interface AnchoredTranscriptVocabularyCandidate {
  candidateId: string;
  utteranceId: string;
  sentence: string;
  speaker?: string;
  range: { start?: number; end?: number };
}

function normalizeSurface(surface: string): string {
  return surface.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Escape user-controlled phrase text before using it in a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Verify that `surface` appears as a whole word / phrase in an utterance.
 * `\b` prevents "he" from being accepted because "the" was spoken while
 * still allowing multi-word phrases such as "look after".
 */
function containsCompleteSurface(text: string, surface: string): boolean {
  const escapedPhrase = escapeRegExp(surface).replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escapedPhrase}\\b`, "i").test(text);
}

/**
 * Reuse a stored candidate ID only when it already belongs to this lesson.
 * This prevents a request from adopting an ID from another lesson while making
 * ordinary teacher edits update the original candidate row in place.
 */
export function resolveCandidateExternalId({
  lessonExternalId,
  suppliedExternalId,
  knownExistingIds,
  manualOrdinal,
  nowMs,
}: {
  lessonExternalId: string;
  suppliedExternalId?: string;
  knownExistingIds: ReadonlySet<string>;
  manualOrdinal: number;
  nowMs: number;
}): string {
  if (suppliedExternalId && knownExistingIds.has(suppliedExternalId)) {
    return suppliedExternalId;
  }
  return `${lessonExternalId}::manual::${nowMs}::${manualOrdinal}`;
}

/**
 * An AI-anchored row may be re-anchored to another stored utterance, but it
 * may not be silently downgraded to a teacher/manual row. That would allow a
 * caller-supplied example sentence to replace verified transcript evidence.
 */
export function assertTranscriptAnchorIsRetained(
  existingUtteranceId: string | undefined,
  submittedUtteranceId: string | undefined
): void {
  if (existingUtteranceId && !submittedUtteranceId) {
    throw new Error("An anchored transcript candidate cannot be converted to a manual candidate");
  }
}

/**
 * Make one teacher-reviewable candidate from a verified transcript utterance.
 * The stable ID makes a reprocessed transcript idempotent; the exact source
 * sentence always comes from the recorded utterance, never an AI response.
 */
export function anchorTranscriptVocabularyCandidate({
  lessonExternalId,
  surface,
  utterance,
}: {
  lessonExternalId: string;
  surface: string;
  utterance: PersistedTranscriptUtterance;
}): AnchoredTranscriptVocabularyCandidate {
  const normalized = normalizeSurface(surface);
  if (!normalized) throw new Error("Vocabulary surface is required");
  if (!utterance.text.trim()) throw new Error("Transcript utterance is empty");
  if (!containsCompleteSurface(utterance.text, normalized)) {
    throw new Error(
      `"${surface}" is not present as a complete word or phrase in transcript utterance "${utterance.text}"`
    );
  }

  return {
    candidateId: `${lessonExternalId}::${utterance.utteranceId}::${normalized}`,
    utteranceId: utterance.utteranceId,
    sentence: utterance.text,
    speaker: utterance.speaker,
    range: { start: utterance.startMs, end: utterance.endMs },
  };
}
