import { describe, expect, it } from 'vitest';

import { buryFsrsCard, calculateRetrievability, createFsrsCard, restoreBuriedFsrsCard, restoreSuspendedFsrsCard, scheduleFsrsReview, suspendFsrsCard } from './fsrs-scheduler';

const reviewedAt = '2026-07-27T09:00:00.000Z';

describe('FSRS scheduler', () => {
  it('creates a deterministic new card and handles all first-review ratings', () => {
    const card = createFsrsCard('learner-1', 'vocab-1', new Date(reviewedAt));
    expect(card.state).toBe('new');
    expect(scheduleFsrsReview(card, 'again', reviewedAt, 3000).card.state).toBe('learning');
    expect(scheduleFsrsReview(card, 'hard', reviewedAt, 3000).card.state).toBe('learning');
    expect(scheduleFsrsReview(card, 'good', reviewedAt, 3000).card.state).toBe('review');
    const easy = scheduleFsrsReview(card, 'easy', reviewedAt, 3000).card;
    expect(easy.state).toBe('review');
    expect(easy.scheduledDays).toBe(4);
  });

  it('uses elapsed time and retrievability to schedule deterministic longer successful intervals', () => {
    const first = scheduleFsrsReview(createFsrsCard('learner-1', 'vocab-1'), 'good', reviewedAt, 2500).card;
    const next = scheduleFsrsReview(first, 'easy', '2026-07-29T09:00:00.000Z', 2500).card;
    expect(next.elapsedDays).toBe(2);
    expect(next.retrievability).toBeLessThan(1);
    expect(next.stability).toBeGreaterThan(first.stability);
    expect(next.scheduledDays).toBeGreaterThan(1);
    expect(calculateRetrievability(4, 4)).toBe(0.9);
  });

  it('moves failed review cards into relearning and records a lapse', () => {
    const reviewed = scheduleFsrsReview(createFsrsCard('learner-1', 'vocab-1'), 'good', reviewedAt, 2500).card;
    const lapsed = scheduleFsrsReview(reviewed, 'again', '2026-07-29T09:00:00.000Z', 5000).card;
    expect(lapsed.state).toBe('relearning');
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.scheduledDays).toBeLessThan(1);
    expect(lapsed.stability).toBeLessThan(reviewed.stability);
  });

  it('keeps buried and suspended cards outside review until explicitly restored', () => {
    const card = scheduleFsrsReview(createFsrsCard('learner-1', 'vocab-1'), 'good', reviewedAt, 2500).card;
    const buried = buryFsrsCard(card, new Date(reviewedAt));
    expect(buried.state).toBe('buried');
    expect(restoreBuriedFsrsCard(buried, new Date('2026-07-28T00:00:00.000Z')).state).toBe('review');
    const suspended = suspendFsrsCard(card, new Date(reviewedAt));
    expect(suspended.state).toBe('suspended');
    expect(restoreSuspendedFsrsCard(suspended).state).toBe('review');
  });

  it('rejects an attempt to review a suspended card', () => {
    const suspended = suspendFsrsCard(createFsrsCard('learner-1', 'vocab-1'), new Date(reviewedAt));
    expect(() => scheduleFsrsReview(suspended, 'good', reviewedAt, 2500)).toThrow('suspended');
  });
});
