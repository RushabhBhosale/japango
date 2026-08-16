import { describe, expect, it } from 'vitest';

import { buildYuiChatPrompt } from './prompt-builder';
import type { AiChatRequest } from './schemas';

const request: AiChatRequest = {
  message: 'わかった',
  learnerLevel: 'N5',
  conversation: { recentMessages: [{ role: 'learner', content: 'わかった' }] },
  chatPatterns: [],
  learningTargets: [],
  weaknesses: [],
};

describe('Yui chat prompt', () => {
  it('asks for brief, natural messages instead of assistant-style explanations', () => {
    const prompt = buildYuiChatPrompt(request).system;

    expect(prompt).toContain('Default to one short sentence');
    expect(prompt).toContain('Ask at most one natural follow-up question');
    expect(prompt).toContain('Sound like a real text message');
    expect(prompt).toContain('Avoid summaries, explanations');
  });
});
