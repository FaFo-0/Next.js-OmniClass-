/**
 * Parse AI response for vocabulary extraction.
 */
export function parseVocabulary(
  content: string
): Array<{
  arabic: string;
  transliteration: string;
  translation: string;
  partOfSpeech: string;
}> {
  try {
    const jsonStr = extractJson(content);
    console.log("[AI] parseVocabulary extracted JSON:", jsonStr.substring(0, 300));
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
      console.warn("[AI] parseVocabulary: parsed result is not an array:", typeof parsed);
      return [];
    }
    const filtered = parsed.filter(
      (v) => (v.arabic || v.english || v.word) && v.translation
    );
    console.log(`[AI] parseVocabulary: ${parsed.length} items parsed, ${filtered.length} after filter`);
    return filtered;
  } catch (err) {
    console.error("[AI] parseVocabulary FAILED to parse:", err, "\nRaw content:", content.substring(0, 500));
    return [];
  }
}

/**
 * Parse AI response for flashcard generation.
 */
export function parseFlashcards(
  content: string
): Array<{ front: string; back: string }> {
  try {
    const parsed = JSON.parse(extractJson(content));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((f) => f.front && f.back);
  } catch {
    return [];
  }
}

/**
 * Parse AI response for quiz generation.
 */
export function parseQuiz(
  content: string
): Array<{
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}> {
  try {
    const parsed = JSON.parse(extractJson(content));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (q) =>
        q.question &&
        Array.isArray(q.options) &&
        q.options.length >= 2 &&
        typeof q.correctIndex === "number"
    );
  } catch {
    return [];
  }
}

/**
 * Extract JSON from a string that might contain markdown code fences,
 * extra text, trailing commas, or be truncated.
 */
function extractJson(text: string): string {
  console.log("[AI] extractJson input:", text.substring(0, 300));

  // Strategy 1: direct parse
  try { JSON.parse(text.trim()); return text.trim(); } catch { /* continue */ }

  // Strategy 2: code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    try { JSON.parse(inner); return inner; } catch { /* continue with inner as candidate */ }
  }

  // Strategy 3: bracket-match the first [ ... ] or { ... }
  const candidate = fenceMatch ? fenceMatch[1].trim() : text.trim();
  const startChar = candidate.indexOf("[") >= 0 ? "[" : candidate.indexOf("{") >= 0 ? "{" : null;

  if (startChar) {
    const endChar = startChar === "[" ? "]" : "}";
    const startIdx = candidate.indexOf(startChar);
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIdx; i < candidate.length; i++) {
      const ch = candidate[i];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === startChar || ch === (startChar === "[" ? "{" : "[")) depth++;
      if (ch === endChar || ch === (endChar === "]" ? "}" : "]")) depth--;
      if (depth === 0) {
        const extracted = candidate.substring(startIdx, i + 1);
        try { JSON.parse(extracted); return extracted; } catch { break; }
      }
    }
  }

  // Strategy 4: salvage truncated array — find last complete "}" and close
  const arrStart = candidate.indexOf("[");
  if (arrStart >= 0) {
    let json = candidate.substring(arrStart);
    const lastBrace = json.lastIndexOf("}");
    if (lastBrace > 0) {
      // Cut after last complete object, remove trailing comma, close array
      let salvaged = json.substring(0, lastBrace + 1).replace(/,\s*$/, "") + "]";
      try {
        JSON.parse(salvaged);
        console.warn("[AI] extractJson: salvaged truncated JSON array");
        return salvaged;
      } catch { /* continue */ }
    }
  }

  // Fallback: return the candidate as-is (will fail at caller)
  console.error("[AI] extractJson: all strategies failed");
  return candidate;
}
