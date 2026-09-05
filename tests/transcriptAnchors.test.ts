import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUtterances,
  resolveCandidateContext,
  type TranscriptToken,
} from "../src/lib/transcriptAnchors.ts";

function tok(text: string, speaker: string, startMs: number, endMs: number, isFinal = true): TranscriptToken {
  return { text, isFinal, startMs, endMs, speaker };
}

test("buildUtterances groups final tokens by speaker into stable utterances", () => {
  const tokens = [
    tok("Hello", "spk-a", 0, 400),
    tok(" there.", "spk-a", 400, 900),
    tok("Hi", "spk-b", 1000, 1200),
    tok(" teacher.", "spk-b", 1200, 1500),
  ];
  const utterances = buildUtterances(tokens);
  assert.equal(utterances.length, 2);
  assert.equal(utterances[0].speaker, "Teacher");
  assert.equal(utterances[0].text, "Hello there.");
  assert.equal(utterances[1].speaker, "Student");
  assert.equal(utterances[1].text, "Hi teacher.");
});

test("buildUtterances assigns stable ids so the same input yields the same anchor", () => {
  const tokens = [tok("I went home.", "spk-b", 500, 1200)];
  const a = buildUtterances(tokens);
  const b = buildUtterances(tokens);
  assert.equal(a[0].id, b[0].id);
});

test("buildUtterances carries the utterance's time range", () => {
  const tokens = [tok("One", "spk-a", 100, 300), tok(" two", "spk-a", 300, 500)];
  const [u] = buildUtterances(tokens);
  assert.equal(u.startMs, 100);
  assert.equal(u.endMs, 500);
});

test("resolveCandidateContext returns the exact utterance sentence with a range", () => {
  const tokens = [tok("I went home after class.", "spk-b", 500, 2200)];
  const [u] = buildUtterances(tokens);
  const ctx = resolveCandidateContext(u, "went");
  assert.equal(ctx.sentence, "I went home after class.");
  assert.deepEqual(ctx.range, { start: 500, end: 2200 });
});

test("resolveCandidateContext rejects a fabricated word not present verbatim in the utterance", () => {
  const tokens = [tok("I went home.", "spk-b", 500, 1200)];
  const [u] = buildUtterances(tokens);
  // "ran" does not appear verbatim — the extractor must not paraphrase.
  assert.throws(() => resolveCandidateContext(u, "ran"), /not present/);
});

test("resolveCandidateContext matches a multi-word phrase in context", () => {
  const tokens = [tok("I look after my sister.", "spk-b", 0, 800)];
  const [u] = buildUtterances(tokens);
  const ctx = resolveCandidateContext(u, "look after");
  assert.equal(ctx.sentence, "I look after my sister.");
});
