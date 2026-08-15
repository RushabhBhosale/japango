import { describe, expect, it } from 'vitest';

import { applyChatLearningSignals } from './learner-skill';

describe('chat learner skill updates', () => {
  it('moves mastery gradually for high-confidence evidence', () => {
    const [skill] = applyChatLearningSignals('learner-1', [], [{ key: 'potential form', type: 'grammar', result: 'mistake' }], '2026-08-14T10:00:00.000Z');

    expect(skill.mastery).toBe(0.425);
    expect(skill.mistakes).toBe(1);
    expect(skill.encounters).toBe(1);
  });

  it('does not turn an unkeyed correction into a learner-skill record', () => {
    const skills = applyChatLearningSignals('learner-1', [], [], '2026-08-14T10:00:00.000Z');

    expect(skills).toEqual([]);
  });
});
