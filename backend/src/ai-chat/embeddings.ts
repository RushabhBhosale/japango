import { z } from 'zod';

import { AiChatServerError } from './errors';

const openRouterEmbeddingResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number().finite()).min(1) }).strict()).min(1),
}).passthrough();

const embeddingModel = process.env.AI_CHAT_EMBEDDING_MODEL ?? 'nvidia/nemotron-3-embed-1b:free';
const timeoutMs = Math.max(3_000, Number(process.env.AI_CHAT_EMBEDDING_TIMEOUT_MS ?? 12_000));

export async function embedAiChatTexts(inputs: readonly string[], externalSignal: AbortSignal): Promise<number[][]> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.AI_CHAT_OPENROUTER_API_KEY;
  if (!apiKey) throw new AiChatServerError('AUTH_CONFIGURATION_ERROR', false, 'Yui’s chat service is not configured yet.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  externalSignal.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetch(`${(process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1').replace(/\/$/u, '')}/embeddings`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'x-title': 'JapanGo AI Chat Memory',
      },
      body: JSON.stringify({ model: embeddingModel, input: inputs }),
    });
    if (!response.ok) {
      throw new AiChatServerError(
        response.status === 401 || response.status === 403
          ? 'AUTH_CONFIGURATION_ERROR'
          : response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE',
        response.status !== 401 && response.status !== 403,
        'Yui’s memory service is unavailable right now.',
      );
    }
    const body = openRouterEmbeddingResponseSchema.parse(await response.json() as unknown);
    const embeddings = body.data.map(({ embedding }) => embedding);
    if (embeddings.length !== inputs.length) {
      throw new AiChatServerError('INVALID_RESPONSE', true, 'Yui’s memory service returned an incomplete response.');
    }
    const dimension = embeddings[0]?.length;
    if (!dimension || embeddings.some((embedding) => embedding.length !== dimension)) {
      throw new AiChatServerError('INVALID_RESPONSE', true, 'Yui’s memory service returned incompatible vectors.');
    }
    return embeddings;
  } catch (error) {
    if (error instanceof AiChatServerError || error instanceof z.ZodError) {
      if (error instanceof z.ZodError) throw new AiChatServerError('INVALID_RESPONSE', true, 'Yui’s memory service returned an unreadable response.');
      throw error;
    }
    if (controller.signal.aborted) throw new AiChatServerError('TIMEOUT', true, 'Yui’s memory service is taking longer than usual.');
    throw new AiChatServerError('PROVIDER_UNAVAILABLE', true, 'Yui’s memory service is unavailable right now.');
  } finally {
    clearTimeout(timeout);
    externalSignal.removeEventListener('abort', abort);
  }
}
