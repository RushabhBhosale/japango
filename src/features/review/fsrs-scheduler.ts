import type { FsrsCard, FsrsCardState, FsrsRating, FsrsReviewResult } from '@/types/fsrs';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const targetRetention = 0.9;
const learningMinutes: Record<FsrsRating, number> = { again: 10, hard: 30, good: 24 * 60, easy: 4 * 24 * 60 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function elapsedDays(card: FsrsCard, now: Date): number {
  if (!card.lastReviewedAt) return 0;
  const reviewedAt = Date.parse(card.lastReviewedAt);
  return Number.isFinite(reviewedAt) ? Math.max(0, (now.getTime() - reviewedAt) / DAY_MS) : 0;
}

export function calculateRetrievability(stability: number, elapsed: number): number {
  if (elapsed <= 0) return 1;
  return rounded(clamp(Math.exp(Math.log(targetRetention) * elapsed / Math.max(stability, 0.1)), 0, 1));
}

function dueAt(now: Date, days: number): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

function dueInMinutes(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * MINUTE_MS).toISOString();
}

function initialDifficulty(rating: FsrsRating): number {
  return { again: 8.2, hard: 6.8, good: 5.4, easy: 3.7 }[rating];
}

function initialStability(rating: FsrsRating): number {
  return { again: 0.25, hard: 0.5, good: 1, easy: 4 }[rating];
}

function nextDifficulty(difficulty: number, rating: FsrsRating): number {
  const delta = { again: 1.2, hard: 0.35, good: -0.15, easy: -0.6 }[rating];
  return rounded(clamp(difficulty + delta - 0.05 * (difficulty - 5), 1, 10));
}

function successfulStability(stability: number, difficulty: number, retrievability: number, rating: Exclude<FsrsRating, 'again'>): number {
  const ratingMultiplier = { hard: 0.8, good: 1, easy: 1.35 }[rating];
  const growth = 1 + ratingMultiplier * (0.15 + (11 - difficulty) * 0.045) * (1 - retrievability + 0.25) * (1 + 1 / Math.sqrt(Math.max(stability, 0.25)));
  return rounded(clamp(stability * growth, 0.25, 36500));
}

function lapseStability(stability: number, difficulty: number): number {
  return rounded(clamp(stability * (0.25 + (11 - difficulty) * 0.045), 0.25, 36500));
}

function stateAfterSuccessfulReview(stability: number, repetitions: number): FsrsCardState {
  return repetitions >= 8 && stability >= 21 ? 'mastered' : 'review';
}

export function createFsrsCard(userId: string, itemId: string, now = new Date()): FsrsCard {
  return {
    userId,
    itemId,
    state: 'new',
    stability: 0,
    difficulty: 5,
    retrievability: 1,
    dueAt: now.toISOString(),
    repetitions: 0,
    lapses: 0,
    scheduledDays: 0,
    elapsedDays: 0,
  };
}

export function scheduleFsrsReview(
  previous: FsrsCard,
  rating: FsrsRating,
  reviewedAt: string,
  responseTimeMs: number,
): FsrsReviewResult {
  const now = new Date(reviewedAt);
  if (!Number.isFinite(now.getTime())) throw new Error('FSRS reviews require a valid ISO timestamp.');
  if (previous.state === 'suspended' || previous.state === 'buried') throw new Error('A suspended or buried card cannot be reviewed.');
  const elapsed = elapsedDays(previous, now);
  const retrievability = previous.repetitions ? calculateRetrievability(previous.stability, elapsed) : 1;
  const repetitions = previous.repetitions + 1;
  const difficulty = previous.repetitions ? nextDifficulty(previous.difficulty, rating) : initialDifficulty(rating);

  if (previous.repetitions === 0) {
    const stability = initialStability(rating);
    const state: FsrsCardState = rating === 'again' || rating === 'hard' ? 'learning' : 'review';
    const scheduledDays = rating === 'good' ? 1 : rating === 'easy' ? 4 : learningMinutes[rating] / (24 * 60);
    return {
      previousState: previous.state,
      rating,
      reviewedAt,
      responseTimeMs,
      card: {
        ...previous,
        state,
        stability,
        difficulty,
        retrievability: 1,
        dueAt: rating === 'again' || rating === 'hard' ? dueInMinutes(now, learningMinutes[rating]) : dueAt(now, scheduledDays),
        lastReviewedAt: reviewedAt,
        repetitions,
        lastRating: rating,
        scheduledDays,
        elapsedDays: elapsed,
        buriedUntil: undefined,
        suspendedAt: undefined,
      },
    };
  }

  if (rating === 'again') {
    const stability = lapseStability(previous.stability, difficulty);
    const scheduledDays = learningMinutes.again / (24 * 60);
    return {
      previousState: previous.state,
      rating,
      reviewedAt,
      responseTimeMs,
      card: {
        ...previous,
        state: 'relearning',
        stability,
        difficulty,
        retrievability,
        dueAt: dueInMinutes(now, learningMinutes.again),
        lastReviewedAt: reviewedAt,
        repetitions,
        lapses: previous.lapses + 1,
        lastRating: rating,
        scheduledDays,
        elapsedDays: elapsed,
        buriedUntil: undefined,
      },
    };
  }

  const stability = successfulStability(previous.stability, difficulty, retrievability, rating);
  const intervalModifier = rating === 'hard' ? 0.8 : rating === 'easy' ? 1.3 : 1;
  const scheduledDays = rounded(Math.max(1, stability * intervalModifier), 2);
  return {
    previousState: previous.state,
    rating,
    reviewedAt,
    responseTimeMs,
    card: {
      ...previous,
      state: stateAfterSuccessfulReview(stability, repetitions),
      stability,
      difficulty,
      retrievability,
      dueAt: dueAt(now, scheduledDays),
      lastReviewedAt: reviewedAt,
      repetitions,
      lastRating: rating,
      scheduledDays,
      elapsedDays: elapsed,
      buriedUntil: undefined,
    },
  };
}

export function buryFsrsCard(card: FsrsCard, now = new Date()): FsrsCard {
  const tomorrow = new Date(now); tomorrow.setUTCHours(24, 0, 0, 0);
  return { ...card, state: 'buried', buriedUntil: tomorrow.toISOString() };
}

export function restoreBuriedFsrsCard(card: FsrsCard, now = new Date()): FsrsCard {
  if (card.state !== 'buried' || !card.buriedUntil || Date.parse(card.buriedUntil) > now.getTime()) return card;
  return { ...card, state: card.repetitions >= 8 && card.stability >= 21 ? 'mastered' : card.repetitions ? 'review' : 'new', buriedUntil: undefined };
}

export function suspendFsrsCard(card: FsrsCard, now = new Date()): FsrsCard {
  return { ...card, state: 'suspended', suspendedAt: now.toISOString(), buriedUntil: undefined };
}

export function restoreSuspendedFsrsCard(card: FsrsCard): FsrsCard {
  if (card.state !== 'suspended') return card;
  return { ...card, state: card.repetitions >= 8 && card.stability >= 21 ? 'mastered' : card.repetitions ? 'review' : 'new', suspendedAt: undefined };
}
