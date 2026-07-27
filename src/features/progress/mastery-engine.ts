import type { UserMastery } from '@/types/learning';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
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
