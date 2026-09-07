import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_TASK_IDS,
  getAiTask,
  isAiTaskId,
} from "../convex/lib/aiTasks.ts";

test("the canonical registry covers every launch AI producer", () => {
  assert.deepEqual(AI_TASK_IDS, [
    "lesson_summary",
    "vocab_extraction",
    "flashcard_generation",
    "homework_worksheet",
    "homework_quiz",
    "live_quiz",
    "conversation_questions",
    "library_vocabulary",
    "word_gloss",
  ]);
});

test("known task ids resolve to server-owned config metadata", () => {
  const task = getAiTask("vocab_extraction");
  assert.ok(task);
  assert.equal(task.configId, "vocab_extraction");
  assert.equal(task.outputFormat, "json");
  assert.equal(task.inputKey, "transcript");
  assert.equal(isAiTaskId("vocab_extraction"), true);
});

test("unknown task ids are rejected before provider configuration is resolved", () => {
  assert.equal(getAiTask("arbitrary-client-model"), null);
  assert.equal(isAiTaskId("arbitrary-client-model"), false);
});
