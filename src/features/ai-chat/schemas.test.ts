import { describe, expect, it } from 'vitest';

import { aiChatResponseSchema } from './schemas';

describe('structured Yui chat output', () => {
  it('keeps the visible reply separate from silent learning evidence', () => {
    const result = aiChatResponseSchema.parse({
      reply: '雨が降ったら、カフェに行こうか。',
      mistakes: [{ original: '雨降るたら', correction: '雨が降ったら', category: 'conjugation', severity: 'medium', confidence: 0.92 }],
      learningSignals: [{ type: 'grammar', key: '〜たら', result: 'mistake' }],
      memoryCandidates: [{ text: 'The learner enjoys rainy-day café plans.', importance: 0.72 }],
      scenario: { topic: 'weekend plans', state: 'active', continuationSuggested: true },
    });

    expect(result.reply).toContain('カフェ');
    expect(result.mistakes[0]?.correction).toBe('雨が降ったら');
    expect(result.learningSignals[0]?.result).toBe('mistake');
  });

  it('rejects unsupported hidden keys instead of silently accepting them', () => {
    expect(() => aiChatResponseSchema.parse({ reply: 'こんにちは', mistakes: [], learningSignals: [], memoryCandidates: [], extra: true }))
      .toThrow();
  });
});
