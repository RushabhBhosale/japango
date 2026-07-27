import { describe, expect, it } from 'vitest';

import type { AssessmentAnswer, AssessmentCategory } from '../../types/learning';
import { classifyLearnerLevel, scoreAssessment } from './scoring';

function makeAnswers(category: AssessmentCategory, correct: number, total: number): AssessmentAnswer[] {
  return Array.from({ length: total }, (_, index) => ({
    questionId: `${category}-${index}`,
    category,
    correct: index < correct,
  }));
}

describe('scoreAssessment', () => {
  it('calculates overall and category scores locally', () => {
    const result = scoreAssessment([
      ...makeAnswers('vocabulary', 4, 5),
      ...makeAnswers('kanji', 3, 5),
      ...makeAnswers('grammar', 2, 5),
      ...makeAnswers('reading', 5, 5),
    ]);

    expect(result.overallScore).toBe(70);
    expect(result.totalCorrect).toBe(14);
    expect(result.categoryScores.find((score) => score.category === 'reading')?.percentage).toBe(100);
    expect(result.strongAreas).toEqual(['vocabulary', 'reading']);
    expect(result.weakAreas).toEqual(['grammar']);
    expect(result.learnerLevel).toBe('N5 recovery');
  });
});

describe('classifyLearnerLevel', () => {
  it.each([
    [0, 'N5 foundation needed'],
    [49, 'N5 foundation needed'],
    [50, 'N5 recovery'],
    [79, 'N5 recovery'],
    [80, 'Ready to begin N4 gradually'],
    [100, 'Ready to begin N4 gradually'],
  ] as const)('classifies %i as %s', (score, expected) => {
    expect(classifyLearnerLevel(score)).toBe(expected);
  });
});
