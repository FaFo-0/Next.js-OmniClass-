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

/**
 * Map Soniox speaker IDs to role labels. The teacher always speaks first,
 * so the first speaker seen in *final* tokens is "Teacher"; everyone else
 * is a student. Final tokens are considered before non-final ones because
 * diarization on non-final tokens can be reassigned before finalizing —
 * deriving roles from finals keeps the mapping stable across updates.
 */
export function buildSpeakerLabels(
  tokens: TranscriptToken[]
): Map<string, string> {
  const map = new Map<string, string>();
  let studentCount = 0;
  const assign = (speaker: string) => {
    if (map.has(speaker)) return;
    if (map.size === 0) {
      map.set(speaker, "Teacher");
    } else {
      studentCount++;
      map.set(speaker, studentCount === 1 ? "Student" : `Student ${studentCount}`);
    }
  };
  for (const t of tokens) if (t.isFinal && t.speaker) assign(t.speaker);
  for (const t of tokens) if (!t.isFinal && t.speaker) assign(t.speaker);
  return map;
}

/** Build plain-text transcript with Teacher/Student speaker labels from tokens. */
export function buildTranscript(tokens: TranscriptToken[]): string {
  const final = tokens.filter((t) => t.isFinal);
  if (final.length === 0) return "";

  // If no speaker info, just join text
  const hasSpeakers = final.some((t) => t.speaker);
  if (!hasSpeakers) return final.map((t) => t.text).join("");

  const labels = buildSpeakerLabels(tokens);

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
    .map((s) => `[${labels.get(s.speaker) ?? s.speaker}]: ${s.text.trim()}`)
    .filter((line) => line.replace(/\[.*?\]:\s*/, "").length > 0)
    .join("\n\n");
}
