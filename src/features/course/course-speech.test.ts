import { describe, expect, it } from 'vitest';

import { courseSpeechText } from './course-speech';

describe('course speech text', () => {
  it('uses the authored reading for the character name while retaining other text', () => {
    expect(courseSpeechText('あきは蓮と話します。')).toBe('あきはれんと話します。');
  });
});
