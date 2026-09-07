// Deterministic plain-text transcript → utterance segments.
//
// Live-recording paths persist the lesson transcript and its structured
// utterances together, but an upload or an interrupted capture can leave a
// lesson with a transcript and zero `lessonTranscriptUtterances` rows — which
// made the vocabulary review page refuse to generate ("no structured
// transcript yet"). This normalizer rebuilds utterance rows from the text
// itself: same input → same segments → stable `utteranceId`s (`u0`, `u1`, …),
// each segment carrying EXACT source text, so vocabulary extraction can still
// verify every candidate phrase against the stored utterance.
//
// PURE TypeScript — no Convex imports (node test runner loads it directly).
export function chunkTranscript(text: string, maxChars = 220): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  // Sentence-aware breaks first, then hard wrap on spaces for anything that
  // still exceeds the cap. A segment is always a contiguous slice of the
  // normalized text — never invented, never reordered.
  const sentences = clean.split(/(?<=[.!?…])\s+/);
  const segments: string[] = [];
  let buf = "";

  const push = (s: string) => {
    if (s.trim()) segments.push(s.trim());
  };

  for (let part of sentences) {
    part = part.trim();
    if (!part) continue;
    while (part.length > maxChars) {
      let cut = part.lastIndexOf(" ", maxChars);
      if (cut <= 0) cut = maxChars;
      push(part.slice(0, cut));
      part = part.slice(cut).trim();
    }
    if (!part) continue;
    if (buf && buf.length + part.length + 1 > maxChars) {
      push(buf);
      buf = part;
    } else {
      buf = buf ? `${buf} ${part}` : part;
    }
  }
  if (buf) push(buf);
  return segments;
}

/** Stable utterance id for the i-th segment of a normalized transcript. */
export function utteranceIdFor(i: number): string {
  return `u${i}`;
}