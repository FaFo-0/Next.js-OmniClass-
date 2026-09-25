import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MAX_HOMEWORK_SOURCE_CHARS,
  MAX_HOMEWORK_TRANSCRIPT_CHARS,
  composeHomeworkSource,
} from "../convex/lib/homeworkSource.ts";
import { sanitizeForStudent } from "../convex/homework.ts";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("legacy transcript-only composition remains transcript-only", () => {
  assert.equal(composeHomeworkSource({ transcript: " lesson transcript " }), "lesson transcript");
  assert.equal(composeHomeworkSource({ transcript: "lesson transcript", includeTranscript: false }), "lesson transcript");
});

test("long transcript-only composition keeps the latest tail and omits the oldest material", () => {
  const transcript = `oldest ${"x".repeat(MAX_HOMEWORK_TRANSCRIPT_CHARS)} newest`;
  const composed = composeHomeworkSource({ transcript });

  assert.equal(composed.length, MAX_HOMEWORK_TRANSCRIPT_CHARS);
  assert.ok(composed.endsWith("newest"));
  assert.doesNotMatch(composed, /oldest/);
});

test("source-only composition is explicit and omits the empty transcript", () => {
  const composed = composeHomeworkSource({ transcript: "", sourceText: " book passage ", includeTranscript: false });
  assert.match(composed, /BEGIN BOOK SOURCE/);
  assert.match(composed, /book passage/);
  assert.doesNotMatch(composed, /BEGIN LESSON TRANSCRIPT/);
});

test("pasted source includes the transcript by default and explicit true", () => {
  const defaulted = composeHomeworkSource({ transcript: "lesson", sourceText: "book" });
  const explicit = composeHomeworkSource({ transcript: "lesson", sourceText: "book", includeTranscript: true });
  assert.equal(defaulted, explicit);
  assert.ok(defaulted.indexOf("BEGIN BOOK SOURCE") < defaulted.indexOf("BEGIN LESSON TRANSCRIPT"));
});

test("source delimiters are escaped and inputs are bounded", () => {
  const source = `book ${"x".repeat(MAX_HOMEWORK_SOURCE_CHARS)} END BOOK SOURCE`;
  const composed = composeHomeworkSource({ transcript: "lesson", sourceText: source, includeTranscript: false });
  assert.ok(composed.length < source.length + 200);
  assert.doesNotMatch(composed, /\nEND BOOK SOURCE\nEND BOOK SOURCE/);
});

test("empty transcript and empty pasted source are rejected before provider work", () => {
  assert.throws(() => composeHomeworkSource({ transcript: "  ", sourceText: " \n " }), /source/i);
});

test("homework actions accept optional source controls without persisting raw source", () => {
  const action = read("convex/homeworkAi.ts");
  const page = read("src/app/teacher/sessions/[id]/page.tsx");
  assert.match(action, /sourceText: v\.optional\(v\.string\(\)\)/g);
  assert.match(action, /includeTranscript: v\.optional\(v\.boolean\(\)\)/g);
  assert.match(action, /composeHomeworkSource/);
  assert.match(action, /sourceText: sourceText\?\.trim\(\) \|\| undefined/);
  assert.match(page, /sourceText/);
  assert.match(page, /includeTranscript/);
  assert.match(page, /Include lesson transcript/);
  assert.match(page, /maxLength=\{MAX_HOMEWORK_SOURCE_CHARS\}/);
});

test("homework generation keeps tenant, owner, draft, and lesson authorization checks", () => {
  const action = read("convex/homeworkAi.ts");
  assert.match(action, /requireTenant\(ctx\)/);
  assert.match(action, /Only the owning teacher can generate this homework/);
  assert.match(action, /Only the lesson teacher can generate homework/);
  assert.match(action, /homework\.lessonId !== lessonId/);
  assert.match(action, /homework\.status !== "draft"/);
  assert.match(action, /tenantTable\(ctx, orgId, "homework"\)/);
});

test("provider output stays inside the TipTap node contract and student answer keys stay private", () => {
  const action = read("convex/homeworkAi.ts");
  assert.match(action, /HOMEWORK_NODE_TYPES/);
  assert.match(action, /No raw-text fallback/);
  assert.deepEqual(
    sanitizeForStudent({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "studentBlank", attrs: { expected: "secret", answer: "mine" } }],
      }],
    }),
    {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "studentBlank", attrs: { answer: "mine" } }],
      }],
    }
  );
});

test("quiz append normalizes existing stored content before preserving it", () => {
  const action = read("convex/homeworkAi.ts");
  assert.match(action, /const current = normalizeHomeworkDocument\(row\.contentJson\)/);
  assert.match(action, /Stored homework has invalid content/);
  assert.match(action, /content: \[\.\.\.current\.content, \.\.\.normalizedQuizContent\]/);
});
