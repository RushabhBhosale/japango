import { AiServerError } from './errors';
import { aiTeacherResponseSchema, type AiProvider, type AiTeacherRequest, type AiTeacherResponse } from './types';

type BreakerState = { failures: number; openedUntil?: number; probing: boolean };
const breakers = new Map<string, BreakerState>();
const cooldownMs = Math.max(10, Number(process.env.AI_COOLDOWN_SECONDS ?? 45)) * 1000;
const timeoutMs = Math.max(1000, Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 12000));

function systemPrompt(request: AiTeacherRequest): string { return `You are JapanGo's concise Japanese teacher. Teach only the supplied JLPT ${request.context.learnerLevel} context. Canonical context is authoritative; do not invent rules, facts, or curriculum. Use original short examples. Return only JSON matching: {"answer":"...","japaneseExamples":[{"japanese":"...","reading":"...","translation":"..."}],"corrections":[{"original":"...","corrected":"...","explanation":"...","category":"incorrect|unnatural|style"}],"followUpSuggestions":["..."],"confidence":"low|medium|high"}.`; }
function userPrompt(request: AiTeacherRequest): string { return JSON.stringify({ feature: request.feature, context: request.context, userInput: request.userInput ?? '' }); }
function extractJson(value: string): unknown { const trimmed = value.trim(); try { return JSON.parse(trimmed) as unknown; } catch { const match = trimmed.match(/\{[\s\S]*\}/u); if (!match) throw new AiServerError('INVALID_RESPONSE', true, 'The AI response could not be completed.'); return JSON.parse(match[0]) as unknown; } }
function retryable(error: unknown): boolean { return error instanceof AiServerError ? error.retryable : true; }
export function resetAiCircuitBreakers(): void { breakers.clear(); }

export class AiOrchestrator {
  constructor(private readonly providers: AiProvider[]) {}
  async run(request: AiTeacherRequest, externalSignal: AbortSignal): Promise<{ response: AiTeacherResponse; fallbackUsed: boolean; latencyMs: number }> {
    const startedAt = Date.now(); let lastError: unknown;
    for (let index = 0; index < this.providers.length; index += 1) {
      const provider = this.providers[index]; const state = breakers.get(`${provider.id}:${provider.model}`) ?? { failures: 0, probing: false }; const now = Date.now();
      if (state.openedUntil && state.openedUntil > now) continue;
      if (state.openedUntil && state.probing) continue;
      if (state.openedUntil) state.probing = true;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs); const abort = () => controller.abort(); externalSignal.addEventListener('abort', abort, { once: true });
          try { const raw = await provider.complete({ system: systemPrompt(request), user: userPrompt(request), signal: controller.signal }); const response = aiTeacherResponseSchema.parse(extractJson(raw)); breakers.set(`${provider.id}:${provider.model}`, { failures: 0, probing: false }); return { response, fallbackUsed: index > 0, latencyMs: Date.now() - startedAt }; } finally { clearTimeout(timeout); externalSignal.removeEventListener('abort', abort); }
        } catch (error) { lastError = error; if (!retryable(error) || attempt === 1) break; }
      }
      if (lastError instanceof AiServerError && !lastError.retryable) throw lastError;
      const failures = state.failures + 1; breakers.set(`${provider.id}:${provider.model}`, { failures, openedUntil: failures >= 2 ? Date.now() + cooldownMs : undefined, probing: false });
    }
    if (externalSignal.aborted) throw new AiServerError('CANCELLED', false, 'The AI request was cancelled.');
    if (lastError instanceof AiServerError && !lastError.retryable) throw lastError;
    throw new AiServerError('ALL_PROVIDERS_FAILED', true, 'Your AI teacher is temporarily unavailable.');
  }
}

class OpenAiCompatibleProvider implements AiProvider {
  readonly capabilities = { structuredOutput: false, streaming: false, supportsJapanese: true, supportsSystemMessages: true };
  constructor(readonly id: string, readonly model: string, private readonly baseUrl: string, private readonly apiKey: string) {}
  async complete(input: { system: string; user: string; signal: AbortSignal }): Promise<string> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/u, '')}/chat/completions`, { method: 'POST', signal: input.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` }, body: JSON.stringify({ model: this.model, messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }], response_format: { type: 'json_object' }, max_tokens: 700, temperature: 0.3 }) });
    if (!response.ok) throw new AiServerError(response.status === 401 || response.status === 403 ? 'AUTH_CONFIGURATION_ERROR' : response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE', response.status !== 401 && response.status !== 403, 'The AI service is busy right now.');
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> }; const content = body.choices?.[0]?.message?.content;
    if (!content) throw new AiServerError('INVALID_RESPONSE', true, 'The AI response could not be completed.'); return content;
  }
}

function configured(slot: 'PRIMARY' | 'BACKUP_1' | 'BACKUP_2'): AiProvider | undefined { const model = process.env[`AI_MODEL_${slot}`]; const key = process.env[`AI_API_KEY_${slot}`] ?? process.env.AI_PROVIDER_API_KEY; const base = process.env[`AI_BASE_URL_${slot}`] ?? process.env.AI_BASE_URL; if (!model || !key || !base) return undefined; return new OpenAiCompatibleProvider(process.env[`AI_PROVIDER_${slot}`] ?? slot.toLowerCase(), model, base, key); }
export function createServerProviderRegistry(): AiProvider[] { const providers = [configured('PRIMARY'), configured('BACKUP_1'), configured('BACKUP_2')].filter((provider): provider is AiProvider => Boolean(provider)); if (!providers.length) throw new AiServerError('AUTH_CONFIGURATION_ERROR', false, 'The AI teacher is not configured yet.'); return providers; }
