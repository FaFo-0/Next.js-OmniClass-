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
  inputKey: "transcript" | "text";
  outputFormat: AiOutputFormat;
  /** Used only when the assigned model is temporarily unavailable. */
  fallbackModel: string;
};

const FALLBACK_MODEL = "google/gemini-2.5-flash";

const TASKS: Record<AiTaskId, AiTask> = {
  lesson_summary: { configId: "lesson_summary", inputKey: "transcript", outputFormat: "text", fallbackModel: FALLBACK_MODEL },
  vocab_extraction: { configId: "vocab_extraction", inputKey: "transcript", outputFormat: "json", fallbackModel: FALLBACK_MODEL },
  flashcard_generation: { configId: "flashcard_generation", inputKey: "transcript", outputFormat: "json", fallbackModel: FALLBACK_MODEL },
  homework_worksheet: { configId: "homework_worksheet", inputKey: "transcript", outputFormat: "json", fallbackModel: FALLBACK_MODEL },
  homework_quiz: { configId: "homework_quiz", inputKey: "transcript", outputFormat: "json", fallbackModel: FALLBACK_MODEL },
  live_quiz: { configId: "live_quiz", inputKey: "transcript", outputFormat: "json", fallbackModel: FALLBACK_MODEL },
  conversation_questions: { configId: "conversation_questions", inputKey: "transcript", outputFormat: "json", fallbackModel: FALLBACK_MODEL },
  library_vocabulary: { configId: "library_vocabulary", inputKey: "text", outputFormat: "json", fallbackModel: FALLBACK_MODEL },
  word_gloss: { configId: "word_gloss", inputKey: "text", outputFormat: "text", fallbackModel: FALLBACK_MODEL },
};

export function isAiTaskId(value: string): value is AiTaskId {
  return (AI_TASK_IDS as readonly string[]).includes(value);
}

export function getAiTask(value: string): AiTask | null {
  return isAiTaskId(value) ? TASKS[value] : null;
}

/** Placeholder an editable user prompt must retain for this task's input. */
export function getAiTaskPlaceholder(value: string): string | null {
  const task = getAiTask(value);
  return task ? `{{${task.inputKey}}}` : null;
}
