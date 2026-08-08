import { describe, expect, it } from 'vitest';

import { evaluateAcceptanceDeterministically, evaluateContactRecapDeterministically } from './free-response-fallback';

describe('Episode V3 free-response fallback', () => {
  it('accepts more than one natural Japanese response', () => {
    expect(evaluateAcceptanceDeterministically('うん、ひまだよ！').accepted).toBe(true);
    expect(evaluateAcceptanceDeterministically('いいね、行こう！').accepted).toBe(true);
  });

  it('understands a refusal but asks for an acceptance in this story', () => {
    const result = evaluateAcceptanceDeterministically('明日はちょっと忙しい。');
    expect(result.accepted).toBe(false);
    expect(result.feedback).toContain('cannot go');
  });

  it('offers support for a non-Japanese response', () => {
    expect(evaluateAcceptanceDeterministically('yes').suggestedResponse).toBe('うん、ひまだよ！');
  });

  it('accepts either completed or unfinished contact in the story recap', () => {
    expect(evaluateContactRecapDeterministically('うん、もう連絡したよ。').accepted).toBe(true);
    expect(evaluateContactRecapDeterministically('まだしてない。').accepted).toBe(true);
  });
});
