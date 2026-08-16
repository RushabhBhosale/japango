import { AiChatServerError } from './errors';

export interface AiChatProvider {
  id: string;
  model: string;
  complete(input: { system: string; user: string; signal: AbortSignal }): Promise<string>;
}

const yuiResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'yui_chat_reply',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reply: { type: 'string', minLength: 1, maxLength: 120, description: 'Yui’s natural text-message reply: normally one short sentence, never more than two.' },
        replyReading: { type: ['string', 'null'], maxLength: 1_800, description: 'Complete hiragana reading of reply, or null if no kanji appears.' },
        mistakes: {
          type: 'array', maxItems: 6,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              original: { type: 'string', minLength: 1, maxLength: 500 },
              correction: { type: 'string', minLength: 1, maxLength: 500 },
              category: { type: 'string', enum: ['grammar', 'particle', 'conjugation', 'vocabulary', 'naturalness', 'kanji', 'other'] },
              severity: { type: 'string', enum: ['low', 'medium', 'high'] },
              confidence: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['original', 'correction', 'category', 'severity', 'confidence'],
          },
        },
        learningSignals: {
          type: 'array', maxItems: 8,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              type: { type: 'string', enum: ['grammar', 'vocabulary', 'kanji'] },
              key: { type: 'string', minLength: 1, maxLength: 160 },
              result: { type: 'string', enum: ['strong', 'weak', 'mistake'] },
            },
            required: ['type', 'key', 'result'],
          },
        },
        memoryCandidates: {
          type: 'array', maxItems: 4,
          items: {
            type: 'object', additionalProperties: false,
            properties: { text: { type: 'string', minLength: 1, maxLength: 280 }, importance: { type: 'number', minimum: 0, maximum: 1 } },
            required: ['text', 'importance'],
          },
        },
        scenario: {
          type: ['object', 'null'], additionalProperties: false,
          properties: {
            topic: { type: ['string', 'null'], maxLength: 120 },
            state: { type: ['string', 'null'], maxLength: 160 },
            continuationSuggested: { type: ['boolean', 'null'] },
          },
          required: ['topic', 'state', 'continuationSuggested'],
        },
      },
      required: ['reply', 'replyReading', 'mistakes', 'learningSignals', 'memoryCandidates', 'scenario'],
    },
  },
} as const;

const defaultModels = [
  // OpenRouter keeps this router aligned with the currently available free
  // models, avoiding outages when a pinned free model is temporarily absent.
  'openrouter/free',
  'openai/gpt-oss-20b:free',
  'google/gemma-4-26b-a4b-it:free',
] as const;

class OpenRouterChatProvider implements AiChatProvider {
  constructor(
    readonly id: string,
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly fallbackModels: readonly string[] = [],
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
          models: this.fallbackModels.length ? this.fallbackModels : undefined,
          messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }],
          max_tokens: 600,
          temperature: 0.35,
          response_format: yuiResponseFormat,
          provider: { allow_fallbacks: true, require_parameters: true },
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
  const configuredModels = [
    process.env.AI_CHAT_MODEL_PRIMARY,
    process.env.AI_CHAT_MODEL_BACKUP_1,
    process.env.AI_CHAT_MODEL_BACKUP_2,
  ].filter((model): model is string => Boolean(model));
  const models = [
    configuredModels[0] ?? defaultModels[0],
    // Keep an availability fallback even for deployments that still pin older
    // free model IDs in their environment configuration.
    'openrouter/free',
    ...configuredModels.slice(1),
    ...defaultModels.slice(1),
  ].filter((model, index, all) => Boolean(model) && all.indexOf(model) === index);
  const baseUrl = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';
  return [new OpenRouterChatProvider('openrouter', models[0], apiKey, baseUrl, models.slice(1))];
}
