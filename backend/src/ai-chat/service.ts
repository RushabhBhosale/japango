import { AiChatServerError } from './errors';
import { buildRepairPrompt, buildYuiChatPrompt } from './prompt-builder';
import type { AiChatProvider } from './provider';
import { aiChatResponseSchema, type AiChatRequest, type AiChatResponse } from './schemas';

const timeoutMs = Math.max(5_000, Number(process.env.AI_CHAT_REQUEST_TIMEOUT_MS ?? 20_000));

function parseJson(raw: string): AiChatResponse {
  const value = raw.trim();
  const candidate = value.startsWith('```')
    ? value.replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '')
    : value;
  try {
    return aiChatResponseSchema.parse(JSON.parse(candidate) as unknown);
  } catch {
    const match = candidate.match(/\{[\s\S]*\}/u);
    if (!match) throw new AiChatServerError('INVALID_RESPONSE', true, 'Yui sent an unreadable reply.');
    try {
      return aiChatResponseSchema.parse(JSON.parse(match[0]) as unknown);
    } catch {
      throw new AiChatServerError('INVALID_RESPONSE', true, 'Yui sent an unreadable reply.');
    }
  }
}

function plainReply(raw: string): AiChatResponse {
  let reply = raw.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  try {
    const parsed: unknown = JSON.parse(reply);
    if (parsed && typeof parsed === 'object') {
      const candidate = (parsed as { reply?: unknown; answer?: unknown; message?: unknown }).reply
        ?? (parsed as { answer?: unknown }).answer
        ?? (parsed as { message?: unknown }).message;
      if (typeof candidate === 'string') reply = candidate;
    }
  } catch {
    // The original response is already the best available plain-text reply.
  }
  reply = reply.replace(/[{}]/gu, '').trim().slice(0, 900);
  return {
    reply: reply || 'ごめん、さっきのメッセージがうまく届かなかったみたい。もう一度聞いてもいい？',
    detectedMistakes: [],
    learningSignals: [],
    memoryCandidates: [],
    conversationState: {},
  };
}

export class AiChatService {
  constructor(private readonly providers: readonly AiChatProvider[]) {}

  async respond(request: AiChatRequest, externalSignal: AbortSignal): Promise<{ response: AiChatResponse; fallbackUsed: boolean }> {
    const prompt = buildYuiChatPrompt(request);
    let lastError: unknown;
    for (let index = 0; index < this.providers.length; index += 1) {
      const provider = this.providers[index];
      try {
        const raw = await this.complete(provider, prompt, externalSignal);
        try {
          return { response: parseJson(raw), fallbackUsed: index > 0 };
        } catch {
          const repair = buildRepairPrompt(raw);
          const repaired = await this.complete(provider, repair, externalSignal);
          try {
            return { response: parseJson(repaired), fallbackUsed: index > 0 };
          } catch {
            return { response: plainReply(repaired), fallbackUsed: index > 0 };
          }
        }
      } catch (error) {
        lastError = error;
        if (error instanceof AiChatServerError && !error.retryable) throw error;
      }
    }
    if (externalSignal.aborted) throw new AiChatServerError('TIMEOUT', true, 'Yui is taking longer than usual. Please try again shortly.');
    if (lastError instanceof AiChatServerError && !lastError.retryable) throw lastError;
    throw new AiChatServerError('ALL_PROVIDERS_FAILED', true, 'Yui is unavailable right now. Please try again shortly.');
  }

  private async complete(
    provider: AiChatProvider,
    prompt: { system: string; user: string },
    externalSignal: AbortSignal,
  ): Promise<string> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    externalSignal.addEventListener('abort', abort, { once: true });
    try {
      return await provider.complete({ ...prompt, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      externalSignal.removeEventListener('abort', abort);
    }
  }
}
