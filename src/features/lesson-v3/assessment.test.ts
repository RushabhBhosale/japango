import { describe, expect, it } from 'vitest';

import { scoreV3Assessment, v3AssessmentQuestions } from './assessment';

describe('V3 starting check', () => {
  it('keeps low-evidence results broad and enables guided assistance', () => {
    const answers = v3AssessmentQuestions.map((question, index) => ({
      questionId: question.id,
      selectedOptionId: index < 2 ? question.correctOptionId : 'not-correct',
      correct: index < 2,
    }));
    const result = scoreV3Assessment(answers, 'not-sure');
    expect(result.startingLevel).toBe('Beginner');
    expect(result.assistanceMode).toBe('guided');
  });

  it('recognizes broad N4 evidence without inventing a precise score', () => {
    const answers = v3AssessmentQuestions.map((question) => ({
      questionId: question.id,
      selectedOptionId: question.correctOptionId,
      correct: true,
    }));
    const result = scoreV3Assessment(answers, 'n4');
    expect(result.startingLevel).toBe('Around N4');
    expect(result.assistanceMode).toBe('independent');
    expect(result.grammar).toBe('N5 strong / early N4');
  });
});
