/** Parse the JSON collection returned by the library vocabulary provider. */
export function parseVocabularyResponse(raw: string): Array<Record<string, unknown>> {
  let txt = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    let parsed: unknown;
    try {
      parsed = JSON.parse(txt);
    } catch {
      const start = txt.indexOf("[");
      if (start < 0) return [];
      parsed = JSON.parse(txt.slice(start));
    }
    if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
    if (parsed && typeof parsed === "object") {
      const wrapped = parsed as Record<string, unknown>;
      for (const key of ["words", "vocabulary", "items", "results"]) {
        if (Array.isArray(wrapped[key])) return wrapped[key] as Array<Record<string, unknown>>;
      }
    }
    return [];
  } catch {
    return [];
  }
}
