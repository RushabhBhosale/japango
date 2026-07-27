import { describe, expect, it } from 'vitest';

import { deterministicAiFallback } from './fallbacks';

describe('deterministic AI fallbacks', () => {
  it('uses canonical item details without a provider response', () => {
    const result = deterministicAiFallback('explain_vocabulary', { learnerLevel: 'N5', item: { id: 'vocab-taberu', type: 'vocabulary', title: '食べる', reading: 'たべる', meaning: 'to eat', details: ['verb', 'Use it for meals.'] } });
    expect(result.source).toBe('fallback'); expect(result.response.answer).toContain('食べる'); expect(result.response.answer).toContain('to eat');
  });
});
