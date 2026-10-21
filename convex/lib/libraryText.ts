/** Shared reader/preparation text rules. Source prose is never rewritten. */
import { isFrequentWord } from "./englishFrequency";

export function stripInline(s: string): string {
  return s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2").replace(/(\*|_)(.*?)\1/g, "$2").replace(/`([^`]*)`/g, "$1").trim();
}
export function readingLines(markdown: string): string[] {
  return markdown.split(/\n+/).map(line => stripInline(line.trim().replace(/^#{1,6}\s+|^>\s?|^[-*+]\s+/g, "")))
    .filter(line => line && !/^([-*_])\1{2,}$/.test(line));
}
export function sentences(text: string): string[] { return text.split(/(?<=[.!?])\s+/).filter(Boolean); }
export function normalizeWord(word: string): string { return word.toLowerCase().replace(/^[ '-]+|[ '-]+$/g, ""); }
export interface ReadingToken { key: string; word: string; sentence: string }
export function readingTokens(title: string, markdown: string): ReadingToken[] {
  const out: ReadingToken[] = [];
  const seen = new Set<string>();
  for (const line of [title, ...readingLines(markdown)]) for (const sentence of sentences(line)) {
    for (const match of sentence.matchAll(/[\p{L}][\p{L}'-]*/gu)) {
      const word = normalizeWord(match[0]);
      const key = tokenKey(word, sentence);
      if (!seen.has(key)) { seen.add(key); out.push({ key, word, sentence }); }
    }
  }
  return out;
}
/** Hash is only a local lookup key; exact sentence and word are also validated. */
export function tokenKey(word: string, sentence: string): string {
  const input = `${normalizeWord(word)}::${sentence}`;
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
export interface PreparedWord extends ReadingToken {
  lemma: string; senseId: string; definition: string; partOfSpeech: string;
  translations: { ru: string; ar: string; kk: string };
  audioUrl?: string; ipa?: string;
}

/**
 * Preparation is grouped, not chapter-wide and not per occurrence: a group is
 * a paragraph run the reader reaches in one sitting, so its senses stay local
 * ("bank" by the river and "bank" lending money usually land in different
 * groups) while the prompt carries each distinct word once instead of once per
 * sentence. Group indexes are the preparation cursor.
 */
export interface ReadingGroup { index: number; tokens: ReadingToken[] }
export const GROUP_OCCURRENCES = 900;

export function readingGroups(title: string, markdown: string, groupSize = GROUP_OCCURRENCES): ReadingGroup[] {
  const groups: ReadingGroup[] = [{ index: 0, tokens: [] }];
  let count = 0;
  const push = (token: ReadingToken) => {
    if (count >= groupSize) { groups.push({ index: groups.length, tokens: [] }); count = 0; }
    groups[groups.length - 1].tokens.push(token);
    count++;
  };
  const seen = new Set<string>();
  for (const line of [title, ...readingLines(markdown)]) for (const sentence of sentences(line)) {
    for (const match of sentence.matchAll(/[\p{L}][\p{L}'-]*/gu)) {
      const word = normalizeWord(match[0]);
      const key = tokenKey(word, sentence);
      if (seen.has(key)) continue;
      seen.add(key);
      push({ key, word, sentence });
    }
  }
  return groups.filter(group => group.tokens.length > 0);
}

/**
 * Words that should never be sent for preparation: names (capitalised away from
 * a sentence start inside this chapter) and words common enough that the
 * dictionary meaning is already the contextual one. Both fall through to the
 * reader's on-demand lookup.
 */
export function chapterProperWords(_title: string, markdown: string): Set<string> {
  const proper = new Set<string>();
  for (const line of readingLines(markdown)) for (const sentence of sentences(line)) {
    for (const match of sentence.matchAll(/[\p{L}][\p{L}'-]*/gu)) {
      const raw = match[0];
      if (match.index === 0 || !/^\p{Lu}/u.test(raw)) continue;
      proper.add(normalizeWord(raw));
    }
  }
  return proper;
}

export interface GroupWordQuery { word: string; sentences: string[] }
/** Distinct, non-trivial words of one group, in reading order, with context. */
export function groupVocabularyQuery(group: ReadingGroup, proper: ReadonlySet<string>): GroupWordQuery[] {
  const byWord = new Map<string, GroupWordQuery>();
  for (const token of group.tokens) {
    if (byWord.has(token.word) || proper.has(token.word) || isFrequentWord(token.word)) continue;
    if (token.word.length < 3) continue;
    byWord.set(token.word, { word: token.word, sentences: [token.sentence] });
  }
  for (const token of group.tokens) {
    const row = byWord.get(token.word);
    if (row && row.sentences.length < 2 && !row.sentences.includes(token.sentence)) row.sentences.push(token.sentence);
  }
  return [...byWord.values()];
}

/**
 * The unit of paid work: at most BATCH_WORDS distinct words from one group.
 * The cursor over this flat list is `preparationCursor`, so a chapter is
 * prepared in order and a reader who stops halfway only ever paid for what
 * they reached.
 */
export interface PreparationBatch { index: number; group: ReadingGroup; words: GroupWordQuery[] }
export const BATCH_WORDS = 40;
export function preparationBatches(title: string, markdown: string, groupSize = GROUP_OCCURRENCES, batchWords = BATCH_WORDS): PreparationBatch[] {
  const proper = chapterProperWords(title, markdown);
  const out: PreparationBatch[] = [];
  for (const group of readingGroups(title, markdown, groupSize)) {
    const words = groupVocabularyQuery(group, proper);
    for (let i = 0; i < words.length; i += batchWords) out.push({ index: out.length, group, words: words.slice(i, i + batchWords) });
  }
  return out;
}

export interface LemmaEntry {
  word: string; lemma: string; senseId: string; definition: string; partOfSpeech: string;
  translations: { ru: string; ar: string; kk: string };
}
function rowText(row: Record<string, unknown>, name: string): string {
  return typeof row[name] === "string" ? String(row[name]).trim() : "";
}
/**
 * Parse one group's answer. Partial answers are kept — the missing words simply
 * fall back to the reader's lookup — but a response that resolves less than
 * MIN_COVERAGE of the requested words is treated as a failure so it retries.
 */
const MIN_COVERAGE = 0.6;
export function parseGroupVocabulary(raw: string, requested: GroupWordQuery[]): Map<string, LemmaEntry> {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const data = JSON.parse(cleaned);
  const rows: unknown[] = Array.isArray(data) ? data : data.words;
  if (!Array.isArray(rows)) throw new Error("Vocabulary response must contain entries");
  const wanted = new Set(requested.map(r => r.word));
  const out = new Map<string, LemmaEntry>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const word = normalizeWord(rowText(record, "word"));
    if (!wanted.has(word) || out.has(word)) continue;
    const entry: LemmaEntry = {
      word,
      lemma: normalizeWord(rowText(record, "lemma")) || word,
      senseId: normalizeWord(rowText(record, "senseId")),
      definition: rowText(record, "definition"),
      partOfSpeech: rowText(record, "partOfSpeech"),
      translations: { ru: rowText(record, "ru"), ar: rowText(record, "ar"), kk: rowText(record, "kk") },
    };
    if (!entry.senseId || !entry.definition || Object.values(entry.translations).some(t => !t)) continue;
    if ([entry.lemma, entry.senseId, entry.definition, ...Object.values(entry.translations)].some(t => t.length > 700)) continue;
    out.set(word, entry);
  }
  if (requested.length && out.size < Math.max(1, Math.ceil(requested.length * MIN_COVERAGE))) throw new Error("Incomplete vocabulary response");
  return out;
}

/** Spread each group sense over every occurrence in that group, keeping the reader's (word, sentence) keys. */
export function expandGroupVocabulary(group: ReadingGroup, prepared: ReadonlyMap<string, LemmaEntry>): PreparedWord[] {
  const words: PreparedWord[] = [];
  for (const token of group.tokens) {
    const entry = prepared.get(token.word);
    if (!entry) continue;
    words.push({ ...token, lemma: entry.lemma, senseId: entry.senseId, definition: entry.definition, partOfSpeech: entry.partOfSpeech, translations: entry.translations });
  }
  return words;
}
