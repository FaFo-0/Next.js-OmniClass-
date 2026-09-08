import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_TASK_IDS,
  getAiTask,
  getAiTaskPlaceholder,
  isAiTaskId,
} from "../convex/lib/aiTasks.ts";
import { defaultPromptConfigs } from "../convex/lib/defaultPrompts.ts";

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
  assert.equal(getAiTaskPlaceholder("arbitrary-client-model"), null);
  assert.equal(isAiTaskId("arbitrary-client-model"), false);
});

test("every registry producer has a complete server-owned fallback config", () => {
  for (const taskId of AI_TASK_IDS) {
    const task = getAiTask(taskId);
    const config = defaultPromptConfigs.find((item) => item.configId === taskId);

    assert.ok(task, `${taskId} must be in the task registry`);
    assert.ok(config, `${taskId} must have a built-in fallback`);
    assert.equal(config.outputFormat, task.outputFormat);
    assert.ok(config.model.trim(), `${taskId} must own its model on the server`);
    const placeholder = getAiTaskPlaceholder(taskId);
    assert.equal(placeholder, `{{${task.inputKey}}}`);
    assert.ok(config.userPromptTemplate.includes(placeholder));
  }
});
