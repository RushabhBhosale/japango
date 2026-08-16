import { describe, expect, it } from 'vitest';

import { AiChatServerError } from './errors';
import { AiChatService } from './service';
import type { AiChatProvider } from './provider';
import type { AiChatRequest } from './schemas';

const request: AiChatRequest = {
  message: '今日は仕事が忙しかった。',
  learnerLevel: 'N4',
  conversation: { recentMessages: [{ role: 'learner', content: '今日は仕事が忙しかった。' }] },
  chatPatterns: [],
  learningTargets: [],
  weaknesses: [],
};

const valid = JSON.stringify({
  reply: 'お疲れさま！今日はかなり忙しかったんだね。',
  replyReading: 'おつかれさま！きょうはかなりいそがしかったんだね。',
  mistakes: [],
  learningSignals: [],
  memoryCandidates: [],
  scenario: null,
});

function provider(id: string, results: Array<string | Error>): AiChatProvider {
  return {
    id,
    model: id,
    complete: async () => {
      const result = results.shift();
      if (result instanceof Error) throw result;
      return result ?? valid;
    },
  };
}

describe('AI chat service', () => {
  it('uses the next configured model when the primary provider is unavailable', async () => {
    const primary = provider('primary', [new AiChatServerError('RATE_LIMITED', true, 'busy')]);
    const backup = provider('backup', [valid]);

    const result = await new AiChatService([primary, backup]).respond(request, new AbortController().signal);

    expect(result.fallbackUsed).toBe(true);
    expect(result.response.reply).toContain('お疲れさま');
  });

  it('uses the next provider when the first response is not a valid chat reply', async () => {
    const model = provider('primary', ['not json']);
    const backup = provider('backup', [valid]);

    const result = await new AiChatService([model, backup]).respond(request, new AbortController().signal);

    expect(result.response.reply).toContain('お疲れさま');
    expect(result.fallbackUsed).toBe(true);
  });

  it('keeps a contextual reading with the visible reply for the mobile chat', async () => {
    const model = provider('primary', [valid]);

    const result = await new AiChatService([model]).respond(request, new AbortController().signal);

    expect(result.response.replyReading).toBe('おつかれさま！きょうはかなりいそがしかったんだね。');
  });

  it('keeps a valid reply when its optional reading is invalid', async () => {
    const missingReading = JSON.stringify({
      ...JSON.parse(valid),
      replyReading: undefined,
    });
    const model = provider('primary', [missingReading]);

    const result = await new AiChatService([model]).respond(request, new AbortController().signal);

    expect(result.response.reply).toContain('お疲れさま');
    expect(result.response.replyReading).toBeUndefined();
  });

  it('never surfaces provider metadata as a learner-visible message', async () => {
    const model = provider('primary', [JSON.stringify({ 'User Safety': 'safe' })]);

    const result = await new AiChatService([model]).respond(request, new AbortController().signal);

    expect(result.response.reply).not.toContain('User Safety');
    expect(result.response.reply).toBe('ごめん、今はうまく返せないみたい。またあとでね！');
    expect(result.response.mistakes).toEqual([]);
    expect(result.fallbackUsed).toBe(true);
  });
});
