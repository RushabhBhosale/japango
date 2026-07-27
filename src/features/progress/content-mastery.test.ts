import { describe, expect, it } from 'vitest';

import { calculateContentMastery } from './content-mastery';
import type { UserMastery } from '@/types/learning';

function mastery(overrides: Partial<UserMastery> = {}): UserMastery {
  return {
    userId: 'learner', itemId: 'grammar-n5-test', masteryScore: 0, confidenceScore: 0,
    correctCount: 0, incorrectCount: 0, averageResponseTimeMs: 0, reviewIntervalDays: 0,
    status: 'new',
    ...overrides,
  };
}

describe('content mastery calculation', () => {
  it('does not mark an unopened item as studied', () => {
    expect(calculateContentMastery({ mastery: mastery() })).toEqual({ state: 'not_started', reason: 'Not yet tested' });
  });

  it('prioritizes low scores and recurring mistakes for review', () => {
    expect(calculateContentMastery({ mastery: mastery({ correctCount: 3, incorrectCount: 2, status: 'review' }), latestQuizScore: 50 })).toMatchObject({ state: 'needs_review' });
    expect(calculateContentMastery({ mastery: mastery({ correctCount: 5, status: 'review' }), recentMistakeCount: 3 })).toMatchObject({ state: 'needs_review' });
  });

  it('requires stable, repeated FSRS recall for mastery', () => {
    expect(calculateContentMastery({ mastery: mastery({ correctCount: 10, status: 'mastered', reviewIntervalDays: 21 }) })).toMatchObject({ state: 'mastered' });
    expect(calculateContentMastery({ mastery: mastery({ correctCount: 1, status: 'mastered', reviewIntervalDays: 1 }), latestQuizScore: 100 })).not.toMatchObject({ state: 'mastered' });
  });
});
