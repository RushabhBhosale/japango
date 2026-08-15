import { describe, expect, it } from 'vitest';

import { applyChatLearningSignals } from './learner-skill';

describe('chat learner skill updates', () => {
  it('moves mastery gradually for high-confidence evidence', () => {
    const [skill] = applyChatLearningSignals('learner-1', [], [{ target: 'potential form', type: 'grammar', result: 'weak', confidence: 0.9 }], [], '2026-08-14T10:00:00.000Z');

    expect(skill.mastery).toBe(0.432);
    expect(skill.mistakes).toBe(1);
    expect(skill.encounters).toBe(1);
  });

  it('does not turn a low-confidence preference into a learner record', () => {
    const skills = applyChatLearningSignals('learner-1', [], [], [{
      original: '僕は行くよ', corrected: '私は行くよ', category: 'register', target: 'first person', severity: 'low', confidence: 0.4,
    }], '2026-08-14T10:00:00.000Z');

    expect(skills).toEqual([]);
  });
});
