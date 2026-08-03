import { afterEach, describe, expect, it, vi } from 'vitest';

import type { JapaneseRetrievalConfig } from './config';
import { OllamaEmbeddingClient } from './embeddings';

const config: JapaneseRetrievalConfig = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseServiceRoleKey: 'service-role',
  embeddingProvider: 'ollama',
  ollamaBaseUrl: 'http://localhost:11434/',
  ollamaEmbeddingModel: 'qwen3-embedding:4b',
  embeddingDimensions: 2,
};

afterEach(() => vi.unstubAllGlobals());

describe('OllamaEmbeddingClient', () => {
  it('uses Ollama’s native batch embedding endpoint without an authorization header', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      embeddings: [[0.1, 0.2], [0.3, 0.4]],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new OllamaEmbeddingClient(config).embedMany(['食べる', '飲む']))
      .resolves.toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:11434/api/embed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'qwen3-embedding:4b', input: ['食べる', '飲む'] }),
    });
  });
});
