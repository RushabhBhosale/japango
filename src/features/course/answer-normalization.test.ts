import { describe, expect, it } from 'vitest';

import { answerMatchesAcceptedVariants, containsRequiredJapanesePattern, normalizeJapaneseAnswer } from './answer-normalization';

describe('Japanese answer normalization', () => {
  it('normalizes whitespace, full-width forms, and punctuation', () => {
    expect(normalizeJapaneseAnswer('　食べます。 ')).toBe('食べます');
    expect(answerMatchesAcceptedVariants('たべます！', ['食べます', 'たべます'])).toBe(true);
  });

  it('does not treat a different conjugation as correct', () => {
    expect(answerMatchesAcceptedVariants('食べない', ['食べます'])).toBe(false);
  });

  it('finds a required Japanese pattern without punctuation sensitivity', () => {
    expect(containsRequiredJapanesePattern('私は学生です。', '学生です')).toBe(true);
  });
});
