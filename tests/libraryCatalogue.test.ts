import test from "node:test";
import assert from "node:assert/strict";
import { cataloguePage, filterLibrary, initialLibraryFilter } from "../src/lib/libraryCatalogue";
import type { Doc } from "../convex/_generated/dataModel";
const works = Array.from({ length: 301 }, (_, i) => ({ _id: `${i}`, title: `Reading ${i}`, author: i % 2 ? "Aesop" : "Other", topicTags: [i % 2 ? "nature" : "travel"], levelCEFR: i % 2 ? "A2" : "B1", kind: "story", hasText: true, externalUrl: i % 3 ? undefined : "https://example.com" })) as Doc<"libraryWorks">[];
test("hundreds of catalogue entries have bounded, complete, non-overlapping pages", () => {
  const result = Array.from({ length: 13 }, (_, p) => cataloguePage(works, p).items).flat();
  assert.equal(cataloguePage(works, 0).items.length, 24);
  assert.deepEqual(result, works);
  assert.equal(new Set(result.map(w => w._id)).size, 301);
  assert.equal(cataloguePage(works.slice(0, 2), 12).page, 0);
  assert.equal(cataloguePage([], 0).pages, 1);
});
test("catalogue search combines with level, topic, kind and link filters", () => {
  const results = filterLibrary(works, { ...initialLibraryFilter, search: "  AESOP  ", level: "A2", topic: "nature", kind: "story", text: "link" });
  assert.equal(results.length, 50);
  assert.ok(results.every(w => w.author === "Aesop" && w.externalUrl));
  assert.equal(filterLibrary(works, { ...initialLibraryFilter, search: "no such work" }).length, 0);
});
