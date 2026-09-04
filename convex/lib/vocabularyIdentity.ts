/**
 * Source-agnostic, sense-aware vocabulary identity (server-side copy).
 *
 * Mirrors src/lib/vocabulary/identity.ts — keep both in sync.
 *
 * The single invariant of the unified vocabulary model: every word learned
 * from any source becomes the same learner-owned vocabulary item, identified
 * by *meaning*, not by lowercase spelling. These pure functions are shared by
 * every ingestion path (library save, lesson publish, teacher push, manual).
 */

export type LanguageCode = "en" | "ru" | "ar";

export type SourceType =
  | "library"
  | "live_lesson"
  | "uploaded_document"
  | "manual"
  | "assignment";

export interface Lexeme {
  surface: string;
  lemma: string;
  language: LanguageCode;
  partOfSpeech?: string;
}

export interface Sense {
  senseId: string;
  definition: string;
}

export interface Occurrence {
  sourceType: SourceType;
  sourceId: string;
  unitId?: string;
  sentence: string;
  range?: { start?: number; end?: number };
  speaker?: string;
}

/** Lowercase, trim, collapse internal whitespace. Multi-word phrases survive. */
export function normalizeLexeme(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Canonical dedup identity: learner language + lexeme + part of speech + sense.
 * Source is deliberately absent so a library and a lesson occurrence of the
 * same sense merge into one item, while the same spelling with a different
 * sense or part of speech stays separate.
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
  return [o.sourceType, o.sourceId, o.unitId ?? "", o.sentence].join("::");
}
