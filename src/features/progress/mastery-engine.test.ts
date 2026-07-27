import { describe, expect, it } from 'vitest';

import type { UserMastery } from '../../types/learning';
import {
  calculateWeaknessScore,
  isWeakItem,
} from './mastery-engine';

const reviewedAt = '2026-01-10T12:00:00.000Z';

function makeMastery(overrides: Partial<UserMastery> = {}): UserMastery {
  return {
    userId: 'learner-test',
    itemId: 'n5-vocab-test',
    masteryScore: 0,
    confidenceScore: 0,
    correctCount: 0,
    incorrectCount: 0,
    averageResponseTimeMs: 0,
    reviewIntervalDays: 0,
    status: 'new',
    ...overrides,
  };
}

describe('weak-item calculation', () => {
  it('combines low mastery, error rate, slow responses, and overdue time', () => {
    const mastery = makeMastery({
      masteryScore: 25,
      correctCount: 1,
      incorrectCount: 2,
      averageResponseTimeMs: 20_000,
      nextReviewAt: '2026-01-05T12:00:00.000Z',
      status: 'learning',
    });
    const now = new Date(reviewedAt);

    expect(calculateWeaknessScore(mastery, now)).toBeGreaterThanOrEqual(65);
    expect(isWeakItem(mastery, now)).toBe(true);
  });

  it('does not treat unseen material as weak', () => {
    expect(calculateWeaknessScore(makeMastery(), new Date(reviewedAt))).toBe(0);
    expect(isWeakItem(makeMastery(), new Date(reviewedAt))).toBe(false);
  });
});
