import assert from "node:assert/strict";
import test from "node:test";
import {
  splitMarkdownIntoUnits,
  estimateReadMinutes,
  countWords,
  normalizeTopicTags,
} from "../convex/lib/libraryContent.ts";

test("a document without headings is a single unit", () => {
  const units = splitMarkdownIntoUnits("Just a single paragraph of text.", "Reading");
  assert.equal(units.length, 1);
  assert.equal(units[0].title, "Reading");
  assert.ok(units[0].contentMarkdown.includes("single paragraph"));
});

test("splits a book on level-2 headings into ordered chapters", () => {
  const book = [
    "# My Book",
    "A short foreword.",
    "",
    "## Chapter One",
    "It was the best of times.",
    "",
    "## Chapter Two",
    "It was the worst of times.",
  ].join("\n");

  const units = splitMarkdownIntoUnits(book, "Reading");
  assert.equal(units.length, 2);
  assert.equal(units[0].title, "Chapter One");
  assert.equal(units[1].title, "Chapter Two");
  // Foreword attaches to the first chapter, never dropped.
  assert.ok(units[0].contentMarkdown.includes("foreword"));
  assert.ok(units[1].contentMarkdown.includes("worst of times"));
});

test("strips a leading level-1 title so it is not body text", () => {
  const units = splitMarkdownIntoUnits("# Title\n\nBody text.", "Reading");
  assert.equal(units.length, 1);
  assert.equal(units[0].title, "Reading");
  assert.equal(units[0].contentMarkdown.trim(), "Body text.");
});

test("empty or whitespace-only input produces no units", () => {
  assert.deepEqual(splitMarkdownIntoUnits("", "Reading"), []);
  assert.deepEqual(splitMarkdownIntoUnits("   \n\n  ", "Reading"), []);
});

test("empty chapter body is dropped", () => {
  const units = splitMarkdownIntoUnits("## Empty\n\n## Real\nSome text.", "Reading");
  assert.equal(units.length, 1);
  assert.equal(units[0].title, "Real");
});

test("read time scales with word count and never goes below one minute", () => {
  assert.equal(estimateReadMinutes(""), 1);
  assert.equal(estimateReadMinutes("one two three"), 1);
  // 1000 words ≈ 5 minutes at 200 wpm.
  const longText = Array.from({ length: 1000 }, () => "word").join(" ");
  assert.equal(estimateReadMinutes(longText), 5);
});

test("countWords ignores punctuation and counts hyphenated and apostrophe words", () => {
  assert.equal(countWords("Hello, world!"), 2);
  assert.equal(countWords("don't stop-in a moment"), 4);
});

test("normalizeTopicTags dedupes, lowercases and drops blanks", () => {
  assert.deepEqual(normalizeTopicTags(["Travel", "travel", "", "  DAILY-LIFE "]), [
    "travel",
    "daily-life",
  ]);
});
