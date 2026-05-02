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

export function reviewCard(
  card: SRSCardData,
  rating: Rating
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

export function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
