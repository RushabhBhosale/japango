import { describe, expect, it } from 'vitest';

import type { LearningAttempt, UserMastery } from '../../types/learning';
import {
  calculateNextReviewDate,
  calculateWeaknessScore,
  isWeakItem,
  updateMasteryFromAttempt,
} from './mastery-engine';

const reviewedAt = '2026-01-10T12:00:00.000Z';

function makeAttempt(correct: boolean, responseTimeMs = 10_000): LearningAttempt {
  return {
    id: `attempt-${correct}-${responseTimeMs}`,
    userId: 'learner-test',
    itemId: 'n5-vocab-test',
    lessonId: 'test-lesson',
    mode: 'quiz',
    correct,
    responseTimeMs,
    createdAt: reviewedAt,
  };
}

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

describe('updateMasteryFromAttempt', () => {
  it('updates counts, mastery, confidence, response time, and review data', () => {
    const updated = updateMasteryFromAttempt(undefined, makeAttempt(true, 7_000));

    expect(updated.correctCount).toBe(1);
    expect(updated.incorrectCount).toBe(0);
    expect(updated.masteryScore).toBe(20);
    expect(updated.confidenceScore).toBe(60);
    expect(updated.averageResponseTimeMs).toBe(7_000);
    expect(updated.reviewIntervalDays).toBe(1);
    expect(updated.status).toBe('learning');
  });

  it('does not mark an item mastered after one answer', () => {
    const updated = updateMasteryFromAttempt(
      makeMastery({ masteryScore: 84, correctCount: 0 }),
      makeAttempt(true, 5_000),
    );

    expect(updated.masteryScore).toBe(100);
    expect(updated.status).toBe('learning');
  });

  it('marks a low-performing item as weak', () => {
    const updated = updateMasteryFromAttempt(undefined, makeAttempt(false));

    expect(updated.incorrectCount).toBe(1);
    expect(updated.masteryScore).toBe(0);
    expect(updated.status).toBe('weak');
  });
});

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

describe('calculateNextReviewDate', () => {
  it('schedules an incorrect answer six hours later', () => {
    expect(calculateNextReviewDate(reviewedAt, false, 20)).toEqual({
      nextReviewAt: '2026-01-10T18:00:00.000Z',
      reviewIntervalDays: 0.25,
    });
  });

  it('uses longer intervals as mastery grows', () => {
    expect(calculateNextReviewDate(reviewedAt, true, 92)).toEqual({
      nextReviewAt: '2026-01-24T12:00:00.000Z',
      reviewIntervalDays: 14,
    });
  });
});
