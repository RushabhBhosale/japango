import { AiChatServerError } from './errors';

export interface AiChatProvider {
  id: string;
  model: string;
  complete(input: { system: string; user: string; signal: AbortSignal }): Promise<string>;
}

const defaultModels = [
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'openai/gpt-oss-20b:free',
] as const;

class OpenRouterChatProvider implements AiChatProvider {
  constructor(
    readonly id: string,
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  async complete(input: { system: string; user: string; signal: AbortSignal }): Promise<string> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl.replace(/\/$/u, '')}/chat/completions`, {
        method: 'POST',
        signal: input.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          'x-title': 'JapanGo AI Chat',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }],
          max_tokens: 900,
          temperature: 0.65,
        }),
      });
    } catch {
      if (input.signal.aborted) throw new AiChatServerError('TIMEOUT', true, 'Yui is taking longer than usual. Please try again shortly.');
      throw new AiChatServerError('PROVIDER_UNAVAILABLE', true, 'Yui is unavailable right now. Please try again shortly.');
    }
    if (!response.ok) {
      const retryable = response.status !== 401 && response.status !== 403;
      throw new AiChatServerError(
        response.status === 401 || response.status === 403
          ? 'AUTH_CONFIGURATION_ERROR'
          : response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE',
        retryable,
        'Yui is unavailable right now. Please try again shortly.',
      );
    }
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new AiChatServerError('PROVIDER_UNAVAILABLE', true, 'Yui is unavailable right now. Please try again shortly.');
    return content;
  }
}

export function createOpenRouterChatProviders(): AiChatProvider[] {
  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.AI_CHAT_OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AiChatServerError('AUTH_CONFIGURATION_ERROR', false, 'Yui’s chat service is not configured yet.');
  }
  const models = [
    process.env.AI_CHAT_MODEL_PRIMARY ?? defaultModels[0],
    process.env.AI_CHAT_MODEL_BACKUP_1 ?? defaultModels[1],
    process.env.AI_CHAT_MODEL_BACKUP_2 ?? defaultModels[2],
  ].filter((model, index, all) => Boolean(model) && all.indexOf(model) === index);
  const baseUrl = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
  return models.map((model, index) => new OpenRouterChatProvider(index === 0 ? 'openrouter-primary' : `openrouter-backup-${index}`, model, apiKey, baseUrl));
}
