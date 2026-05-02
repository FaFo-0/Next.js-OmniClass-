/**
 * SM-2 Spaced Repetition Algorithm (Anki-style)
 *
 * Quality ratings:
 *   Again = 0 (complete failure)
 *   Hard  = 2 (significant difficulty)
 *   Good  = 3 (correct with some effort)
 *   Easy  = 5 (effortless recall)
 */

export type Rating = "again" | "hard" | "good" | "easy";

export interface SRSCard {
  cardId: string;
  deckId: string; // lessonId or imported deck id
  front: string;
  back: string;
  // SRS state
  interval: number; // days until next review
  easeFactor: number; // >= 1.3
  repetitions: number; // successful reps in a row
  nextReviewDate: string; // ISO date string (date only, e.g. "2026-03-17")
  lastReviewDate: string | null;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  rating: Rating;
  reviewedAt: string; // ISO datetime
  intervalBefore: number;
  intervalAfter: number;
  easeFactorBefore: number;
  easeFactorAfter: number;
}

const RATING_QUALITY: Record<Rating, number> = {
  again: 0,
  hard: 2,
  good: 3,
  easy: 5,
};

const MIN_EASE = 1.3;
const DEFAULT_EASE = 2.5;

export function createSRSCard(
  cardId: string,
  deckId: string,
  front: string,
  back: string
): SRSCard {
  return {
    cardId,
    deckId,
    front,
    back,
    interval: 0,
    easeFactor: DEFAULT_EASE,
    repetitions: 0,
    nextReviewDate: todayStr(),
    lastReviewDate: null,
  };
}

export function reviewCard(card: SRSCard, rating: Rating): SRSCard {
  const q = RATING_QUALITY[rating];
  const oldEase = card.easeFactor;

  // Ease factor adjustment: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  let newEase = oldEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (newEase < MIN_EASE) newEase = MIN_EASE;

  let newInterval: number;
  let newReps: number;

  if (rating === "again") {
    // Reset: show again in ~10 minutes (we'll use 0 days = due today)
    newInterval = 0;
    newReps = 0;
  } else if (card.repetitions === 0) {
    // First successful review
    newInterval = 1;
    newReps = 1;
  } else if (card.repetitions === 1) {
    // Second successful review
    newInterval = 6;
    newReps = 2;
  } else {
    // Subsequent reviews
    newInterval = Math.round(card.interval * newEase);
    newReps = card.repetitions + 1;

    // Hard: multiply by 1.2 instead of ease
    if (rating === "hard") {
      newInterval = Math.round(card.interval * 1.2);
    }
    // Easy: bonus 1.3x
    if (rating === "easy") {
      newInterval = Math.round(newInterval * 1.3);
    }
  }

  // Ensure minimum intervals
  if (newInterval < 1 && rating !== "again") newInterval = 1;

  const today = todayStr();
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

/** Get cards that are due for review (nextReviewDate <= today) */
export function getDueCards(cards: SRSCard[]): SRSCard[] {
  const today = todayStr();
  return cards
    .filter((c) => c.nextReviewDate <= today)
    .sort((a, b) => {
      // Overdue first, then by interval (new cards last)
      if (a.interval === 0 && b.interval > 0) return -1;
      if (b.interval === 0 && a.interval > 0) return 1;
      return a.nextReviewDate.localeCompare(b.nextReviewDate);
    });
}

/** Get count of cards due today */
export function getDueCount(cards: SRSCard[]): number {
  const today = todayStr();
  return cards.filter((c) => c.nextReviewDate <= today).length;
}

// --- Date helpers ---

export function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
