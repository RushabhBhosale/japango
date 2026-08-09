import { describe, expect, it } from 'vitest';

import { firstUnitTest, validateUnitTest } from './unit-test-catalog';
import { createUnitTestAttempt, scoreUnitTest } from './unit-test-session';

describe('first V3 unit test', () => {
  it('is a short 10–15 question checkpoint that only links taught Episode 1–3 targets', () => {
    expect(firstUnitTest.episodeIds).toEqual(['episode-1', 'episode-2', 'episode-3']);
    expect(firstUnitTest.questions).toHaveLength(12);
    expect(firstUnitTest.estimatedMinutes).toBeGreaterThanOrEqual(3);
    expect(firstUnitTest.estimatedMinutes).toBeLessThanOrEqual(6);
    expect(() => validateUnitTest(firstUnitTest)).not.toThrow();
  });

  it('has one answer and four plausible choices for every question', () => {
    for (const question of firstUnitTest.questions) {
      expect(question.choices).toHaveLength(4);
      expect(question.choices.filter((choice) => choice.id === question.correctChoiceId)).toHaveLength(1);
    }
  });

  it('uses the required mastery bands', () => {
    const attempt = createUnitTestAttempt(firstUnitTest.id);
    firstUnitTest.questions.forEach((question, index) => { if (index < 10) attempt.answers[question.id] = question.correctChoiceId; });
    expect(scoreUnitTest(firstUnitTest, attempt).status).toBe('Mastered');
    const passed = createUnitTestAttempt(firstUnitTest.id);
    firstUnitTest.questions.forEach((question, index) => { if (index < 8) passed.answers[question.id] = question.correctChoiceId; });
    expect(scoreUnitTest(firstUnitTest, passed).status).toBe('Passed');
  });
});
