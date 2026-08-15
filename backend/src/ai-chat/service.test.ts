import { describe, expect, it } from 'vitest';

import { AiChatServerError } from './errors';
import { AiChatService } from './service';
import type { AiChatProvider } from './provider';
import type { AiChatRequest } from './schemas';

const request: AiChatRequest = {
  message: '今日は仕事が忙しかった。',
  learnerLevel: 'N4',
  conversation: { recentMessages: [{ role: 'learner', content: '今日は仕事が忙しかった。' }] },
  weaknesses: [],
};

const valid = JSON.stringify({
  reply: 'お疲れさま！今日はかなり忙しかったんだね。',
  replyReading: 'おつかれさま！きょうはかなりいそがしかったんだね。',
  detectedMistakes: [],
  learningSignals: [],
  memoryCandidates: [],
  conversationState: { mood: 'tired' },
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

  it('repairs a malformed structured reply once without another normal chat turn', async () => {
    const model = provider('primary', ['not json', valid]);

    const result = await new AiChatService([model]).respond(request, new AbortController().signal);

    expect(result.response.reply).toContain('お疲れさま');
  });

  it('keeps a contextual reading with the visible reply for the mobile chat', async () => {
    const model = provider('primary', [valid]);

    const result = await new AiChatService([model]).respond(request, new AbortController().signal);

    expect(result.response.replyReading).toBe('おつかれさま！きょうはかなりいそがしかったんだね。');
  });

  it('keeps the conversation alive with an extracted plain reply when repair also fails', async () => {
    const model = provider('primary', ['not json', JSON.stringify({ answer: '今日は大変だったね。' })]);

    const result = await new AiChatService([model]).respond(request, new AbortController().signal);

    expect(result.response.reply).toBe('今日は大変だったね。');
    expect(result.response.detectedMistakes).toEqual([]);
  });
});
