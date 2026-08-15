import { afterEach, describe, expect, it, vi } from 'vitest';

import { embedAiChatTexts } from './embeddings';

afterEach(() => vi.unstubAllGlobals());

describe('AI chat embeddings', () => {
  it('uses the configured OpenRouter embedding model without exposing its key to the client', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const originalKey = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = 'server-only-key';

    await expect(embedAiChatTexts(['京都に行きたい'], new AbortController().signal)).resolves.toEqual([[0.1, 0.2]]);
    expect(fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/embeddings', expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer server-only-key' }),
      body: JSON.stringify({ model: 'nvidia/nemotron-3-embed-1b:free', input: ['京都に行きたい'] }),
    }));
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  });
});
