import { describe, expect, it } from 'vitest';

import { practiceAnalysisApiResponseSchema } from './schemas';

const emptyAnalysis = {
  mistakes: [],
  weakGrammar: [],
  weakVocabulary: [],
  weakKanji: [],
  learnedVocabulary: [],
  strengths: [],
  recurringMistakes: [],
  suggestedReview: [],
  topics: [],
};

describe('practice analysis API validation', () => {
  it('accepts validated provider metadata returned by the backend', () => {
    const result = practiceAnalysisApiResponseSchema.safeParse({
      success: true,
      data: {
        analyses: [{
          sessionId: 'SESSION_1',
          analysis: emptyAnalysis,
          curriculumLinks: [],
        }],
      },
      meta: { fallbackUsed: false },
    });

    expect(result.success).toBe(true);
  });

  it('rejects partially valid analysis data', () => {
    const result = practiceAnalysisApiResponseSchema.safeParse({
      success: true,
      data: {
        analyses: [{
          sessionId: 'SESSION_1',
          analysis: { ...emptyAnalysis, mistakes: [{ original: '行きます' }] },
          curriculumLinks: [],
        }],
      },
    });

    expect(result.success).toBe(false);
  });
});
