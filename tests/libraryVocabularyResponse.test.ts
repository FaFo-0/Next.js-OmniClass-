import assert from "node:assert/strict";
import test from "node:test";
import { parseVocabularyResponse } from "../convex/lib/libraryVocabulary.ts";

test("library vocabulary response parsing accepts the documented top-level array", () => {
  assert.equal(parseVocabularyResponse('[{"w":"travel","d":"go from place to place"}]').length, 1);
});

test("library vocabulary response parsing accepts provider envelopes", () => {
  assert.deepEqual(parseVocabularyResponse('{"vocabulary":[{"w":"travel","d":"go from place to place"}]}'), [
      { w: "travel", d: "go from place to place" },
    ]);
});

test("library vocabulary response parsing strips fenced JSON", () => {
  assert.equal(parseVocabularyResponse('```json\n{"words":[{"w":"book"}]}\n```').length, 1);
});
