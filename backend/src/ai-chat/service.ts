import { AiChatServerError } from './errors';
import { hasCompleteContextualReading } from '../daily-reading/contextual-reading';
import { buildYuiChatPrompt } from './prompt-builder';
import type { AiChatProvider } from './provider';
import { aiChatResponseSchema, type AiChatRequest, type AiChatResponse } from './schemas';

const timeoutMs = Math.max(5_000, Number(process.env.AI_CHAT_REQUEST_TIMEOUT_MS ?? 45_000));
const kanjiPattern = /[\u3400-\u9fff々ヶ]/u;

function validateReplyReading(response: AiChatResponse): AiChatResponse {
  if (!kanjiPattern.test(response.reply)) return response;
  if (response.replyReading && hasCompleteContextualReading(response.reply, response.replyReading)) return response;
  // A reading is an enhancement, never a reason to lose an otherwise usable
  // reply. The mobile renderer will simply omit furigana for this one message.
  return { ...response, replyReading: undefined };
}

function normalizeNullableReading(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const normalized = { ...(value as Record<string, unknown>) };
  if (normalized.replyReading === null) delete normalized.replyReading;
  if (normalized.scenario === null) delete normalized.scenario;
  return normalized;
}

function parseJson(raw: string): AiChatResponse {
  const value = raw.trim();
  const candidate = value.startsWith('```')
    ? value.replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '')
    : value;
  try {
    return validateReplyReading(aiChatResponseSchema.parse(normalizeNullableReading(JSON.parse(candidate) as unknown)));
  } catch {
    const match = candidate.match(/\{[\s\S]*\}/u);
    if (!match) throw new AiChatServerError('INVALID_RESPONSE', true, 'Yui sent an unreadable reply.');
    try {
      return validateReplyReading(aiChatResponseSchema.parse(normalizeNullableReading(JSON.parse(match[0]) as unknown)));
    } catch {
      throw new AiChatServerError('INVALID_RESPONSE', true, 'Yui sent an unreadable reply.');
    }
  }
}

function availabilityFallback(): AiChatResponse {
  return {
    reply: 'ごめん、今はうまく返せないみたい。またあとでね！',
    replyReading: 'ごめん、いまはうまくかえせないみたい。またあとでね！',
    mistakes: [],
    learningSignals: [],
    memoryCandidates: [],
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
        return { response: parseJson(raw), fallbackUsed: index > 0 };
      } catch (error) {
        lastError = error;
        if (error instanceof AiChatServerError && !error.retryable) throw error;
      }
    }
    if (externalSignal.aborted) throw new AiChatServerError('TIMEOUT', true, 'Yui is taking longer than usual. Please try again shortly.');
    if (lastError instanceof AiChatServerError && !lastError.retryable) throw lastError;
    return { response: availabilityFallback(), fallbackUsed: true };
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
