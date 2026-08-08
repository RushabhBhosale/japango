import { AiServerError } from './errors';
import {
  JapaneseSentenceGenerationPipeline,
  japaneseGenerationInputSchema,
  type JapaneseGenerationInput,
  type JapaneseGenerationLogger,
} from './japanese-generation';
import { loadJapaneseGenerationReferences } from './japanese-generation-references';
import { aiTeacherResponseSchema, type AiProvider, type AiTeacherRequest, type AiTeacherResponse } from './types';

type BreakerState = { failures: number; openedUntil?: number; probing: boolean };
const breakers = new Map<string, BreakerState>();
const cooldownMs = Math.max(10, Number(process.env.AI_COOLDOWN_SECONDS ?? 45)) * 1000;
const timeoutMs = Math.max(1000, Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 12000));

export function teacherSystemPrompt(request: AiTeacherRequest): string {
  if (request.feature === 'conversation' && request.context.item?.id === 'episode-1-yuki-meet-shinjuku') {
    return `You are Yuki, a friendly new friend in a controlled JapanGo story. Reply directly to the learner's latest Japanese message; stay warm, short, and natural. You are not a Japanese teacher: never correct grammar, explain vocabulary, mention a lesson, or write English.

This is a single checkpoint, not open-ended roleplay. The fixed destination is a plan to meet at Shinjuku Station. Respect the learner's availability or constraints. If their message says they work tomorrow and no finishing time is known, ask one short question about when work ends. If the supplied context says this is the final turn, you must confirm or propose the Shinjuku plan rather than ask another question. Otherwise, gently move toward a concrete Shinjuku meeting plan. Do not invent personal facts, change the episode goal, or write more than two short Japanese sentences.

Return only JSON matching: {"answer":"short Japanese message from Yuki","followUpSuggestions":["ASK_FOLLOW_UP"|"CHECKPOINT_REACHED"],"confidence":"low|medium|high"}. Include exactly one followUpSuggestions value. Omit corrections and japaneseExamples.`;
  }
  return `You are JapanGo's concise Japanese teacher. Teach only the supplied JLPT ${request.context.learnerLevel} context. Canonical context is authoritative; do not invent rules, facts, or curriculum.

Do not generate example sentences in this response; omit japaneseExamples. JapanGo attaches examples through a separate semantic-planning and critic pipeline.

When correcting Japanese, generate the Japanese idea directly rather than translating an English sentence. Prefer common Japanese collocations, realistic daily-life meaning, natural particles, and concise N5/N4 phrasing. Never force supplied vocabulary into a grammar pattern. Preserve the learning target in any correction. Avoid literal English collocations, semantically strange comparisons, redundant phrasing, and unnecessary 〜ということ, 〜という, or することができます.

Return only JSON matching: {"answer":"...","corrections":[{"original":"...","corrected":"...","explanation":"...","category":"incorrect|unnatural|style"}],"followUpSuggestions":["..."],"confidence":"low|medium|high"}.`;
}

export function teacherUserPrompt(request: AiTeacherRequest): string {
  return JSON.stringify({ feature: request.feature, context: request.context, userInput: request.userInput ?? '' });
}

function extractJson(value: string): unknown {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/u);
    if (!match) throw new AiServerError('INVALID_RESPONSE', true, 'The AI response could not be completed.');
    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      throw new AiServerError('INVALID_RESPONSE', true, 'The AI response could not be completed.');
    }
  }
}

function retryable(error: unknown): boolean {
  return error instanceof AiServerError ? error.retryable : true;
}

function breakerKey(provider: AiProvider): string {
  return `${provider.id}:${provider.model}`;
}

function generationInputFrom(request: AiTeacherRequest): JapaneseGenerationInput {
  const item = request.context.item;
  const itemType = item?.type.toLocaleLowerCase('en-US') ?? '';
  const grammarTarget = itemType.includes('grammar');
  const vocabularyTarget = item && (itemType.includes('vocabulary') || itemType.includes('kanji'));
  return japaneseGenerationInputSchema.parse({
    level: request.context.targetLevel ?? request.context.learnerLevel,
    targetGrammar: {
      id: grammarTarget ? item?.id : undefined,
      pattern: grammarTarget ? item?.title : `natural ${request.context.targetLevel ?? request.context.learnerLevel} sentence structure`,
      meaning: grammarTarget
        ? item?.meaning ?? item?.details?.join(' ') ?? 'the supplied canonical grammar function'
        : 'use the target word in a concise, realistic sentence',
    },
    vocabulary: vocabularyTarget ? [{
      id: item.id,
      japanese: item.title,
      reading: item.reading,
      meaning: item.meaning ?? 'the supplied canonical curriculum meaning',
    }] : [],
    preferredRegister: 'polite',
    requestedContext: request.userInput || item?.details?.join(' '),
    references: [],
  });
}

export function resetAiCircuitBreakers(): void {
  breakers.clear();
}

export class AiOrchestrator {
  constructor(
    private readonly providers: AiProvider[],
    private readonly referenceLoader: typeof loadJapaneseGenerationReferences = loadJapaneseGenerationReferences,
  ) {}

  async run(
    request: AiTeacherRequest,
    externalSignal: AbortSignal,
  ): Promise<{ response: AiTeacherResponse; fallbackUsed: boolean; latencyMs: number }> {
    const startedAt = Date.now();
    let lastError: unknown;

    for (let index = 0; index < this.providers.length; index += 1) {
      const provider = this.providers[index];
      const key = breakerKey(provider);
      const state = breakers.get(key) ?? { failures: 0, probing: false };
      const now = Date.now();
      if (state.openedUntil && state.openedUntil > now) continue;
      if (state.openedUntil && state.probing) continue;
      if (state.openedUntil) state.probing = true;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = request.feature === 'generate_examples'
            ? await this.generateExamples(provider, request, externalSignal)
            : await this.runTeacherResponse(provider, request, externalSignal);
          breakers.set(key, { failures: 0, probing: false });
          return { response, fallbackUsed: index > 0, latencyMs: Date.now() - startedAt };
        } catch (error) {
          lastError = error;
          if (!retryable(error) || attempt === 1) break;
        }
      }

      if (lastError instanceof AiServerError && !lastError.retryable) throw lastError;
      const failures = state.failures + 1;
      breakers.set(key, {
        failures,
        openedUntil: failures >= 2 ? Date.now() + cooldownMs : undefined,
        probing: false,
      });
    }

    if (externalSignal.aborted) throw new AiServerError('CANCELLED', false, 'The AI request was cancelled.');
    if (lastError instanceof AiServerError && !lastError.retryable) throw lastError;
    throw new AiServerError('ALL_PROVIDERS_FAILED', true, 'Your AI teacher is temporarily unavailable.');
  }

  private async runTeacherResponse(
    provider: AiProvider,
    request: AiTeacherRequest,
    signal: AbortSignal,
  ): Promise<AiTeacherResponse> {
    const raw = await this.complete(provider, teacherSystemPrompt(request), teacherUserPrompt(request), signal);
    return aiTeacherResponseSchema.parse(extractJson(raw));
  }

  private async generateExamples(
    provider: AiProvider,
    request: AiTeacherRequest,
    signal: AbortSignal,
  ): Promise<AiTeacherResponse> {
    const baseInput = generationInputFrom(request);
    const references = await this.referenceLoader(baseInput, 5);
    const examples: NonNullable<AiTeacherResponse['japaneseExamples']> = [];
    const logger: JapaneseGenerationLogger = process.env.NODE_ENV === 'production'
      ? () => undefined
      : (event) => console.warn('[japanese-generation] Sentence rejected', event);
    const model = {
      complete: ({ system, user, signal: generationSignal }: Parameters<AiProvider['complete']>[0]) =>
        this.complete(provider, system, user, generationSignal, signal),
    };
    const pipeline = new JapaneseSentenceGenerationPipeline(model, logger);

    for (let index = 0; index < 3; index += 1) {
      const priorSentences = examples.map(({ japanese }) => japanese);
      const requestedContext = [
        baseInput.requestedContext,
        `Create example ${index + 1} of 3 in a distinct realistic daily-life or JLPT-style situation.`,
        priorSentences.length ? `Do not repeat these accepted sentences: ${priorSentences.join(' / ')}` : undefined,
      ].filter(Boolean).join(' ').slice(0, 500);
      const generated = await pipeline.generate({
        ...baseInput,
        requestedContext,
        references,
      }, signal);
      if (!generated.compatible) continue;
      examples.push({
        japanese: generated.japanese,
        reading: generated.reading,
        translation: generated.translation,
        target: baseInput.targetGrammar.pattern,
        generationMetadata: generated.metadata,
      });
    }

    if (!examples.length) {
      throw new AiServerError('INVALID_RESPONSE', true, 'No compatible natural examples could be generated.');
    }
    return aiTeacherResponseSchema.parse({
      answer: `Here ${examples.length === 1 ? 'is' : 'are'} ${examples.length} independently checked ${baseInput.level} example${examples.length === 1 ? '' : 's'}.`,
      japaneseExamples: examples,
      followUpSuggestions: ['Compare the situations and collocations', 'Say each example aloud'],
      confidence: 'high',
    });
  }

  private async complete(
    provider: AiProvider,
    system: string,
    user: string,
    signal: AbortSignal,
    externalSignal?: AbortSignal,
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    externalSignal?.addEventListener('abort', abort, { once: true });
    try {
      return await provider.complete({ system, user, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      externalSignal?.removeEventListener('abort', abort);
    }
  }
}

class OpenAiCompatibleProvider implements AiProvider {
  readonly capabilities = { structuredOutput: false, streaming: false, supportsJapanese: true, supportsSystemMessages: true };

  constructor(
    readonly id: string,
    readonly model: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  async complete(input: { system: string; user: string; signal: AbortSignal; maxTokens?: number; temperature?: number }): Promise<string> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/u, '')}/chat/completions`, {
      method: 'POST',
      signal: input.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'system', content: input.system }, { role: 'user', content: input.user }],
        response_format: { type: 'json_object' },
        max_tokens: input.maxTokens ?? 1200,
        temperature: input.temperature ?? 0.25,
      }),
    });
    if (!response.ok) {
      throw new AiServerError(
        response.status === 401 || response.status === 403
          ? 'AUTH_CONFIGURATION_ERROR'
          : response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE',
        response.status !== 401 && response.status !== 403,
        'The AI service is busy right now.',
      );
    }
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new AiServerError('INVALID_RESPONSE', true, 'The AI response could not be completed.');
    return content;
  }
}

function configured(slot: 'PRIMARY' | 'BACKUP_1' | 'BACKUP_2'): AiProvider | undefined {
  const model = process.env[`AI_MODEL_${slot}`];
  const key = process.env[`AI_API_KEY_${slot}`] ?? process.env.AI_PROVIDER_API_KEY;
  const base = process.env[`AI_BASE_URL_${slot}`] ?? process.env.AI_BASE_URL;
  if (!model || !key || !base) return undefined;
  return new OpenAiCompatibleProvider(
    process.env[`AI_PROVIDER_${slot}`] ?? slot.toLowerCase(),
    model,
    base,
    key,
  );
}

export function createServerProviderRegistry(): AiProvider[] {
  const providers = [configured('PRIMARY'), configured('BACKUP_1'), configured('BACKUP_2')]
    .filter((provider): provider is AiProvider => Boolean(provider));
  if (!providers.length) {
    throw new AiServerError('AUTH_CONFIGURATION_ERROR', false, 'The AI teacher is not configured yet.');
  }
  return providers;
}
