/**
 * SM-2 Spaced Repetition Algorithm (server-side copy for Convex mutations).
 * Mirrors src/lib/srs/sm2.ts — keep both in sync.
 */

export type Rating = "again" | "hard" | "good" | "easy";

export interface SRSCardData {
  cardId: string;
  deckId: string;
  ownerId: string;
  front: string;
  back: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewDate: string;
  lastReviewDate: string | null;
}

const RATING_QUALITY: Record<Rating, number> = {
  again: 0,
  hard: 2,
  good: 3,
  easy: 5,
};

const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;

export function createSRSCardData(
  cardId: string,
  deckId: string,
  ownerId: string,
  front: string,
  back: string
): SRSCardData {
  return {
    cardId,
    deckId,
    ownerId,
    front,
    back,
    interval: 0,
    easeFactor: DEFAULT_EASE,
    repetitions: 0,
    nextReviewDate: todayStr(),
    lastReviewDate: null,
  };
}

/**
 * Apply SM-2. `today` is the reviewer's LOCAL date ("YYYY-MM-DD"); pass it
 * from the caller so scheduling matches the student's timezone rather than
 * the server's UTC day (which drifts a card's due date by up to a day at
 * the edges). Defaults to UTC today only as a fallback.
 */
export function reviewCard(
  card: SRSCardData,
  rating: Rating,
  today: string = todayStr()
): SRSCardData {
  const q = RATING_QUALITY[rating];
  const oldEase = card.easeFactor;

  let newEase = oldEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (newEase < MIN_EASE) newEase = MIN_EASE;

  let newInterval: number;
  let newReps: number;

  if (rating === "again") {
    newInterval = 0;
    newReps = 0;
  } else if (card.repetitions === 0) {
    newInterval = 1;
    newReps = 1;
  } else if (card.repetitions === 1) {
    newInterval = 6;
    newReps = 2;
  } else {
    newInterval = Math.round(card.interval * newEase);
    newReps = card.repetitions + 1;
    if (rating === "hard") {
      newInterval = Math.round(card.interval * 1.2);
    }
    if (rating === "easy") {
      newInterval = Math.round(newInterval * 1.3);
    }
  }

  if (newInterval < 1 && rating !== "again") newInterval = 1;

  const nextDate = addDays(today, newInterval);

  return {
    ...card,
    interval: newInterval,
    easeFactor: newEase,
    repetitions: newReps,
    nextReviewDate: nextDate,
    lastReviewDate: today,
  };
}

/** UTC today — fallback only. Callers should pass a tz-aware today. */
export function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

/** Local "YYYY-MM-DD" in an IANA timezone (DST-aware). UTC on bad tz. */
export function todayInTz(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return `${p.year}-${p.month}-${p.day}`;
  } catch {
    return todayStr();
  }
}

/** Add whole days to a "YYYY-MM-DD" date, staying calendar-correct. */
function addDays(dateStr: string, days: number): string {
  // Parse at UTC noon so DST / offset never rolls the date backward.
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}
