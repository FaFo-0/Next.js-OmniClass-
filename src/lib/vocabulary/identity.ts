/**
 * Source-agnostic, sense-aware vocabulary identity.
 *
 * The single invariant of the unified vocabulary model: every word learned
 * from any source (library reading, live lesson transcript, uploaded document,
 * teacher distribution, manual add) becomes the same learner-owned vocabulary
 * item — identified by *meaning*, not by lowercase spelling.
 *
 * These are pure functions with no Convex dependency, so the identity and
 * merge rules can be tested in isolation and shared by every ingestion path.
 */

export type LanguageCode = "en" | "ru" | "ar";

export type SourceType =
  | "library" // published academy work (book/article/…)
  | "live_lesson" // recorded + transcribed lesson
  | "uploaded_document" // private student document
  | "manual" // typed by learner or teacher
  | "assignment"; // homework/assignment transfer

/**
 * A normalized lexeme: a lemma or a multi-word expression. `surface` is how it
 * appeared ("went"); `lemma` is its canonical form ("go"). "look after" is a
 * single lexeme, not three words.
 */
export interface Lexeme {
  surface: string;
  lemma: string;
  language: LanguageCode; // the language being learned
  partOfSpeech?: string;
}

/** A specific meaning of a lexeme. `bank` (finance) and `bank` (river) are two senses. */
export interface Sense {
  senseId: string; // stable canonical id, e.g. "bank::river"
  definition: string; // contextual English definition
}

/** Where the learner met this sense — the exact source sentence is never paraphrased. */
export interface Occurrence {
  sourceType: SourceType;
  sourceId: string; // workId / lessonId / documentId
  unitId?: string; // chapter / utterance / segment
  sentence: string; // EXACT source sentence or transcript utterance
  range?: { start?: number; end?: number }; // timestamps (ms) or offsets
  speaker?: string;
  // Only transcript sources use this. It preserves which finalized transcript
  // revision supplied the encounter when a recording is corrected later.
  transcriptVersion?: number;
}

/** The learner's relationship to one sense. One row in My Words. */
export interface LearnerVocabularyItem {
  identityKey: string;
  lemma: string;
  senseId: string;
  translation: string;
  translationLocale: LanguageCode;
  occurrences: Occurrence[];
}

/** Lowercase, trim, collapse internal whitespace. Multi-word phrases survive. */
export function normalizeLexeme(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * The canonical dedup identity: learner language + lexeme + part of speech +
 * sense. Source is deliberately absent — a library occurrence and a lesson
 * occurrence of the same sense must produce the SAME key and merge into one
 * item, while the same spelling with a different sense or part of speech
 * produces a DIFFERENT key and a separate item.
 */
export function vocabularyIdentityKey(
  learnerLanguage: LanguageCode,
  lexeme: Lexeme,
  sense: Sense
): string {
  return [
    learnerLanguage,
    normalizeLexeme(lexeme.lemma),
    lexeme.partOfSpeech ?? "",
    sense.senseId,
  ].join("::");
}

/** Stable identity for one occurrence, used to avoid re-adding the same encounter. */
export function occurrenceKey(o: Occurrence): string {
  return [o.sourceType, o.sourceId, o.unitId ?? "", o.transcriptVersion ?? "", o.sentence].join("::");
}

/**
 * Add an encounter to a learner's item. Re-encountering the exact same source
 * occurrence is a no-op (returns `changed: false`) so the same sentence never
 * becomes a duplicate card.
 */
export function addOccurrence(
  item: LearnerVocabularyItem,
  occurrence: Occurrence
): { changed: boolean; item: LearnerVocabularyItem } {
  const key = occurrenceKey(occurrence);
  if (item.occurrences.some((o) => occurrenceKey(o) === key)) {
    return { changed: false, item };
  }
  return {
    changed: true,
    item: { ...item, occurrences: [...item.occurrences, occurrence] },
  };
}

/**
 * Find the learner's existing item for the same sense, or `undefined` when the
 * spelling matches but the meaning differs — signalling a new sense-level item
 * rather than a merge.
 */
export function resolveTargetItem(
  items: LearnerVocabularyItem[],
  learnerLanguage: LanguageCode,
  lexeme: Lexeme,
  sense: Sense
): LearnerVocabularyItem | undefined {
  const key = vocabularyIdentityKey(learnerLanguage, lexeme, sense);
  return items.find((i) => i.identityKey === key);
}
