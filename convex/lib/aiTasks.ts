/**
 * Canonical server-owned AI task registry.
 *
 * A browser may name a task and supply that task's input, but it may never
 * select a model, prompt, temperature, or token budget. The action layer
 * resolves those values from this closed registry + the org's promptConfigs
 * override (P8, 2026-09-07).
 */
export const AI_TASK_IDS = [
  "lesson_summary",
  "vocab_extraction",
  "flashcard_generation",
  "homework_worksheet",
  "homework_quiz",
  "live_quiz",
  "conversation_questions",
  "library_vocabulary",
  "word_gloss",
] as const;

export type AiTaskId = (typeof AI_TASK_IDS)[number];
export type AiOutputFormat = "text" | "json";

export type AiTask = {
  configId: AiTaskId;
  /** The only named input the generic prompt renderer substitutes. */
  inputKey: "transcript" | "text";
  outputFormat: AiOutputFormat;
};

const TASKS: Record<AiTaskId, AiTask> = {
  lesson_summary: {
    configId: "lesson_summary",
    inputKey: "transcript",
    outputFormat: "text",
  },
  vocab_extraction: {
    configId: "vocab_extraction",
    inputKey: "transcript",
    outputFormat: "json",
  },
  flashcard_generation: {
    configId: "flashcard_generation",
    inputKey: "transcript",
    outputFormat: "json",
  },
  homework_worksheet: {
    configId: "homework_worksheet",
    inputKey: "transcript",
    outputFormat: "json",
  },
  homework_quiz: {
    configId: "homework_quiz",
    inputKey: "transcript",
    outputFormat: "json",
  },
  live_quiz: {
    configId: "live_quiz",
    inputKey: "transcript",
    outputFormat: "json",
  },
  conversation_questions: {
    configId: "conversation_questions",
    inputKey: "transcript",
    outputFormat: "json",
  },
  library_vocabulary: {
    configId: "library_vocabulary",
    inputKey: "text",
    outputFormat: "json",
  },
  word_gloss: {
    configId: "word_gloss",
    inputKey: "text",
    outputFormat: "text",
  },
};

export function isAiTaskId(value: string): value is AiTaskId {
  return (AI_TASK_IDS as readonly string[]).includes(value);
}

export function getAiTask(value: string): AiTask | null {
  return isAiTaskId(value) ? TASKS[value] : null;
}
