import { describe, expect, it } from 'vitest';

import { calculateDailyReadingStreak, localDateKey } from './streak';

describe('daily reading streak', () => {
  it('counts consecutive calendar days including today', () => {
    expect(calculateDailyReadingStreak(['2026-08-09', '2026-08-10', '2026-08-11'], '2026-08-11')).toBe(3);
  });

  it('preserves the streak through yesterday before today is completed', () => {
    expect(calculateDailyReadingStreak(['2026-08-09', '2026-08-10'], '2026-08-11')).toBe(2);
  });

  it('resets after one missed calendar day', () => {
    expect(calculateDailyReadingStreak(['2026-08-08', '2026-08-09'], '2026-08-11')).toBe(0);
  });

  it('uses the device calendar date rather than UTC', () => {
    expect(localDateKey(new Date(2026, 7, 11, 0, 5))).toBe('2026-08-11');
  });
});
