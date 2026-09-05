/**
 * Stable transcript utterance anchoring.
 *
 * The current transcript pipeline flattens tokens to a "[Speaker]: text"
 * string, which discards the exact utterance, speaker, and timestamps a
 * vocabulary candidate needs to point back at the moment it was spoken.
 *
 * These pure functions rebuild that structure so a saved word can reference
 * the precise sentence the teacher or student actually said — never a
 * paraphrased or invented version.
 */

import { buildSpeakerLabels } from "./transcript.ts";
import type { TranscriptToken } from "./transcript.ts";

export type { TranscriptToken };

/** A contiguous run of final tokens from one speaker — one spoken thought. */
export interface Utterance {
  id: string; // stable across runs; used as an occurrence unitId
  speaker: string; // "Teacher" / "Student" / "Student N"
  text: string; // trimmed, joined token text
  startMs?: number;
  endMs?: number;
}

/** The exact context a vocabulary candidate anchors to. */
export interface CandidateContext {
  sentence: string; // exact utterance text
  range: { start?: number; end?: number };
  speaker: string;
}

/** Deterministic FNV-1a string hash — no crypto dependency needed. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Group final tokens by speaker into stable, time-anchored utterances. */
export function buildUtterances(tokens: TranscriptToken[]): Utterance[] {
  const final = tokens.filter((t) => t.isFinal);
  if (final.length === 0) return [];

  const labels = buildSpeakerLabels(tokens);

  const segments: { speaker: string; text: string; startMs?: number; endMs?: number }[] = [];
  let currentSpeaker: string | undefined;

  for (const t of final) {
    const raw = t.speaker || "Unknown";
    const label = labels.get(raw) ?? raw;
    if (label !== currentSpeaker) {
      segments.push({ speaker: label, text: t.text, startMs: t.startMs, endMs: t.endMs });
      currentSpeaker = label;
    } else {
      const seg = segments[segments.length - 1];
      seg.text += t.text;
      seg.endMs = t.endMs;
    }
  }

  return segments
    .map((s) => {
      const text = s.text.trim();
      const id = fnv1a(`${s.speaker}\u0000${text}\u0000${s.startMs ?? 0}`);
      return { id, speaker: s.speaker, text, startMs: s.startMs, endMs: s.endMs };
    })
    .filter((u) => u.text.length > 0);
}

/**
 * Anchor a candidate word/phrase to its exact utterance context. Throws if the
 * surface form is not present verbatim, so an extractor can never silently
 * substitute a paraphrased sentence for the real one.
 */
export function resolveCandidateContext(
  utterance: Utterance,
  surface: string
): CandidateContext {
  const needle = surface.toLowerCase().trim();
  if (!utterance.text.toLowerCase().includes(needle)) {
    throw new Error(`"${surface}" not present in utterance "${utterance.text}"`);
  }
  return {
    sentence: utterance.text,
    range: { start: utterance.startMs, end: utterance.endMs },
    speaker: utterance.speaker,
  };
}
