import type { AiProvider } from '../ai/types';
import {
  generatedDailyReadingSchema,
  type DailyReadingGenerationRequest,
  type GeneratedDailyReading,
} from './schemas';

const generationTimeoutMs = Math.max(10_000, Number(process.env.AI_LESSON_TIMEOUT_MS ?? 90_000));

export class DailyReadingGenerationError extends Error {
  constructor(readonly validationErrors: string[], message = 'A valid Daily Reading could not be generated.') {
    super(message);
    this.name = 'DailyReadingGenerationError';
  }
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/u);
    if (!match) throw new DailyReadingGenerationError(['The response did not contain a JSON object.']);
    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      throw new DailyReadingGenerationError(['The response JSON could not be parsed.']);
    }
  }
}

export function japanesePassageLength(content: string): number {
  return Array.from(content.replace(/\s/gu, '')).length;
}

export function validateGeneratedDailyReading(
  value: unknown,
  request: DailyReadingGenerationRequest,
): { reading?: GeneratedDailyReading; errors: string[] } {
  const parsed = generatedDailyReadingSchema.safeParse(value);
  if (!parsed.success) {
    return { errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'response'}: ${issue.message}`) };
  }
  const reading = parsed.data;
  const errors: string[] = [];
  if (reading.date !== request.date) errors.push(`date must be ${request.date}`);
  if (reading.level !== request.level) errors.push(`level must be ${request.level}`);
  const length = japanesePassageLength(reading.content);
  const [minimum, maximum] = request.level === 'N5' ? [100, 200] : [180, 350];
  if (length < minimum || length > maximum) errors.push(`content length is ${length}; expected ${minimum}-${maximum} characters`);
  if (/[A-Za-z]/u.test(reading.content)) errors.push('content must not contain English or romaji');
  if (!/[\u3040-\u30ff\u3400-\u9fff]/u.test(reading.title)) errors.push('title must contain Japanese');

  const ids = new Set<string>();
  for (const question of reading.questions) {
    if (ids.has(question.id)) errors.push(`duplicate question id: ${question.id}`);
    ids.add(question.id);
    if (new Set(question.options).size !== question.options.length) errors.push(`${question.id} has duplicate options`);
    if (/[A-Za-z]/u.test(question.question) || question.options.some((option) => /[A-Za-z]/u.test(option))) {
      errors.push(`${question.id} must keep the exam question and options in Japanese`);
    }
  }

  const contextVocabulary = [
    ...request.context.knownVocabulary,
    ...request.context.weakVocabulary,
    ...request.context.recentVocabulary,
    ...request.context.newVocabularyCandidates,
  ];
  const vocabularyById = new Map(contextVocabulary.map((item) => [item.id, item]));
  const newIds = new Set(request.context.newVocabularyCandidates.map((item) => item.id));
  const weakOrRecentIds = new Set([
    ...request.context.weakVocabulary.map((item) => item.id),
    ...request.context.recentVocabulary.map((item) => item.id),
  ]);
  for (const vocabulary of reading.targetVocabulary) {
    const canonical = vocabularyById.get(vocabulary.sourceItemId);
    if (!canonical) {
      errors.push(`target vocabulary ${vocabulary.sourceItemId} is not in the supplied curriculum context`);
      continue;
    }
    if (canonical.japanese !== vocabulary.word) errors.push(`${vocabulary.sourceItemId} has an incorrect written form`);
    if (canonical.reading && canonical.reading !== vocabulary.reading) errors.push(`${vocabulary.sourceItemId} has an incorrect reading`);
    if (vocabulary.isNew !== newIds.has(vocabulary.sourceItemId)) errors.push(`${vocabulary.sourceItemId} has an incorrect isNew value`);
  }
  const targetIds = new Set(reading.targetVocabulary.map((item) => item.sourceItemId));
  const reusedCount = [...weakOrRecentIds].filter((id) => targetIds.has(id)).length;
  const minimumReuse = Math.min(2, weakOrRecentIds.size);
  if (reusedCount < minimumReuse || reusedCount > 4) errors.push(`reuse ${minimumReuse}-4 weak/recent vocabulary items; received ${reusedCount}`);
  if (reading.targetVocabulary.filter((item) => item.isNew).length > 5) errors.push('introduce no more than five new words');
  for (const question of reading.questions) {
    for (const id of question.targetVocabularyIds) {
      if (!targetIds.has(id)) errors.push(`${question.id} references vocabulary outside targetVocabulary: ${id}`);
    }
  }

  const grammarById = new Map(request.context.recentGrammar.map((item) => [item.id, item]));
  if (grammarById.size && reading.targetGrammar.length < 1) errors.push('reuse at least one recently learned grammar point');
  for (const grammar of reading.targetGrammar) {
    const canonical = grammarById.get(grammar.sourceItemId);
    if (!canonical) errors.push(`target grammar ${grammar.sourceItemId} is not in the supplied curriculum context`);
    else if (canonical.japanese !== grammar.pattern) errors.push(`${grammar.sourceItemId} has an incorrect grammar pattern`);
  }
  return errors.length ? { errors } : { reading, errors: [] };
}

export function dailyReadingSystemPrompt(level: 'N5' | 'N4'): string {
  return `You create one polished Daily Reading for JapanGo at JLPT ${level}. Return JSON only.

Quality rules:
- Write natural, grammatically correct Japanese found in real conversation, books, everyday writing, or JLPT-style material.
- Keep difficulty correct for JLPT ${level}; 80-90% must be known or level-appropriate.
- Never stuff random words into unnatural textbook sentences.
- Reuse 2-4 supplied weak/recent vocabulary items and 1-2 supplied recent grammar points where available.
- Introduce at most 3-5 words, exclusively from newVocabularyCandidates.
- Never invent or alter curriculum IDs, readings, written forms, or grammar patterns.
- Main content contains Japanese only: no English translations or romaji.
- Avoid vocabulary far above ${level} unless it is an intentionally supplied new candidate.
- Create 3-5 distinct Japanese comprehension questions answerable only from the passage: basic retrieval, context/meaning, and one reasonable inference question.
- Every question has exactly four unique options and exactly one valid answer. correctAnswer is its zero-based option index.
- Do not duplicate questions. Do not use English in questions or options; English is allowed only in explanations.
- Do not repeat recentTopics. Rotate naturally among the allowed type values.

Return exactly: {"date":"YYYY-MM-DD","level":"${level}","type":"slice-of-life|conversation|diary|travel|mystery|school-work|fictional-news|culture|story-episode","title":"Japanese title","content":"Japanese passage","targetVocabulary":[{"sourceItemId":"authoritative id","word":"...","reading":"...","meaning":"...","isNew":false}],"targetGrammar":[{"sourceItemId":"authoritative id","pattern":"...","meaning":"..."}],"questions":[{"id":"unique id","question":"Japanese question","options":["...","...","...","..."],"correctAnswer":0,"explanation":"short explanation","targetVocabularyIds":["id"]}],"seriesId":null,"episodeNumber":null,"previousEpisodeId":null}.`;
}

function dailyReadingUserPrompt(request: DailyReadingGenerationRequest, errors: string[]): string {
  const length = request.level === 'N5' ? '100-200' : '180-350';
  return JSON.stringify({
    task: `Create the Daily Reading for ${request.date}. Passage length must be ${length} Japanese characters excluding whitespace.`,
    date: request.date,
    level: request.level,
    learningContext: request.context,
    validationErrorsFromPreviousAttempt: errors,
  });
}

async function completeWithProviders(
  providers: AiProvider[],
  system: string,
  user: string,
  signal: AbortSignal,
): Promise<string> {
  let lastError: unknown;
  for (const provider of providers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), generationTimeoutMs);
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    try {
      return await provider.complete({ system, user, signal: controller.signal, maxTokens: 2400, temperature: 0.45 });
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All AI providers failed.');
}

export async function generateDailyReading(
  request: DailyReadingGenerationRequest,
  providers: AiProvider[],
  signal: AbortSignal,
): Promise<GeneratedDailyReading> {
  let validationErrors: string[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let value: unknown;
    try {
      const raw = await completeWithProviders(
        providers,
        dailyReadingSystemPrompt(request.level),
        dailyReadingUserPrompt(request, validationErrors),
        signal,
      );
      value = extractJson(raw);
    } catch (error) {
      validationErrors = error instanceof DailyReadingGenerationError
        ? error.validationErrors
        : [error instanceof Error ? error.message : 'The provider request failed.'];
      if (attempt === 1) throw error;
      continue;
    }
    const validated = validateGeneratedDailyReading(value, request);
    if (validated.reading) return validated.reading;
    validationErrors = validated.errors;
  }
  throw new DailyReadingGenerationError(validationErrors);
}
