/**
 * Shared transcript types and utilities.
 * Extracted from lesson-store for use across components and Soniox client.
 */

export interface TranscriptToken {
  text: string;
  isFinal: boolean;
  startMs: number;
  endMs: number;
  speaker?: string;
}

/** Build plain-text transcript with speaker labels from tokens. */
export function buildTranscript(tokens: TranscriptToken[]): string {
  const final = tokens.filter((t) => t.isFinal);
  if (final.length === 0) return "";

  // If no speaker info, just join text
  const hasSpeakers = final.some((t) => t.speaker);
  if (!hasSpeakers) return final.map((t) => t.text).join("");

  // Group consecutive tokens by speaker
  const segments: { speaker: string; text: string }[] = [];
  let currentSpeaker = "";

  for (const t of final) {
    const sp = t.speaker || "Unknown";
    if (sp !== currentSpeaker) {
      segments.push({ speaker: sp, text: t.text });
      currentSpeaker = sp;
    } else {
      segments[segments.length - 1].text += t.text;
    }
  }

  return segments
    .map((s) => `[${s.speaker}]: ${s.text.trim()}`)
    .filter((line) => line.replace(/\[.*?\]:\s*/, "").length > 0)
    .join("\n\n");
}
