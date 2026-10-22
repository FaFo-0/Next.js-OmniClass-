import assert from "node:assert/strict";
import test from "node:test";
import {
  liveSessionSeconds,
  longerTranscript,
  utteranceRowsToDrop,
} from "../convex/lib/sessionClock.ts";

const T0 = "2026-10-22T09:00:00.000Z";

test("session length comes from the durable start, not the browser timer", () => {
  // A reloaded page restarts its own counter at zero; the lesson must not.
  assert.equal(liveSessionSeconds(T0, "2026-10-22T09:42:30.000Z", 12), 2550);
});

test("a session with no durable start falls back (uploaded recording)", () => {
  assert.equal(liveSessionSeconds(undefined, "2026-10-22T09:42:30.000Z", 3600), 3600);
  assert.equal(liveSessionSeconds("not-a-date", T0, 120), 120);
  assert.equal(liveSessionSeconds(T0, "2026-10-22T08:00:00.000Z", 90), 90);
});

test("a running session can never lose transcript text", () => {
  const stored = "Teacher: good morning";
  assert.equal(longerTranscript("Teacher: good morning. How are you?", stored), "Teacher: good morning. How are you?");
  // Stale or empty snapshot (reload, second window) leaves the record alone.
  assert.equal(longerTranscript("", stored), stored);
  assert.equal(longerTranscript("Teacher: good", stored), stored);
  assert.equal(longerTranscript("anything", undefined), "anything");
});

test("a resumed segment replaces its own utterances only", () => {
  const existing = ["u0", "u1", "u2", "s40_u0", "s40_u1"];
  // First segment writes again: only its own ids are replaced.
  assert.deepEqual(utteranceRowsToDrop(existing, ["u0", "u1"], ""), ["u0", "u1"]);
  // Resumed segment rewrites itself without touching the first segment.
  assert.deepEqual(utteranceRowsToDrop(existing, ["s40_u0", "s40_u1"], "s40_"), ["s40_u0", "s40_u1"]);
  // A shrinking same-segment snapshot also clears rows it left behind earlier.
  assert.deepEqual(utteranceRowsToDrop(existing, ["s40_u0"], "s40_"), ["s40_u0", "s40_u1"]);
});
