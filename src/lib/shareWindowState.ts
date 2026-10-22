/**
 * Where a screen-share window was left.
 *
 * The live lesson opens a separate browser window for the reading or the quiz and
 * the teacher presents it in Meet. If that presentation is stopped by mistake (or
 * the window is closed), it must come back at the same place instead of the
 * contents list and question one — so the position lives in `localStorage`, keyed
 * by lesson + kind, and the live room reads it when it opens the window again.
 *
 * Storage access is deliberately defensive: a corrupt, truncated or older value
 * must never stop the window from opening, it just means "start at the top".
 */

export type ShareKind = "reading" | "quiz";

export interface ShareWindowState {
  kind: ShareKind;
  /** Reading: the work and chapter on screen. */
  workId?: string;
  unitId?: string;
  /** Reading: how far down the page the teacher had scrolled (0–1). */
  scrollRatio?: number;
  /** Quiz: the question on screen. */
  questionIndex?: number;
  updatedAt?: string;
}

export function shareStateKey(kind: ShareKind, lessonId: string): string {
  return `omnic-share:${kind}:${lessonId}`;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** Tolerant read: anything unusable is dropped, never thrown. */
export function parseShareWindowState(raw: string | null | undefined): ShareWindowState | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (record.kind !== "reading" && record.kind !== "quiz") return null;
  const state: ShareWindowState = { kind: record.kind };
  const workId = text(record.workId);
  const unitId = text(record.unitId);
  const updatedAt = text(record.updatedAt);
  if (workId) state.workId = workId;
  if (unitId) state.unitId = unitId;
  if (updatedAt) state.updatedAt = updatedAt;
  if (typeof record.scrollRatio === "number" && Number.isFinite(record.scrollRatio)) {
    state.scrollRatio = Math.min(1, Math.max(0, record.scrollRatio));
  }
  if (typeof record.questionIndex === "number" && Number.isFinite(record.questionIndex)) {
    state.questionIndex = Math.max(0, Math.floor(record.questionIndex));
  }
  return state;
}

export function serializeShareWindowState(state: ShareWindowState): string {
  return JSON.stringify(state);
}

/** URL of a share window, positioned where the teacher last stopped. */
export function shareWindowUrl(
  kind: ShareKind,
  lessonId: string,
  state?: ShareWindowState | null
): string {
  const base = `/teacher/share/${kind}?lessonId=${encodeURIComponent(lessonId)}`;
  if (kind === "quiz") {
    const question = state?.questionIndex ?? 0;
    return question > 0 ? `${base}&q=${question}` : base;
  }
  if (!state?.workId) return base;
  const withWork = `${base}&workId=${encodeURIComponent(state.workId)}`;
  return state.unitId ? `${withWork}&unitId=${encodeURIComponent(state.unitId)}` : withWork;
}

export function readShareWindowState(kind: ShareKind, lessonId: string): ShareWindowState | null {
  if (typeof window === "undefined") return null;
  try {
    return parseShareWindowState(window.localStorage.getItem(shareStateKey(kind, lessonId)));
  } catch {
    return null;
  }
}

export function writeShareWindowState(lessonId: string, state: ShareWindowState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      shareStateKey(state.kind, lessonId),
      serializeShareWindowState({ ...state, updatedAt: new Date().toISOString() })
    );
  } catch {
    // A full or blocked storage must never break the lesson.
  }
}
