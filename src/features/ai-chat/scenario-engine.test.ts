import { describe, expect, it } from 'vitest';

import { selectNextScenario } from './scenario-engine';

describe('chat scenario engine', () => {
  it('selects a flexible situation that reuses the learner’s weakest grammar', () => {
    const scenario = selectNextScenario([{ type: 'grammar', key: 'potential form', mastery: 0.31, mistakes: 7 }]);

    expect(scenario.title).toBe('Weekend café plan');
    expect(scenario.targetGrammar).toContain('potential form');
  });

  it('uses a normal social scenario when there is no clear weakness', () => {
    expect(selectNextScenario([]).title).toBe('Weekend café plan');
  });
});
