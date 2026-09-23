import { describe, expect, it } from "vitest";
import { parseVocabularyResponse } from "../convex/lib/libraryVocabulary";

describe("library vocabulary response parsing", () => {
  it("accepts the documented top-level array", () => {
    expect(parseVocabularyResponse('[{"w":"travel","d":"go from place to place"}]')).toHaveLength(1);
  });

  it("accepts provider responses wrapped in a vocabulary collection", () => {
    expect(parseVocabularyResponse('{"vocabulary":[{"w":"travel","d":"go from place to place"}]}')).toEqual([
      { w: "travel", d: "go from place to place" },
    ]);
  });

  it("strips a fenced JSON response before parsing", () => {
    expect(parseVocabularyResponse('```json\n{"words":[{"w":"book"}]}\n```')).toHaveLength(1);
  });
});
