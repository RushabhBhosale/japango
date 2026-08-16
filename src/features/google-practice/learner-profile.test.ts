import { describe, expect, it } from 'vitest';

import { updatePracticeSkillProfile } from './learner-profile';
import type { PracticeSkillProfile } from '@/types/google-practice';

const base: PracticeSkillProfile = {
  type: 'grammar',
  key: 'past tense',
  mastery: 0.5,
  mistakes: 0,
  successfulUses: 0,
  encounters: 0,
  lastPracticedAt: '2026-08-01',
};

describe('practice learner profile', () => {
  it('does not reduce mastery heavily for a one-off mistake', () => {
    const next = updatePracticeSkillProfile(base, { mistakes: 1, successfulUses: 0, practicedAt: '2026-08-16' });

    expect(next.mastery).toBeCloseTo(0.45);
    expect(next.mistakes).toBe(1);
  });

  it('lets repeated evidence accumulate and recovery remain possible', () => {
    let profile = base;
    for (let index = 0; index < 4; index += 1) {
      profile = updatePracticeSkillProfile(profile, { mistakes: 1, successfulUses: 0, practicedAt: `2026-08-${10 + index}` });
    }
    expect(profile.mastery).toBeLessThan(0.4);

    const recovered = updatePracticeSkillProfile(profile, { mistakes: 0, successfulUses: 6, practicedAt: '2026-08-16' });
    expect(recovered.mastery).toBeGreaterThan(profile.mastery);
    expect(recovered.successfulUses).toBe(6);
  });

  it('is unchanged when there is no evidence', () => {
    expect(updatePracticeSkillProfile(base, { mistakes: 0, successfulUses: 0, practicedAt: '2026-08-16' })).toBe(base);
  });
});
