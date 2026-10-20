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
export function parsePreparedWords(raw: string, tokens: ReadingToken[]): PreparedWord[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const data = JSON.parse(cleaned);
  const rows: unknown[] = Array.isArray(data) ? data : data.words;
  if (!Array.isArray(rows)) throw new Error("Vocabulary response must contain entries");
  return tokens.map(token => {
    const row = rows.find((r): r is Record<string, unknown> => !!r && typeof r === "object" && (r as Record<string, unknown>).key === token.key);
    const text = (name: string) => typeof row?.[name] === "string" ? String(row[name]).trim() : "";
    const lemma = normalizeWord(text("lemma"));
    const definition = text("definition");
    const senseId = normalizeWord(text("senseId"));
    const translations = { ru: text("ru"), ar: text("ar"), kk: text("kk") };
    if (!lemma || !definition || !senseId || Object.values(translations).some(t => !t) || [lemma, definition, senseId, ...Object.values(translations)].some(t => t.length > 700)) throw new Error("Incomplete vocabulary response; publication waits for complete translations");
    return { ...token, lemma, senseId, definition, partOfSpeech: text("partOfSpeech"), translations };
  });
}
