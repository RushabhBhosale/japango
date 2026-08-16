import { describe, expect, it } from 'vitest';

import { AUTOMATIC_NOTIFICATION_GAP_MS, DAILY_HARD_MAX, buildNotificationTimes, frequencyTarget, selectNotificationTypes } from './scheduler';

const base = {
  homeworkComplete: false,
  reviewsDue: 2,
  notificationsSentToday: 0,
  recentMistakes: 1,
  currentLearningTargets: [
    { itemId: 'word', type: 'vocabulary' as const, key: '約束' },
    { itemId: 'kanji', type: 'kanji' as const, key: '約' },
  ],
};

describe('notification scheduler policy', () => {
  it('prioritises due work, today’s plan, and recurring conversation evidence', () => {
    expect(selectNotificationTypes(base, 'normal', new Date('2026-08-15T06:00:00.000Z')).slice(0, 3))
      .toEqual(['due_review', 'daily_homework', 'practice_review']);
  });

  it('never exceeds the hard cap and schedules after a recent study session', () => {
    expect(frequencyTarget('frequent')).toBe(DAILY_HARD_MAX);
    const now = new Date('2026-08-15T06:00:00.000Z');
    const [next] = buildNotificationTimes({ now, count: 1, activeHours: { start: 9, end: 21 }, lastAppOpenAt: '2026-08-15T05:50:00.000Z' });
    expect(next!.getTime()).toBeGreaterThanOrEqual(now.getTime() + AUTOMATIC_NOTIFICATION_GAP_MS);
  });

  it('spaces automatic notifications by at least two hours', () => {
    const times = buildNotificationTimes({ now: new Date('2026-08-15T06:20:00.000Z'), count: 3, activeHours: { start: 9, end: 21 } });
    expect(times).toHaveLength(3);
    expect(times[1]!.getTime() - times[0]!.getTime()).toBe(AUTOMATIC_NOTIFICATION_GAP_MS);
  });
});
