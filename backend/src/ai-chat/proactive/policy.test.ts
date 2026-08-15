import { describe, expect, it } from 'vitest';

import { chooseTeachingTarget, shouldScheduleProactiveMessage } from './policy';
import type { ProactiveCandidate } from './policy';

const candidate: ProactiveCandidate = {
  localUserId: 'learner-123456', expoPushToken: 'ExpoPushToken[token]', timeZone: 'Asia/Tokyo', summary: 'The user had a busy day.', weaknesses: [{ type: 'grammar', key: 'potential form', mastery: 0.32, mistakes: 6 }], lastActiveAt: '2026-08-13T08:00:00.000Z', sentToday: 0,
};

describe('proactive chat policy', () => {
  it('schedules at most after a quiet period during local daytime', () => {
    expect(shouldScheduleProactiveMessage(candidate, new Date('2026-08-14T03:00:00.000Z'))).toMatchObject({ allowed: true, localDate: '2026-08-14' });
    expect(shouldScheduleProactiveMessage({ ...candidate, sentToday: 2 }, new Date('2026-08-14T03:00:00.000Z')).allowed).toBe(false);
  });

  it('uses a due weakness sometimes, rather than on every message', () => {
    expect(chooseTeachingTarget(candidate.weaknesses, '2026-08-14')?.key).toBe('potential form');
    expect(chooseTeachingTarget(candidate.weaknesses, '2026-08-15')).toBeUndefined();
  });
});
