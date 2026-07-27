import { describe, expect, it } from 'vitest';

import { createTransformation, validateTransformation } from './sentence-transformation';

describe('sentence transformations', () => {
  it('creates and validates verb transformations with normalized variants', () => {
    const te = createTransformation('dictionary-to-te', '食べる', '食べる');
    expect(te.expectedAnswers).toEqual(['食べて']);
    expect(validateTransformation(' 食べて。', te)).toBe(true);
  });

  it('accepts supported polite and plain negative or past forms', () => {
    const negative = createTransformation('affirmative-to-negative', '食べます', '食べる');
    const past = createTransformation('present-to-past', '食べます', '食べる');
    expect(validateTransformation('食べません', negative)).toBe(true);
    expect(validateTransformation('食べました', past)).toBe(true);
  });

  it('supports sentence combination with punctuation variants', () => {
    const combined = createTransformation('combine-te-kara', '');
    expect(validateTransformation('ご飯を食べてから、学校へ行きます。', combined)).toBe(true);
  });
});
