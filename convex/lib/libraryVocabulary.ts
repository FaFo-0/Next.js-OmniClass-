/**
 * Parse the JSON collection returned by the library vocabulary provider.
 *
 * Kept as a named export for its callers and tests; the envelope handling
 * itself is shared with every other provider answer so a wrapper key can never
 * silently produce zero rows in one path but not another.
 */
import { parseJsonCollection } from "./jsonCollection";

export function parseVocabularyResponse(raw: string): Array<Record<string, unknown>> {
  return parseJsonCollection(raw);
}
