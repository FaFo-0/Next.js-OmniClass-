/**
 * Tolerant reader for provider JSON answers (client side).
 *
 * `response_format: { type: "json_object" }` forces a JSON *object*, so a
 * reasoning-heavy model wraps the array the prompt asked for and names the key
 * itself. Observed live on OpenRouter with `deepseek/deepseek-v4.1-flash`:
 * `{"type": "json_object", "items": [ … ]}` — the model even echoes the request
 * parameter as a key. A bare array is equally legal when the model ignores JSON
 * mode.
 *
 * ORDER IS LOAD-BEARING: the whole document is parsed before anything is sliced
 * from the first `[`. Slicing first cut a valid wrapped answer down to
 * `[ {…} ]}` (invalid JSON), which silently produced zero rows and surfaced to
 * teachers as "Vocabulary generation returned no usable suggestions"
 * (2026-10-22). Mirror of `convex/lib/jsonCollection.ts`; keep both in step.
 */

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Wrapper keys seen from real provider answers, most specific first. */
const COLLECTION_KEYS = [
  "items",
  "questions",
  "flashcards",
  "vocabulary",
  "words",
  "results",
  "rows",
  "entries",
  "data",
];

/**
 * Pull the list out of an already-parsed JSON value: the array itself, a known
 * wrapper key, or — when the model invented its own key — the first array-valued
 * property, preferring one whose elements are objects.
 */
export function unwrapJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isJsonRecord(value)) return [];
  for (const key of COLLECTION_KEYS) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
  }
  const arrays = Object.values(value).filter((v): v is unknown[] => Array.isArray(v));
  return arrays.find((a) => a.length > 0 && isJsonRecord(a[0])) ?? arrays[0] ?? [];
}

function stripCodeFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The first balanced `[…]` or `{…}` value in the text, ignoring string content. */
function firstBalancedValue(text: string): string | null {
  const bracket = text.indexOf("[");
  const brace = text.indexOf("{");
  const start = bracket < 0 ? brace : brace < 0 ? bracket : Math.min(bracket, brace);
  if (start < 0) return null;
  const opener = text[start];
  const closer = opener === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === opener) depth += 1;
    else if (ch === closer) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/** Last resort for a truncated answer: keep the objects that closed cleanly. */
function salvageTruncatedArray(text: string): string | null {
  const start = text.indexOf("[");
  if (start < 0) return null;
  const slice = text.slice(start);
  const lastBrace = slice.lastIndexOf("}");
  if (lastBrace <= 0) return null;
  const candidate = `${slice.slice(0, lastBrace + 1).replace(/,\s*$/, "")}]`;
  return tryParse(candidate) === undefined ? null : candidate;
}

/** The provider's answer as a plain list, whatever envelope it arrived in. */
export function parseJsonArrayValue(raw: string): unknown[] {
  if (!raw) return [];
  const text = stripCodeFences(raw);
  if (!text) return [];

  const candidates: string[] = [];
  const balanced = firstBalancedValue(text);
  if (balanced) candidates.push(balanced);
  candidates.push(text);
  const bracket = text.indexOf("[");
  if (bracket >= 0) candidates.push(text.slice(bracket));
  const brace = text.indexOf("{");
  if (brace >= 0) candidates.push(text.slice(brace));
  const salvaged = salvageTruncatedArray(text);
  if (salvaged) candidates.push(salvaged);

  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed === undefined) continue;
    const rows = unwrapJsonArray(parsed);
    if (rows.length > 0) return rows;
  }
  return [];
}

/** Same, filtered to object rows (vocabulary, quiz, flashcard answers). */
export function parseJsonCollection(raw: string): Array<Record<string, unknown>> {
  return parseJsonArrayValue(raw).filter(isJsonRecord);
}

/**
 * Short description of what came back, for a failure the reader can act on:
 * "no JSON", "JSON array", or "JSON object (keys: …)".
 */
export function describeJsonAnswer(raw: string): string {
  const text = stripCodeFences(raw ?? "");
  if (!text) return "the model returned nothing";
  const balanced = firstBalancedValue(text);
  const direct = tryParse(text);
  const parsed = direct !== undefined ? direct : balanced !== null ? tryParse(balanced) : undefined;
  if (parsed === undefined) {
    return balanced === null
      ? "the model returned no JSON at all"
      : `the model returned no valid JSON (it started with “${balanced.slice(0, 40)}…”)`;
  }
  if (Array.isArray(parsed)) {
    return `the model returned an array of ${parsed.length} entries this app could not read`;
  }
  if (isJsonRecord(parsed)) {
    const keys = Object.keys(parsed).slice(0, 6).join(", ");
    return `the model returned a JSON object (keys: ${keys}) with no readable list`;
  }
  return "the model returned an unexpected JSON value";
}
