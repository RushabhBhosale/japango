import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOpenRouterChatProviders } from './provider';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('OpenRouter chat provider', () => {
  it('uses gateway model failover and requests a strict, small reply schema', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubEnv('AI_CHAT_MODEL_PRIMARY', 'primary-model');
    vi.stubEnv('AI_CHAT_MODEL_BACKUP_1', 'backup-model');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"reply":"こんにちは","replyReading":null}' } }],
    }), { status: 200 })));

    const [provider] = createOpenRouterChatProviders();
    await provider.complete({ system: 'system', user: 'user', signal: new AbortController().signal });

    expect(provider.model).toBe('primary-model');
    const [, options] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(options?.body)) as {
      model: string;
      models: string[];
      max_tokens: number;
      response_format: { type: string; json_schema: { name: string; strict: boolean } };
      provider: { allow_fallbacks: boolean; require_parameters: boolean };
    };
    expect(body.model).toBe('primary-model');
    expect(body.models).toEqual(['openrouter/free', 'backup-model', 'openai/gpt-oss-20b:free', 'google/gemma-4-26b-a4b-it:free']);
    expect(body.max_tokens).toBe(600);
    expect(body.response_format).toMatchObject({ type: 'json_schema', json_schema: { name: 'yui_chat_reply', strict: true } });
    expect(body.provider).toEqual({ allow_fallbacks: true, require_parameters: true });
  });
});
