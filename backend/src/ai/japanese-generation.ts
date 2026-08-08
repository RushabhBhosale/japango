import { z } from 'zod';

import { AiServerError } from './errors';
import type { AiProvider } from './types';

export const JAPANESE_QUALITY_THRESHOLDS = {
  grammar: 95,
  naturalness: 85,
  semanticPlausibility: 90,
  collocation: 85,
  levelAppropriate: 85,
} as const;

export const JAPANESE_GENERATION_MAX_ATTEMPTS = 3;

const levelSchema = z.enum(['N5', 'N4']);
const registerSchema = z.enum(['plain', 'polite', 'casual', 'honorific', 'humble']);

export const japaneseQualityScoresSchema = z.object({
  grammar: z.number().int().min(0).max(100),
  naturalness: z.number().int().min(0).max(100),
  semanticPlausibility: z.number().int().min(0).max(100),
  collocation: z.number().int().min(0).max(100),
  levelAppropriate: z.number().int().min(0).max(100),
}).strict();

export type JapaneseQualityScores = z.infer<typeof japaneseQualityScoresSchema>;

export const japaneseGenerationReferenceSchema = z.object({
  source: z.enum(['ocr', 'corpus']),
  referenceId: z.string().min(1).max(200),
  japanese: z.string().min(1).max(1200),
  context: z.string().min(1).max(500).optional(),
}).strict();

export type JapaneseGenerationReference = z.infer<typeof japaneseGenerationReferenceSchema>;

export const japaneseGenerationInputSchema = z.object({
  level: levelSchema,
  targetGrammar: z.object({
    id: z.string().min(1).max(160).optional(),
    pattern: z.string().min(1).max(200),
    meaning: z.string().min(1).max(500),
  }).strict(),
  vocabulary: z.array(z.object({
    id: z.string().min(1).max(160).optional(),
    japanese: z.string().min(1).max(120),
    reading: z.string().min(1).max(160).optional(),
    meaning: z.string().min(1).max(300),
  }).strict()).max(12).default([]),
  preferredRegister: registerSchema.default('polite'),
  requestedContext: z.string().min(1).max(500).optional(),
  references: z.array(japaneseGenerationReferenceSchema).max(8).default([]),
}).strict();

export type JapaneseGenerationInput = z.infer<typeof japaneseGenerationInputSchema>;

const compatibleSemanticPlanSchema = z.object({
  compatible: z.literal(true),
  reason: z.null(),
  situation: z.string().min(1).max(500),
  speaker: z.string().min(1).max(200),
  listener: z.string().min(1).max(200).nullable(),
  communicativeIntent: z.string().min(1).max(500),
  targetGrammar: z.string().min(1).max(200),
  targetVocabulary: z.array(z.string().min(1).max(120)).max(8),
  rejectedVocabulary: z.array(z.object({
    japanese: z.string().min(1).max(120),
    reason: z.string().min(1).max(500),
  }).strict()).max(12),
  register: registerSchema,
  level: levelSchema,
}).strict();

const incompatibleSemanticPlanSchema = z.object({
  compatible: z.literal(false),
  reason: z.string().min(1).max(500),
  situation: z.null(),
  speaker: z.null(),
  listener: z.null(),
  communicativeIntent: z.null(),
  targetGrammar: z.string().min(1).max(200),
  targetVocabulary: z.array(z.never()).max(0),
  rejectedVocabulary: z.array(z.object({
    japanese: z.string().min(1).max(120),
    reason: z.string().min(1).max(500),
  }).strict()).max(12),
  register: registerSchema,
  level: levelSchema,
}).strict();

export const japaneseSemanticPlanSchema = z.discriminatedUnion('compatible', [
  compatibleSemanticPlanSchema,
  incompatibleSemanticPlanSchema,
]);

export type JapaneseSemanticPlan = z.infer<typeof japaneseSemanticPlanSchema>;

const generatedSentenceDraftSchema = z.object({
  japanese: z.string().min(1).max(500),
  reading: z.string().min(1).max(600),
  translation: z.string().min(1).max(800),
  targetGrammarPreserved: z.boolean(),
}).strict();

export const japaneseSentenceCriticSchema = z.object({
  grammar: z.number().int().min(0).max(100),
  naturalness: z.number().int().min(0).max(100),
  semanticPlausibility: z.number().int().min(0).max(100),
  collocation: z.number().int().min(0).max(100),
  levelAppropriate: z.number().int().min(0).max(100),
  accepted: z.boolean(),
  targetGrammarPreserved: z.boolean(),
  issues: z.array(z.string().min(1).max(500)).max(12),
  correctedSentence: z.string().min(1).max(500).nullable(),
}).strict();

export type JapaneseSentenceCritic = z.infer<typeof japaneseSentenceCriticSchema>;

export interface JapaneseSentenceGenerationMetadata {
  situation: string;
  speaker: string;
  listener: string | null;
  communicativeIntent: string;
  targetGrammar: string[];
  targetVocabulary: string[];
  rejectedVocabulary: Array<{ japanese: string; reason: string }>;
  register: z.infer<typeof registerSchema>;
  level: z.infer<typeof levelSchema>;
  quality: JapaneseQualityScores;
  attempts: number;
  referenceIds: string[];
}

export type JapaneseSentenceGenerationResult =
  | { compatible: false; reason: string; rejectedVocabulary: Array<{ japanese: string; reason: string }> }
  | {
    compatible: true;
    japanese: string;
    reading: string;
    translation: string;
    metadata: JapaneseSentenceGenerationMetadata;
  };

export interface JapaneseGenerationRejectionLog {
  attempt: number;
  sentence: string;
  issues: string[];
  scores: JapaneseQualityScores;
}

export type JapaneseGenerationLogger = (event: JapaneseGenerationRejectionLog) => void;

export const JAPANESE_SEMANTIC_PLANNING_PROMPT = `You plan original Japanese learning content for JapanGo.

Return JSON only. Do not write the Japanese sentence yet. First decide the real-world meaning that a native speaker would plausibly communicate.

Required order:
1. Understand the target grammar and its communicative function.
2. Use reference examples only to infer common situations, register, and collocations. Never copy them.
3. Choose a realistic situation, speaker, listener if relevant, and communicative intent.
4. Select only vocabulary that naturally serves that intent.
5. Reject supplied vocabulary that would have to be forced into the grammar.

NATURALNESS IS MORE IMPORTANT THAN VOCABULARY COVERAGE.
Do not invent an English sentence to translate later. Do not plan around English collocations.
If no supplied vocabulary fits, it is acceptable to reject all supplied vocabulary and use simple level-appropriate words.
Return compatible=false only when the grammar target itself cannot be used naturally under the requested constraints.

Return exactly:
{"compatible":true,"reason":null,"situation":"...","speaker":"...","listener":null,"communicativeIntent":"...","targetGrammar":"...","targetVocabulary":["..."],"rejectedVocabulary":[{"japanese":"...","reason":"..."}],"register":"plain|polite|casual|honorific|humble","level":"N5|N4"}
or:
{"compatible":false,"reason":"...","situation":null,"speaker":null,"listener":null,"communicativeIntent":null,"targetGrammar":"...","targetVocabulary":[],"rejectedVocabulary":[{"japanese":"...","reason":"..."}],"register":"plain|polite|casual|honorific|humble","level":"N5|N4"}`;

export const JAPANESE_SENTENCE_GENERATION_PROMPT = `You write original Japanese learning content for JapanGo from an approved semantic plan.

Generate the Japanese idea directly. Do not create an English sentence first and translate it. Do not preserve English collocations that sound unnatural in Japanese. Do not use a noun with a verb merely because their English equivalents combine.

NATURALNESS IS MORE IMPORTANT THAN VOCABULARY COVERAGE.
Every sentence must communicate a complete, plausible thought in the planned real-world situation.
Preserve the target grammar. Never improve a sentence by removing the learning objective.
Use only compatible target vocabulary from the plan; do not reintroduce rejected vocabulary.
Prefer established Japanese collocations, natural particles, and the simplest phrasing that demonstrates the target.
Match the planned register. Prefer ordinary polite beginner-textbook language unless the plan requires another register.
Keep N5/N4 content concise and level appropriate.

Reject and rewrite before responding if the sentence contains:
- a subject, object, verb, adjective, comparison, cause, or particle combination that is pragmatically strange;
- a literal English collocation;
- vocabulary forced into the grammar;
- meaningless or random Japanese;
- redundant adjacent statements;
- unnecessary stiffness or avoidable overuse of 〜ということ, 〜という, or することができます;
- a translation that does not naturally express the actual Japanese meaning.

References are private style and usage guidance only. Never copy a reference sentence or preserve its distinctive wording.

Return JSON only:
{"japanese":"...","reading":"kana reading with matching punctuation","translation":"natural English meaning","targetGrammarPreserved":true}`;

export const JAPANESE_SENTENCE_CRITIC_PROMPT = `You are the independent Japanese quality critic for JapanGo. You did not author the candidate. Evaluate it strictly as native-like JLPT N5/N4 learning content.

Check the candidate against its semantic plan and target grammar. Inspect:
- grammar and particle choice;
- natural Japanese phrasing and register;
- semantic plausibility and causal logic;
- noun+verb, adjective+noun, comparison, and particle collocations;
- JLPT level and unnecessary complexity;
- whether the English translation naturally expresses the Japanese meaning;
- whether the target grammar remains clearly demonstrated;
- whether any reference wording appears to have been copied.

Ask: Would a real person plausibly say this without bizarre hidden context? Is it communicating something, or merely displaying a grammar template? Do the subject and object naturally participate in the action? Does every comparison make sense?

Minimum scores:
- grammar >= 95
- naturalness >= 85
- semanticPlausibility >= 90
- collocation >= 85
- levelAppropriate >= 85

accepted must be false if any threshold fails, target grammar is missing, the translation changes the meaning, a deterministic preflight issue is supplied, or the sentence copies a reference. A correctedSentence is advice only; it must preserve the target grammar and will be regenerated and rechecked before use.

Return JSON only:
{"grammar":0,"naturalness":0,"semanticPlausibility":0,"collocation":0,"levelAppropriate":0,"accepted":false,"targetGrammarPreserved":false,"issues":["..."],"correctedSentence":null}`;

const deterministicRules: ReadonlyArray<{ pattern: RegExp; issue: string }> = [
  { pattern: /計画を救/u, issue: 'Unnatural collocation: use 計画がうまくいく or a context-specific recovery expression instead of 計画を救う.' },
  { pattern: /水みたいに冷たい/u, issue: 'Semantically weak comparison: water is not inherently cold enough to motivate this comparison.' },
  { pattern: /旅行には[^。]*(?:とか)[^。]*(?:とか)へ行/u, issue: 'Unnatural travel framing and particle sequence with 旅行には…とか…とかへ行く.' },
  { pattern: /仕事をし終わるまで[^。]*電話に出/u, issue: 'Forced aspect/collocation: 仕事が終わるまで is the natural expression in this situation.' },
  { pattern: /おはようを(?:見|食べ|飲|聞)/u, issue: 'Semantically impossible object/predicate combination involving おはよう.' },
  { pattern: /春だけ咲くという花/u, issue: 'Unnecessary という makes the flower description stiff and unnatural.' },
  { pattern: /一人で行くということに不安/u, issue: 'Unnecessary ということ nominalization makes this ordinary statement stiff.' },
  { pattern: /薬は冷たい所に(?:置く|保管する)/u, issue: 'Medication storage normally calls for 涼しい所, 冷暗所, or an explicit refrigerated condition—not the vague 冷たい所.' },
  { pattern: /会議に間に合うために、早い電車/u, issue: 'For an earlier departure, 一本早い電車 is the natural phrasing; 早い電車 can mean a fast train.' },
];

export function deterministicJapaneseNaturalnessIssues(japanese: string): string[] {
  return deterministicRules.flatMap(({ pattern, issue }) => pattern.test(japanese) ? [issue] : []);
}

export function japaneseQualityGate(
  critic: JapaneseSentenceCritic,
  deterministicIssues: readonly string[] = [],
): { accepted: boolean; issues: string[] } {
  const thresholdIssues = (Object.entries(JAPANESE_QUALITY_THRESHOLDS) as Array<[
    keyof JapaneseQualityScores,
    number,
  ]>).flatMap(([key, threshold]) => critic[key] < threshold
    ? [`${key} scored ${critic[key]}, below ${threshold}.`]
    : []);
  const issues = [
    ...deterministicIssues,
    ...critic.issues,
    ...thresholdIssues,
    ...(critic.targetGrammarPreserved ? [] : ['The target grammar was not preserved.']),
  ];
  return {
    accepted: critic.accepted && critic.targetGrammarPreserved && issues.length === 0,
    issues: [...new Set(issues)],
  };
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

function scores(critic: JapaneseSentenceCritic): JapaneseQualityScores {
  return {
    grammar: critic.grammar,
    naturalness: critic.naturalness,
    semanticPlausibility: critic.semanticPlausibility,
    collocation: critic.collocation,
    levelAppropriate: critic.levelAppropriate,
  };
}

function planningInput(input: JapaneseGenerationInput): string {
  return JSON.stringify({
    level: input.level,
    targetGrammar: input.targetGrammar,
    suppliedVocabulary: input.vocabulary,
    preferredRegister: input.preferredRegister,
    requestedContext: input.requestedContext ?? null,
    referenceExamples: input.references,
  });
}

function generationInput(
  input: JapaneseGenerationInput,
  plan: Extract<JapaneseSemanticPlan, { compatible: true }>,
  previous?: { draft: z.infer<typeof generatedSentenceDraftSchema>; issues: string[]; correctedSentence: string | null },
): string {
  return JSON.stringify({
    target: input.targetGrammar,
    semanticPlan: plan,
    referenceExamples: input.references,
    previousCandidate: previous?.draft ?? null,
    mandatoryRevisionIssues: previous?.issues ?? [],
    criticSuggestion: previous?.correctedSentence ?? null,
  });
}

function criticInput(
  input: JapaneseGenerationInput,
  plan: Extract<JapaneseSemanticPlan, { compatible: true }>,
  draft: z.infer<typeof generatedSentenceDraftSchema>,
  deterministicIssues: string[],
): string {
  return JSON.stringify({
    target: input.targetGrammar,
    semanticPlan: plan,
    candidate: draft,
    deterministicPreflightIssues: deterministicIssues,
    referenceExamples: input.references,
  });
}

export class JapaneseSentenceGenerationPipeline {
  constructor(
    private readonly model: Pick<AiProvider, 'complete'>,
    private readonly logger: JapaneseGenerationLogger = () => undefined,
  ) {}

  async generate(rawInput: unknown, signal: AbortSignal): Promise<JapaneseSentenceGenerationResult> {
    const input = japaneseGenerationInputSchema.parse(rawInput);
    const plan = japaneseSemanticPlanSchema.parse(extractJson(await this.model.complete({
      system: JAPANESE_SEMANTIC_PLANNING_PROMPT,
      user: planningInput(input),
      signal,
    })));

    if (!plan.compatible) {
      return {
        compatible: false,
        reason: plan.reason,
        rejectedVocabulary: plan.rejectedVocabulary,
      };
    }

    let previous: Parameters<typeof generationInput>[2];
    for (let attempt = 1; attempt <= JAPANESE_GENERATION_MAX_ATTEMPTS; attempt += 1) {
      const draft = generatedSentenceDraftSchema.parse(extractJson(await this.model.complete({
        system: JAPANESE_SENTENCE_GENERATION_PROMPT,
        user: generationInput(input, plan, previous),
        signal,
      })));
      const deterministicIssues = deterministicJapaneseNaturalnessIssues(draft.japanese);
      const critic = japaneseSentenceCriticSchema.parse(extractJson(await this.model.complete({
        system: JAPANESE_SENTENCE_CRITIC_PROMPT,
        user: criticInput(input, plan, draft, deterministicIssues),
        signal,
      })));
      const gate = japaneseQualityGate(critic, deterministicIssues);
      if (gate.accepted && draft.targetGrammarPreserved) {
        return {
          compatible: true,
          japanese: draft.japanese,
          reading: draft.reading,
          translation: draft.translation,
          metadata: {
            situation: plan.situation,
            speaker: plan.speaker,
            listener: plan.listener,
            communicativeIntent: plan.communicativeIntent,
            targetGrammar: [plan.targetGrammar],
            targetVocabulary: plan.targetVocabulary,
            rejectedVocabulary: plan.rejectedVocabulary,
            register: plan.register,
            level: plan.level,
            quality: scores(critic),
            attempts: attempt,
            referenceIds: input.references.map(({ referenceId }) => referenceId),
          },
        };
      }

      this.logger({ attempt, sentence: draft.japanese, issues: gate.issues, scores: scores(critic) });
      previous = { draft, issues: gate.issues, correctedSentence: critic.correctedSentence };
    }

    throw new AiServerError(
      'INVALID_RESPONSE',
      true,
      'A natural level-appropriate Japanese sentence could not be generated safely.',
    );
  }
}
