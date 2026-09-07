import assert from "node:assert/strict";
import test from "node:test";
import { chunkTranscript, utteranceIdFor } from "../convex/lib/transcriptChunking.ts";

// TEACHER-REVIEW INVARIANT — a non-empty persisted transcript must be able
// to produce durable structured utterances with stable ids and exact source
// text, otherwise vocabulary generation can't run for every recording mode.
test("chunks a transcript deterministically", () => {
  const text =
    "Good morning, class. Today we are going to talk about the future tense. " +
    "When do we use \"will\"? We use it for predictions and spontaneous decisions. " +
    "Let's practise together. " +
    "Next week we will also look at the present perfect, which is used for life experience, " +
    "and we will compare it with the past simple in a set of controlled exercises. ".repeat(2);

  const a = chunkTranscript(text);
  const b = chunkTranscript(text);
  assert.deepEqual(a, b, "same input must produce identical segments");
  assert.ok(a.length >= 3, "expected several segments");
  assert.ok(
    a.every((s) => s.length <= 220),
    "no segment exceeds the cap"
  );
  assert.ok(
    a.join(" ").replace(/\s+/g, " ").trim() ===
      text.replace(/\s+/g, " ").trim(),
    "segments reassemble to the exact source text (no invented content)"
  );
});

test("stable utterance ids", () => {
  const segments = chunkTranscript(
    "One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten. ".repeat(20)
  );
  assert.ok(segments.length > 5);
  assert.deepEqual(
    segments.map((_, i) => utteranceIdFor(i)),
    segments.map((_, i) => `u${i}`)
  );
  assert.equal(utteranceIdFor(3), "u3", "ids are deterministic and zero-based");
});

test("empty / whitespace-only transcript yields no segments", () => {
  assert.deepEqual(chunkTranscript(""), []);
  assert.deepEqual(chunkTranscript("   \n  "), []);
});

test("a single very long sentence is hard-wrapped at word boundaries", () => {
  const long = "word ".repeat(120).trim();
  const segments = chunkTranscript(long);
  assert.ok(segments.length > 1);
  assert.ok(segments.every((s) => s.length <= 220));
  assert.equal(
    segments.join(" "),
    long,
    "hard wrap must never split a word or drop text"
  );
});