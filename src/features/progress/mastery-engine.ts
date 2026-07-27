import type { LearningAttempt, MasteryStatus, UserMastery } from '@/types/learning';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateReviewIntervalDays(correct: boolean, masteryScore: number): number {
  if (!correct) return 0.25;
  if (masteryScore >= 90) return 14;
  if (masteryScore >= 75) return 7;
  if (masteryScore >= 55) return 4;
  if (masteryScore >= 30) return 2;
  return 1;
}

export function calculateNextReviewDate(
  reviewedAt: string,
  correct: boolean,
  masteryScore: number,
): { nextReviewAt: string; reviewIntervalDays: number } {
  const reviewIntervalDays = calculateReviewIntervalDays(correct, masteryScore);
  const reviewedAtMs = new Date(reviewedAt).getTime();
  const safeReviewedAtMs = Number.isFinite(reviewedAtMs) ? reviewedAtMs : 0;
  return {
    nextReviewAt: new Date(safeReviewedAtMs + reviewIntervalDays * DAY_MS).toISOString(),
    reviewIntervalDays,
  };
}

export function assignMasteryStatus(
  mastery: Pick<
    UserMastery,
    'masteryScore' | 'correctCount' | 'incorrectCount' | 'nextReviewAt'
  >,
  now = new Date(),
): MasteryStatus {
  const attempts = mastery.correctCount + mastery.incorrectCount;
  if (attempts === 0) return 'new';

  const accuracy = mastery.correctCount / attempts;
  if (
    mastery.incorrectCount > mastery.correctCount ||
    (attempts >= 2 && accuracy < 0.55) ||
    (mastery.incorrectCount > 0 && mastery.masteryScore < 30)
  ) {
    return 'weak';
  }

  const isDue = mastery.nextReviewAt
    ? new Date(mastery.nextReviewAt).getTime() <= now.getTime()
    : false;
  if (isDue) return 'review';

  if (mastery.masteryScore >= 85 && mastery.correctCount >= 5 && accuracy >= 0.8) {
    return 'mastered';
  }

  return 'learning';
}

/**
 * Phase 1 scoring is deliberately simple and deterministic:
 * - a correct answer adds 18 mastery points (plus 2 when answered within 8 seconds)
 * - an incorrect answer removes 20 points
 * - confidence combines accuracy (50%) and exposure across the first five attempts (50%)
 * - review intervals step from 6 hours after an error to 1, 2, 4, 7, or 14 days
 * - mastery requires at least five correct answers, 85 mastery, and 80% accuracy
 */
export function updateMasteryFromAttempt(
  previous: UserMastery | undefined,
  attempt: LearningAttempt,
  now = new Date(attempt.createdAt),
): UserMastery {
  const correctCount = (previous?.correctCount ?? 0) + (attempt.correct ? 1 : 0);
  const incorrectCount = (previous?.incorrectCount ?? 0) + (attempt.correct ? 0 : 1);
  const totalCount = correctCount + incorrectCount;
  const previousTotal = (previous?.correctCount ?? 0) + (previous?.incorrectCount ?? 0);
  const responseBonus = attempt.correct && attempt.responseTimeMs <= 8_000 ? 2 : 0;
  const masteryDelta = attempt.correct ? 18 + responseBonus : -20;
  const masteryScore = clamp((previous?.masteryScore ?? 0) + masteryDelta);
  const accuracy = correctCount / totalCount;
  const exposure = Math.min(totalCount / 5, 1);
  const confidenceScore = Math.round(clamp(accuracy * 50 + exposure * 50));
  const averageResponseTimeMs = Math.round(
    (((previous?.averageResponseTimeMs ?? 0) * previousTotal) + attempt.responseTimeMs) /
      totalCount,
  );
  const review = calculateNextReviewDate(attempt.createdAt, attempt.correct, masteryScore);

  const updated: UserMastery = {
    userId: attempt.userId,
    itemId: attempt.itemId,
    masteryScore,
    confidenceScore,
    correctCount,
    incorrectCount,
    averageResponseTimeMs,
    lastReviewedAt: attempt.createdAt,
    nextReviewAt: review.nextReviewAt,
    reviewIntervalDays: review.reviewIntervalDays,
    status: 'learning',
  };

  return {
    ...updated,
    status: assignMasteryStatus(updated, now),
  };
}

export function calculateWeaknessScore(mastery: UserMastery, now = new Date()): number {
  const attempts = mastery.correctCount + mastery.incorrectCount;
  if (attempts === 0) return 0;

  const errorRate = mastery.incorrectCount / attempts;
  const slowResponsePenalty = Math.min(mastery.averageResponseTimeMs / 20_000, 1) * 10;
  const nextReviewMs = mastery.nextReviewAt ? new Date(mastery.nextReviewAt).getTime() : now.getTime();
  const overdueDays = Math.max(0, (now.getTime() - nextReviewMs) / DAY_MS);
  const overduePenalty = Math.min(overdueDays * 3, 15);
  const score =
    (100 - mastery.masteryScore) * 0.55 +
    errorRate * 30 +
    slowResponsePenalty +
    overduePenalty;
  return Math.round(clamp(score));
}

export function isWeakItem(mastery: UserMastery, now = new Date()): boolean {
  const attempts = mastery.correctCount + mastery.incorrectCount;
  return mastery.status === 'weak' || (attempts >= 2 && calculateWeaknessScore(mastery, now) >= 65);
}
