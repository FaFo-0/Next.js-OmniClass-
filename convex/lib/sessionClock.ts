/**
 * Session continuity rules for a live lesson.
 *
 * A live session belongs to the lesson, not to a browser tab: its clock, its
 * transcript and its transcript evidence must all survive a reload, a crash, or
 * the teacher leaving the room and coming back. These are the pure decisions
 * behind that, kept here so they can be tested directly.
 */

/**
 * Teaching time for a live session, owned by the server.
 *
 * A live session's length is the durable start stamped when the recording began
 * measured to now — never a browser timer, which reset to zero on every reload
 * and quietly disagreed with the number the lesson ended up carrying. The
 * caller's value is used only when there is no live session (an uploaded
 * recording).
 */
export function liveSessionSeconds(
  startedAt: string | undefined,
  now: string,
  fallback: number
): number {
  const safeFallback = Number.isFinite(fallback) ? Math.max(0, Math.round(fallback)) : 0;
  if (!startedAt) return safeFallback;
  const started = Date.parse(startedAt);
  const ended = Date.parse(now);
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended <= started) {
    return safeFallback;
  }
  return Math.round((ended - started) / 1000);
}

/**
 * A running session may only ever ADD transcript text: the recording is the
 * evidence record, so a stale or empty client snapshot (reload, second window,
 * failed read) must never shorten or blank what is already stored. There is no
 * deliberate transcript-shortening path in the product — nothing else writes
 * `lessons.transcript` — so the longer text always wins.
 */
export function longerTranscript(incoming: string, stored: string | undefined): string {
  const current = stored ?? "";
  return incoming.length >= current.length ? incoming : current;
}

/**
 * Which stored utterance rows a segment's write replaces.
 *
 * Each recording segment (the first one, and every segment after an
 * interruption) names itself with a `batchId`; its ids are namespaced with that
 * prefix. A write replaces its own segment's rows — including the ones an
 * earlier snapshot of the same segment left behind — and never touches another
 * segment's rows, because that earlier part of the transcript is still this
 * session's evidence.
 */
export function utteranceRowsToDrop(
  existingIds: string[],
  batchIds: string[],
  batchId: string
): string[] {
  const incoming = new Set(batchIds);
  return existingIds.filter(
    (id) => incoming.has(id) || (batchId.length > 0 && id.startsWith(batchId))
  );
}
