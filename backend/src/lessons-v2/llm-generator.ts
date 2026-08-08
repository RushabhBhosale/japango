import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { AiServerError } from '../ai/errors';
import {
  JAPANESE_GENERATION_MAX_ATTEMPTS,
  deterministicJapaneseNaturalnessIssues,
  japaneseGenerationInputSchema,
  japaneseQualityGate,
  type JapaneseGenerationReference,
  type JapaneseSentenceCritic,
} from '../ai/japanese-generation';
import { loadJapaneseGenerationReferences } from '../ai/japanese-generation-references';
import type { AiProvider } from '../ai/types';
import {
  lessonV2LlmGenerationInputSchema,
  lessonV2SourceReferenceSchema,
  type LessonV2DraftInput,
  type LessonV2Question,
  type StructuredJapaneseText,
} from './contracts';
import { highestSourceSimilarity } from './similarity';

type GenerationInput = z.infer<typeof lessonV2LlmGenerationInputSchema>;
type LessonV2SourceReference = z.infer<typeof lessonV2SourceReferenceSchema>;

const registerSchema = z.enum(['plain', 'polite', 'casual', 'honorific', 'humble']);
const assetKindSchema = z.enum(['introduction', 'dialogue_line', 'grammar_example', 'question']);

const lessonAssetPlanSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  kind: assetKindSchema,
  situation: z.string().min(1).max(500),
  speaker: z.string().min(1).max(200),
  listener: z.string().min(1).max(200).nullable(),
  communicativeIntent: z.string().min(1).max(500),
  targetGrammar: z.string().min(1).max(200),
  targetVocabulary: z.array(z.string().min(1).max(120)).max(8),
  rejectedVocabulary: z.array(z.object({
    japanese: z.string().min(1).max(120),
    reason: z.string().min(1).max(500),
  }).strict()).max(20),
  register: registerSchema,
  level: z.enum(['N5', 'N4']),
  questionType: z.enum(['grammar_cloze', 'word_usage', 'short_reading', 'app_practice']).nullable(),
}).strict();

export const lessonSemanticPlanSchema = z.object({
  compatible: z.boolean(),
  reason: z.string().min(1).max(600).nullable(),
  lessonSituation: z.string().min(1).max(800).nullable(),
  communicativeGoal: z.string().min(1).max(800).nullable(),
  assets: z.array(lessonAssetPlanSchema).min(0).max(30),
}).strict().superRefine((plan, context) => {
  if (plan.compatible && (!plan.lessonSituation || !plan.communicativeGoal || plan.assets.length < 6)) {
    context.addIssue({ code: 'custom', message: 'A compatible lesson requires a situation, goal, and at least six planned assets.' });
  }
  if (!plan.compatible && !plan.reason) {
    context.addIssue({ code: 'custom', path: ['reason'], message: 'An incompatible lesson plan requires a reason.' });
  }
  if (new Set(plan.assets.map(({ id }) => id)).size !== plan.assets.length) {
    context.addIssue({ code: 'custom', path: ['assets'], message: 'Lesson asset IDs must be unique.' });
  }
});

export type LessonSemanticPlan = z.infer<typeof lessonSemanticPlanSchema>;

const generatedLineSchema = z.object({
  assetId: z.string().min(1).max(160),
  speaker: z.string().min(1).max(120).optional(),
  japanese: z.string().min(1).max(1000),
  reading: z.string().min(1).max(1200),
  translation: z.string().min(1).max(1600),
  targetGrammarPreserved: z.boolean(),
}).strict();

const generatedQuestionSchema = z.object({
  assetId: z.string().min(1).max(160),
  type: z.enum(['grammar_cloze', 'word_usage', 'short_reading', 'app_practice']),
  testedSkill: z.string().min(1).max(600),
  instructionJapanese: z.string().min(1).max(600),
  passageJapanese: z.string().min(1).max(3000).nullable(),
  promptJapanese: z.string().min(1).max(1200),
  choicesJapanese: z.array(z.string().min(1).max(600)).length(4),
  correctChoiceIndex: z.number().int().min(0).max(3),
  correctExplanationEnglish: z.string().min(1).max(1600),
  distractorExplanationsEnglish: z.array(z.string().min(1).max(1000)).length(4),
  targetGrammarPreserved: z.boolean(),
}).strict().superRefine((question, context) => {
  if (new Set(question.choicesJapanese).size !== question.choicesJapanese.length) {
    context.addIssue({ code: 'custom', path: ['choicesJapanese'], message: 'Question choices must be unique.' });
  }
  if (question.type === 'short_reading' && !question.passageJapanese) {
    context.addIssue({ code: 'custom', path: ['passageJapanese'], message: 'A short reading question needs a passage.' });
  }
});

export const generatedLessonContentSchema = z.object({
  title: z.string().min(1).max(240),
  introduction: generatedLineSchema,
  dialogue: z.array(generatedLineSchema).min(2).max(8),
  grammarExamples: z.array(generatedLineSchema).min(2).max(8),
  questions: z.array(generatedQuestionSchema).min(2).max(8),
}).strict();

export type GeneratedLessonContent = z.infer<typeof generatedLessonContentSchema>;

const lessonCriticEvaluationSchema = z.object({
  assetId: z.string().min(1).max(160),
  grammar: z.number().int().min(0).max(100),
  naturalness: z.number().int().min(0).max(100),
  semanticPlausibility: z.number().int().min(0).max(100),
  collocation: z.number().int().min(0).max(100),
  levelAppropriate: z.number().int().min(0).max(100),
  accepted: z.boolean(),
  targetGrammarPreserved: z.boolean(),
  issues: z.array(z.string().min(1).max(500)).max(12),
}).strict();

export const lessonCriticResponseSchema = z.object({
  accepted: z.boolean(),
  evaluations: z.array(lessonCriticEvaluationSchema).min(1).max(30),
  lessonIssues: z.array(z.string().min(1).max(800)).max(20),
}).strict();

export type LessonCriticResponse = z.infer<typeof lessonCriticResponseSchema>;

export interface GeneratedLessonDraftResult {
  compatible: true;
  draft: LessonV2DraftInput;
  generationMetadata: {
    provider: string;
    model: string;
    attempts: number;
    plan: LessonSemanticPlan;
    quality: LessonCriticResponse;
    referenceIds: string[];
  };
}

export interface IncompatibleLessonDraftResult {
  compatible: false;
  reason: string;
}

export type LessonDraftGenerationResult = GeneratedLessonDraftResult | IncompatibleLessonDraftResult;

export const LESSON_SEMANTIC_PLANNING_PROMPT = `You are the semantic lesson planner for JapanGo. Return JSON only. Do not write any Japanese lesson sentences, dialogue, passages, questions, or choices yet.

Plan a coherent original JLPT N5/N4 lesson before wording it. The lesson must feel like a useful tutor-led experience, not a list of random examples.

Required order for every asset:
grammar target -> reference usage patterns -> realistic situation -> communicative intent -> compatible vocabulary -> later Japanese generation.

NATURALNESS IS MORE IMPORTANT THAN VOCABULARY COVERAGE.
Do not force every supplied word into the lesson. Record rejected vocabulary with a concrete compatibility reason. Reference OCR and corpus excerpts are usage/style guidance only; infer their situations and collocations, never copy their wording.

Plan exactly one introduction asset, 2-4 connected dialogue lines, 2-4 grammar examples in varied realistic contexts, and the requested number of question assets. Questions must test meaning or grammar through plausible contexts and plausible distractors. Prefer school, work, family, friends, restaurants, shopping, trains, travel, weather, health, appointments, hobbies, invitations, advice, reasons, experiences, lost items, directions, and routines.

Return:
{"compatible":true,"reason":null,"lessonSituation":"...","communicativeGoal":"...","assets":[{"id":"lowercase-kebab-id","kind":"introduction|dialogue_line|grammar_example|question","situation":"...","speaker":"...","listener":null,"communicativeIntent":"...","targetGrammar":"...","targetVocabulary":["..."],"rejectedVocabulary":[{"japanese":"...","reason":"..."}],"register":"plain|polite|casual|honorific|humble","level":"N5|N4","questionType":null}]}
or {"compatible":false,"reason":"...","lessonSituation":null,"communicativeGoal":null,"assets":[]}.`;

export const LESSON_CONTENT_GENERATION_PROMPT = `You author a complete original JapanGo lesson from an approved semantic plan. Return JSON only.

Generate Japanese ideas directly; never draft English and translate it literally. Preserve every asset's target grammar. Use the plan's compatible vocabulary only, and omit rejected vocabulary. Prefer common Japanese collocations, natural particles, concise phrasing, and realistic N5/N4 situations. Match register to speaker and listener.

NATURALNESS IS MORE IMPORTANT THAN VOCABULARY COVERAGE.
Never mechanically combine a grammar template with random vocabulary. Avoid bizarre subjects or objects, illogical comparisons and causes, redundant adjacent lines, stiff translated prose, and unnecessary 〜ということ, 〜という, or することができます. Translations must be natural English that expresses the actual Japanese meaning.

Dialogue lines must respond to one another and advance the shared situation. Grammar examples must be complete plausible thoughts, not dictionary fragments. Questions and all choices must be original. Distractors should be plausible enough to test the learner; they may be grammatically wrong when that is the skill being tested, but never meaningless random Japanese. Exactly one answer must be correct, and explanations must state why each option succeeds or fails.

References are private grounding only. Do not copy a reference sentence, dialogue, passage, distinctive names, or answer choices.

Return exactly:
{"title":"...","introduction":{"assetId":"...","japanese":"...","reading":"...","translation":"...","targetGrammarPreserved":true},"dialogue":[{"assetId":"...","speaker":"...","japanese":"...","reading":"...","translation":"...","targetGrammarPreserved":true}],"grammarExamples":[{"assetId":"...","japanese":"...","reading":"...","translation":"...","targetGrammarPreserved":true}],"questions":[{"assetId":"...","type":"grammar_cloze|word_usage|short_reading|app_practice","testedSkill":"...","instructionJapanese":"...","passageJapanese":null,"promptJapanese":"...","choicesJapanese":["...","...","...","..."],"correctChoiceIndex":0,"correctExplanationEnglish":"...","distractorExplanationsEnglish":["...","...","...","..."],"targetGrammarPreserved":true}]}.`;

export const LESSON_CONTENT_CRITIC_PROMPT = `You are the independent native-level Japanese lesson critic for JapanGo. You did not author this draft. Return JSON only.

Evaluate every introduction, dialogue line, grammar example, and complete question (including passage, prompt, choices, answer, and explanations) against its semantic plan. Score grammar, naturalness, semantic plausibility, collocation, and JLPT-level appropriateness from 0-100. Check that dialogue is coherent, choices are plausible, exactly one answer works, translations match naturally, target grammar survives, and no reference text is copied.

Intentional distractor errors are allowed only when they test the stated skill. Meaningless or semantically random distractors are never acceptable.

Minimum scores: grammar 95, naturalness 85, semanticPlausibility 90, collocation 85, levelAppropriate 85. An asset fails if any score is below threshold, target grammar is missing, the situation is implausible, a collocation is translated from English, a deterministic preflight issue exists, or reference wording was copied. The whole lesson is accepted only if every asset passes and the dialogue/lesson is coherent without repetition.

Return:
{"accepted":false,"evaluations":[{"assetId":"...","grammar":0,"naturalness":0,"semanticPlausibility":0,"collocation":0,"levelAppropriate":0,"accepted":false,"targetGrammarPreserved":false,"issues":["..."]}],"lessonIssues":["..."]}.`;

function extractJson(value: string): unknown {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/u);
    if (!match) throw new AiServerError('INVALID_RESPONSE', true, 'The AI lesson response was not valid JSON.');
    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      throw new AiServerError('INVALID_RESPONSE', true, 'The AI lesson response was not valid JSON.');
    }
  }
}

function allGeneratedAssets(content: GeneratedLessonContent): Array<{ assetId: string; japanese: string }> {
  return [
    { assetId: content.introduction.assetId, japanese: content.introduction.japanese },
    ...content.dialogue.map((line) => ({ assetId: line.assetId, japanese: line.japanese })),
    ...content.grammarExamples.map((line) => ({ assetId: line.assetId, japanese: line.japanese })),
    ...content.questions.map((question) => ({
      assetId: question.assetId,
      japanese: [
        question.instructionJapanese,
        question.passageJapanese ?? '',
        question.promptJapanese,
        ...question.choicesJapanese,
      ].filter(Boolean).join('\n'),
    })),
  ];
}

function criticAsSentenceCritic(evaluation: LessonCriticResponse['evaluations'][number]): JapaneseSentenceCritic {
  return { ...evaluation, correctedSentence: null };
}

export function lessonQualityGate(
  plan: LessonSemanticPlan,
  content: GeneratedLessonContent,
  critic: LessonCriticResponse,
): { accepted: boolean; issues: string[] } {
  const planIds = new Set(plan.assets.map(({ id }) => id));
  const generatedAssets = allGeneratedAssets(content);
  const generatedIds = new Set(generatedAssets.map(({ assetId }) => assetId));
  const evaluationById = new Map(critic.evaluations.map((evaluation) => [evaluation.assetId, evaluation]));
  const issues = [...critic.lessonIssues];

  for (const id of planIds) {
    if (!generatedIds.has(id)) issues.push(`Planned asset ${id} is missing from the generated lesson.`);
  }
  for (const asset of generatedAssets) {
    if (!planIds.has(asset.assetId)) issues.push(`Generated asset ${asset.assetId} was not approved in the semantic plan.`);
    const evaluation = evaluationById.get(asset.assetId);
    if (!evaluation) {
      issues.push(`Generated asset ${asset.assetId} has no independent critic evaluation.`);
      continue;
    }
    const gate = japaneseQualityGate(
      criticAsSentenceCritic(evaluation),
      deterministicJapaneseNaturalnessIssues(asset.japanese),
    );
    issues.push(...gate.issues.map((issue) => `${asset.assetId}: ${issue}`));
  }
  return { accepted: critic.accepted && issues.length === 0, issues: [...new Set(issues)] };
}

function draftText(raw: string): StructuredJapaneseText {
  return {
    raw,
    tokens: [{ id: `draft-${randomUUID()}`, kind: 'plain', surface: raw, kanjiIds: [], status: 'needs_review' }],
    status: 'needs_review',
  };
}

function sourceReferences(
  references: readonly JapaneseGenerationReference[],
  input: GenerationInput,
): LessonV2SourceReference[] {
  const grounded = references.map((reference, index) => ({
    id: `generation-reference-${index + 1}-${randomUUID()}`,
    sourceChunkId: reference.referenceId,
    sourcePath: reference.source === 'ocr' ? `private-ocr://${reference.referenceId}` : `curated-corpus://${reference.referenceId}`,
    sourceRole: 'lesson_grounding' as const,
    note: 'Private usage and collocation reference only; generated wording must remain original.',
  }));
  if (grounded.length > 0) return grounded;
  return input.targetGrammar.map((grammar, index) => ({
    id: `curriculum-reference-${index + 1}-${randomUUID()}`,
    sourceChunkId: grammar.id,
    sourcePath: `curriculum://${grammar.id}`,
    sourceRole: 'lesson_grounding' as const,
    note: 'Canonical curriculum grammar target; no reference sentence was available.',
  }));
}

function questionSection(type: GeneratedLessonContent['questions'][number]['type']): LessonV2Question['section'] {
  if (type === 'word_usage') return 'vocabulary_kanji';
  if (type === 'short_reading') return 'reading';
  return 'grammar';
}

function questionDifficulty(level: 'N5' | 'N4', type: GeneratedLessonContent['questions'][number]['type']): number {
  return Math.min(5, (level === 'N5' ? 2 : 3) + (type === 'short_reading' ? 1 : 0));
}

function toQuestion(
  generated: GeneratedLessonContent['questions'][number],
  plan: LessonSemanticPlan,
  input: GenerationInput,
  references: LessonV2SourceReference[],
  sourceTexts: string[],
): LessonV2Question {
  const questionPlan = plan.assets.find(({ id }) => id === generated.assetId);
  const targetGrammar = input.targetGrammar.find(({ pattern }) => pattern === questionPlan?.targetGrammar)
    ?? input.targetGrammar[0]!;
  const vocabularyIds = input.vocabulary.flatMap((vocabulary) =>
    vocabulary.id && questionPlan?.targetVocabulary.includes(vocabulary.japanese) ? [vocabulary.id] : []);
  const questionId = `generated-${generated.assetId}-${randomUUID()}`;
  const choices = generated.choicesJapanese.map((choice, index) => ({
    id: `${questionId}-choice-${index + 1}`,
    label: { japanese: draftText(choice) },
    isCorrect: index === generated.correctChoiceIndex,
  }));
  const candidate = [
    generated.instructionJapanese,
    generated.passageJapanese ?? '',
    generated.promptJapanese,
    ...generated.choicesJapanese,
  ].join('\n');
  return {
    id: questionId,
    level: input.level,
    type: generated.type,
    section: questionSection(generated.type),
    sourcePatternIds: [targetGrammar.id],
    testedSkill: generated.testedSkill,
    objectiveId: `objective-${generated.assetId}`,
    grammarIds: [targetGrammar.id],
    vocabularyIds,
    kanjiIds: [],
    instruction: draftText(generated.instructionJapanese),
    passage: generated.passageJapanese ? draftText(generated.passageJapanese) : undefined,
    prompt: draftText(generated.promptJapanese),
    choices,
    explanation: {
      correct: { english: generated.correctExplanationEnglish },
      distractors: generated.choicesJapanese.flatMap((_, index) => index === generated.correctChoiceIndex ? [] : [{
        choiceId: choices[index]!.id,
        explanation: { english: generated.distractorExplanationsEnglish[index]! },
      }]),
      readingEvidenceTokenIds: [],
      vocabularyIds,
      kanjiIds: [],
    },
    difficulty: questionDifficulty(input.level, generated.type),
    estimatedSeconds: generated.type === 'short_reading' ? 120 : 50,
    validationStatus: 'draft',
    sourceReferences: references.map((reference) => ({ ...reference, sourceRole: 'question_pattern' as const })),
    similarityScore: highestSourceSimilarity(candidate, sourceTexts),
  };
}

function generatedSlug(input: GenerationInput): string {
  return input.slug ?? `generated-${randomUUID().slice(0, 12)}`;
}

export function toLessonDraftInput(
  content: GeneratedLessonContent,
  plan: LessonSemanticPlan,
  input: GenerationInput,
  rawReferences: JapaneseGenerationReference[],
): LessonV2DraftInput {
  const references = sourceReferences(rawReferences, input);
  const sourceTexts = rawReferences.map(({ japanese }) => japanese);
  const questions = content.questions.map((question) => toQuestion(question, plan, input, references, sourceTexts));
  return {
    slug: generatedSlug(input),
    level: input.level,
    title: content.title,
    objectives: input.objectives,
    estimatedMinutes: input.estimatedMinutes,
    sections: [
      {
        id: `section-introduction-${randomUUID()}`,
        kind: 'introduction',
        title: 'Lesson context',
        order: 1,
        estimatedMinutes: 2,
        content: [{ japanese: draftText(content.introduction.japanese), english: content.introduction.translation }],
        questions: [], vocabularyIds: [], grammarIds: input.targetGrammar.map(({ id }) => id), kanjiIds: [],
      },
      {
        id: `section-dialogue-${randomUUID()}`,
        kind: 'dialogue',
        title: 'Connected dialogue',
        order: 2,
        estimatedMinutes: Math.max(2, Math.round(input.estimatedMinutes * 0.25)),
        content: content.dialogue.map((line) => ({ japanese: draftText(`${line.speaker ?? '話者'}：${line.japanese}`), english: line.translation })),
        questions: [], vocabularyIds: [], grammarIds: input.targetGrammar.map(({ id }) => id), kanjiIds: [],
      },
      {
        id: `section-grammar-${randomUUID()}`,
        kind: 'grammar',
        title: 'Natural usage',
        order: 3,
        estimatedMinutes: Math.max(2, Math.round(input.estimatedMinutes * 0.25)),
        content: content.grammarExamples.map((line) => ({ japanese: draftText(line.japanese), english: line.translation })),
        questions: [], vocabularyIds: [], grammarIds: input.targetGrammar.map(({ id }) => id), kanjiIds: [],
      },
      {
        id: `section-quiz-${randomUUID()}`,
        kind: 'quiz',
        title: 'Context-based practice',
        order: 4,
        estimatedMinutes: Math.max(3, input.estimatedMinutes - 2 - Math.max(2, Math.round(input.estimatedMinutes * 0.5))),
        content: [], questions, vocabularyIds: [], grammarIds: input.targetGrammar.map(({ id }) => id), kanjiIds: [],
      },
    ],
    sourceReferences: references,
  };
}

function referenceInput(input: GenerationInput, references: JapaneseGenerationReference[]): unknown {
  return {
    level: input.level,
    title: input.title,
    objectives: input.objectives,
    targetGrammar: input.targetGrammar,
    suppliedVocabulary: input.vocabulary,
    questionCount: input.questionCount,
    sourceQuery: input.sourceQuery,
    references,
  };
}

function allAssetPreflight(content: GeneratedLessonContent): Record<string, string[]> {
  return Object.fromEntries(allGeneratedAssets(content).map((asset) => [
    asset.assetId,
    deterministicJapaneseNaturalnessIssues(asset.japanese),
  ]));
}

export class LessonsV2LlmGenerator {
  constructor(
    private readonly providers: AiProvider[],
    private readonly referenceLoader: typeof loadJapaneseGenerationReferences = loadJapaneseGenerationReferences,
  ) {}

  async generate(rawInput: unknown, signal: AbortSignal): Promise<LessonDraftGenerationResult> {
    const input = lessonV2LlmGenerationInputSchema.parse(rawInput);
    const references = await this.references(input);
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        return await this.generateWithProvider(provider, input, references, signal);
      } catch (error) {
        lastError = error;
        if (error instanceof AiServerError && !error.retryable) throw error;
      }
    }
    if (lastError instanceof AiServerError) throw lastError;
    throw new AiServerError('ALL_PROVIDERS_FAILED', true, 'The lesson generation providers are temporarily unavailable.');
  }

  private async references(input: GenerationInput): Promise<JapaneseGenerationReference[]> {
    const groups = await Promise.all(input.targetGrammar.map(async (grammar) => {
      const referenceRequest = japaneseGenerationInputSchema.parse({
        level: input.level,
        targetGrammar: grammar,
        vocabulary: input.vocabulary,
        preferredRegister: 'polite',
        requestedContext: input.sourceQuery,
        references: [],
      });
      return this.referenceLoader(referenceRequest, 5);
    }));
    const unique = new Map(groups.flat().map((reference) => [reference.referenceId, reference]));
    return [...unique.values()].slice(0, 8);
  }

  private async generateWithProvider(
    provider: AiProvider,
    input: GenerationInput,
    references: JapaneseGenerationReference[],
    signal: AbortSignal,
  ): Promise<LessonDraftGenerationResult> {
    const plan = lessonSemanticPlanSchema.parse(extractJson(await this.complete(
      provider,
      LESSON_SEMANTIC_PLANNING_PROMPT,
      JSON.stringify(referenceInput(input, references)),
      signal,
      5000,
    )));
    if (!plan.compatible) return { compatible: false, reason: plan.reason ?? 'The requested targets are incompatible.' };

    let previous: { content: GeneratedLessonContent; issues: string[] } | undefined;
    for (let attempt = 1; attempt <= JAPANESE_GENERATION_MAX_ATTEMPTS; attempt += 1) {
      const content = generatedLessonContentSchema.parse(extractJson(await this.complete(
        provider,
        LESSON_CONTENT_GENERATION_PROMPT,
        JSON.stringify({
          request: referenceInput(input, references),
          semanticPlan: plan,
          previousDraft: previous?.content ?? null,
          mandatoryRevisionIssues: previous?.issues ?? [],
        }),
        signal,
        8000,
      )));
      const critic = lessonCriticResponseSchema.parse(extractJson(await this.complete(
        provider,
        LESSON_CONTENT_CRITIC_PROMPT,
        JSON.stringify({
          request: referenceInput(input, references),
          semanticPlan: plan,
          candidate: content,
          deterministicPreflightIssues: allAssetPreflight(content),
        }),
        signal,
        6000,
      )));
      const gate = lessonQualityGate(plan, content, critic);
      if (gate.accepted) {
        return {
          compatible: true,
          draft: toLessonDraftInput(content, plan, input, references),
          generationMetadata: {
            provider: provider.id,
            model: provider.model,
            attempts: attempt,
            plan,
            quality: critic,
            referenceIds: references.map(({ referenceId }) => referenceId),
          },
        };
      }
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[lessons-v2-generation] Draft rejected', { attempt, issues: gate.issues });
      }
      previous = { content, issues: gate.issues };
    }
    throw new AiServerError('INVALID_RESPONSE', true, 'The generated lesson did not pass JapanGo quality review.');
  }

  private async complete(
    provider: AiProvider,
    system: string,
    user: string,
    signal: AbortSignal,
    maxTokens: number,
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutMs = Math.max(10_000, Number(process.env.AI_LESSON_TIMEOUT_MS ?? 90_000));
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    try {
      return await provider.complete({ system, user, signal: controller.signal, maxTokens, temperature: 0.25 });
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  }
}
