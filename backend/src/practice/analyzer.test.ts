import { describe, expect, it } from 'vitest';

import type { AiProvider } from '../ai/types';
import { analyzePracticeSessions } from './analyzer';
import type { PracticeAnalysisBatch, PracticeAnalysisRequest } from './schemas';

const request: PracticeAnalysisRequest = {
  sessions: [{
    id: 'SESSION_20260816_001',
    practicedAt: '2026-08-16',
    transcript: 'USER:\n昨日友達と映画を見ます。\nASSISTANT:\n見ました is natural here.',
  }],
  curriculumCandidates: [{
    id: 'grammar-u-verbpast',
    type: 'grammar',
    title: 'U-verb past',
    meaning: 'polite past tense',
  }],
  existingEvidence: [],
};

function provider(value: unknown): AiProvider {
  return {
    id: 'test',
    model: 'test-model',
    capabilities: { structuredOutput: true, streaming: false, supportsJapanese: true, supportsSystemMessages: true },
    complete: async () => JSON.stringify(value),
  };
}

const valid: PracticeAnalysisBatch = {
  analyses: [{
    sessionId: 'SESSION_20260816_001',
    analysis: {
      mistakes: [{
        original: '昨日友達と映画を見ます。',
        corrected: '昨日友達と映画を見ました。',
        category: 'conjugation',
        explanation: 'Yesterday calls for the past form.',
        confidence: 0.98,
      }],
      weakGrammar: [],
      weakVocabulary: [],
      weakKanji: [],
      learnedVocabulary: [],
      strengths: [],
      recurringMistakes: [],
      suggestedReview: ['Review polite past tense once.'],
      topics: ['movies'],
    },
    curriculumLinks: [],
  }],
};

describe('practice analyzer', () => {
  it('accepts one strictly validated analysis per session', async () => {
    const result = await analyzePracticeSessions(request, [provider(valid)], new AbortController().signal);

    expect(result.response.analyses[0]?.analysis.mistakes[0]?.category).toBe('conjugation');
    expect(result.fallbackUsed).toBe(false);
  });

  it('rejects hallucinated curriculum links and falls back to the next provider', async () => {
    const invalid = structuredClone(valid);
    invalid.analyses[0]!.curriculumLinks = [{
      type: 'grammar', key: 'past tense', curriculumItemId: 'not-a-candidate', evidence: 'weak',
    }];

    const result = await analyzePracticeSessions(request, [provider(invalid), provider(valid)], new AbortController().signal);

    expect(result.fallbackUsed).toBe(true);
    expect(result.response).toEqual(valid);
  });

  it('rejects corrections that cannot be traced to learner text', async () => {
    const invalid = structuredClone(valid);
    invalid.analyses[0]!.analysis.mistakes[0]!.original = '明日は京都へ行きます。';

    const result = await analyzePracticeSessions(request, [provider(invalid), provider(valid)], new AbortController().signal);

    expect(result.fallbackUsed).toBe(true);
    expect(result.response).toEqual(valid);
  });
});
