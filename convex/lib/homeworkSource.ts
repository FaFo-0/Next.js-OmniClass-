export const MAX_HOMEWORK_SOURCE_CHARS = 12_000;
export const MAX_HOMEWORK_TRANSCRIPT_CHARS = 12_000;

const BOOK_BEGIN = "<<<BEGIN BOOK SOURCE>>>";
const BOOK_END = "<<<END BOOK SOURCE>>>";
const TRANSCRIPT_BEGIN = "<<<BEGIN LESSON TRANSCRIPT>>>";
const TRANSCRIPT_END = "<<<END LESSON TRANSCRIPT>>>";

export type HomeworkSourceInput = {
  transcript: string;
  sourceText?: string;
  includeTranscript?: boolean;
};

function boundedSource(value: string | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

function boundedTranscript(value: string | undefined, max: number): string {
  return (value ?? "").trim().slice(-max);
}

function escapeDelimiters(value: string): string {
  return value
    .replaceAll(BOOK_BEGIN, "[escaped book-source delimiter]")
    .replaceAll(BOOK_END, "[escaped book-source end delimiter]")
    .replaceAll(TRANSCRIPT_BEGIN, "[escaped transcript delimiter]")
    .replaceAll(TRANSCRIPT_END, "[escaped transcript end delimiter]");
}

function frame(begin: string, end: string, value: string): string {
  return `${begin}\n${escapeDelimiters(value)}\n${end}`;
}

/**
 * Compose the non-persisted material sent to a homework AI task.
 *
 * With no pasted source, the legacy transcript-only payload stays unchanged.
 * Once pasted source exists, transcript inclusion is opt-out and both inputs
 * get explicit, escaped boundaries so pasted text cannot manufacture a section.
 */
export function composeHomeworkSource(input: HomeworkSourceInput): string {
  const transcript = boundedTranscript(input.transcript, MAX_HOMEWORK_TRANSCRIPT_CHARS);
  const sourceText = boundedSource(input.sourceText, MAX_HOMEWORK_SOURCE_CHARS);
  const hasSource = sourceText.length > 0;
  const includeTranscript = !hasSource || input.includeTranscript !== false;

  if (!transcript && !sourceText) {
    throw new Error("At least one lesson transcript or book source is required");
  }

  if (!hasSource) return transcript;

  const parts = [frame(BOOK_BEGIN, BOOK_END, sourceText)];
  if (includeTranscript && transcript) {
    parts.push(frame(TRANSCRIPT_BEGIN, TRANSCRIPT_END, transcript));
  }
  return parts.join("\n\n");
}
