/** Shared reader/preparation text rules. Source prose is never rewritten. */

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
 * Grouping bounds request size. Context identity always remains word + sentence;
 * a repeated surface in another sentence is a separate translation request.
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

/** Each unique word/sentence pair keeps its own meaning; identical occurrences share a key. */
export interface GroupWordQuery { key: string; word: string; sentences: string[] }
export function groupVocabularyQuery(group: ReadingGroup): GroupWordQuery[] {
  return group.tokens.map(token => ({ key: token.key, word: token.word, sentences: [token.sentence] }));
}

export const PREPARATION_VERSION = 3;
export interface PreparationBatch { index: number; group: ReadingGroup; words: GroupWordQuery[] }
export const BATCH_WORDS = 40;
export function preparationBatches(title: string, markdown: string, groupSize = GROUP_OCCURRENCES, batchWords = BATCH_WORDS): PreparationBatch[] {
  const out: PreparationBatch[] = [];
  for (const group of readingGroups(title, markdown, groupSize)) {
    const words = groupVocabularyQuery(group);
    for (let i = 0; i < words.length; i += batchWords) out.push({ index: out.length, group, words: words.slice(i, i + batchWords) });
  }
  return out;
}

export interface LemmaEntry {
  key: string; word: string; lemma: string; senseId: string; definition: string; partOfSpeech: string;
  translations: { ru: string; ar: string; kk: string };
}
function rowText(row: Record<string, unknown>, name: string): string {
  return typeof row[name] === "string" ? String(row[name]).trim() : "";
}
/** A batch is complete only when every contextual key has all three translations. */
export function parseGroupVocabulary(raw: string, requested: GroupWordQuery[]): Map<string, LemmaEntry> {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const data = JSON.parse(cleaned);
  const rows: unknown[] = Array.isArray(data) ? data : data.words;
  if (!Array.isArray(rows)) throw new Error("Vocabulary response must contain entries");
  const wanted = new Map(requested.map(r => [r.key, r]));
  // Models copy opaque hash keys unreliably; resolve by key when correct and by
  // word/sentence text otherwise, so a mistyped hash doesn't void the batch.
  const byText = new Map(requested.map(r => [`${r.word}::${r.sentences[0].trim()}`, r]));
  const out = new Map<string, LemmaEntry>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const word = normalizeWord(rowText(record, "word"));
    const printedKey = rowText(record, "key");
    const sentence = rowText(record, "sentence");
    const match = wanted.get(printedKey)?.word === word ? wanted.get(printedKey)
      : byText.get(`${word}::${sentence.trim()}`) ?? requested.find(r => r.word === word && !out.has(r.key));
    if (!match || out.has(match.key)) continue;
    const key = match.key;
    const entry: LemmaEntry = {
      key, word,
      lemma: normalizeWord(rowText(record, "lemma")) || word,
      senseId: normalizeWord(rowText(record, "senseId")),
      definition: rowText(record, "definition"),
      partOfSpeech: rowText(record, "partOfSpeech"),
      translations: { ru: rowText(record, "ru"), ar: rowText(record, "ar"), kk: rowText(record, "kk") },
    };
    if (!entry.senseId || !entry.definition || !["noun", "verb", "adjective", "adverb", "other"].includes(entry.partOfSpeech) || Object.values(entry.translations).some(t => !t)) continue;
    if ([entry.lemma, entry.senseId, entry.definition, ...Object.values(entry.translations)].some(t => t.length > 700)) continue;
    out.set(key, entry);
  }
  // A handful of unresolved keys fall back to the reader's on-demand lookup;
  // retrying a whole batch for one dropped row never converges on long chapters.
  const allowedShortfall = Math.max(2, Math.ceil(requested.length * 0.1));
  if (requested.length && out.size < requested.length - allowedShortfall) throw new Error(`Incomplete vocabulary response (${out.size}/${requested.length})`);
  return out;
}

/** Match each prepared meaning to its exact contextual key. */
export function expandGroupVocabulary(group: ReadingGroup, prepared: ReadonlyMap<string, LemmaEntry>): PreparedWord[] {
  const words: PreparedWord[] = [];
  for (const token of group.tokens) {
    const entry = prepared.get(token.key);
    if (!entry) continue;
    words.push({ ...token, lemma: entry.lemma, senseId: entry.senseId, definition: entry.definition, partOfSpeech: entry.partOfSpeech, translations: entry.translations });
  }
  return words;
}
