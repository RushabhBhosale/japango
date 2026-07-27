import { z } from 'zod';

const levelSchema = z.enum(['N5', 'N4']);

const bundleMetadataSchema = z.object({
  schemaVersion: z.literal(2),
  contentVersion: z.string().min(1),
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
  counts: z.object({
    vocabulary: z.number().int().nonnegative(),
    questions: z.number().int().nonnegative(),
    sentences: z.number().int().nonnegative(),
    grammar: z.number().int().nonnegative(),
    kanji: z.number().int().nonnegative(),
    grammarQuestions: z.number().int().nonnegative(),
    kanjiQuestions: z.number().int().nonnegative(),
    readingPassages: z.number().int().nonnegative(),
    readingQuestions: z.number().int().nonnegative(),
    listeningActivities: z.number().int().nonnegative(),
    listeningQuestions: z.number().int().nonnegative(),
  }),
}).strict();

const curriculumItemBaseSchema = z.object({
  id: z.string().min(1),
  level: levelSchema,
  title: z.string().min(1),
  meaning: z.string().min(1),
  reading: z.string().min(1).optional(),
  tags: z.array(z.string()),
  releaseReady: z.literal(true),
});

const curriculumItemSchema = z.discriminatedUnion('type', [
  curriculumItemBaseSchema.extend({
    type: z.literal('vocabulary'),
    confidence: z.number().min(0).max(1),
    needsReview: z.boolean(),
  }).strict(),
  curriculumItemBaseSchema.extend({
    type: z.literal('grammar'),
    confidence: z.number().min(0).max(1),
    needsReview: z.boolean(),
  }).strict(),
  curriculumItemBaseSchema.extend({
    type: z.literal('kanji'),
    confidence: z.number().min(0).max(1),
    needsReview: z.boolean(),
  }).strict(),
  curriculumItemBaseSchema.extend({
    type: z.literal('reading'),
  }).strict(),
  curriculumItemBaseSchema.extend({
    type: z.literal('listening'),
  }).strict(),
]);

const sentenceSchema = z.object({
  id: z.string().min(1),
  japanese: z.string().min(1),
  reading: z.string().min(1),
  english: z.string().min(1),
  difficulty: z.object({ jlptLevel: levelSchema, rank: z.number().int().min(1).max(5) }).strict(),
  releaseReady: z.literal(true),
}).passthrough();

const vocabularyExampleSchema = z.object({
  id: z.string().min(1),
  vocabularyId: z.string().min(1),
  sentenceId: z.string().min(1),
  role: z.enum(['focus', 'supporting']),
  releaseReady: z.literal(true),
}).passthrough();

const grammarExampleSchema = z.object({
  id: z.string().min(1),
  grammarId: z.string().min(1),
  sentenceId: z.string().min(1),
  role: z.enum(['focus', 'supporting']),
  releaseReady: z.literal(true),
}).passthrough();

const vocabularyQuestionSchema = z.object({
  id: z.string().min(1),
  vocabularyId: z.string().min(1),
  level: levelSchema,
  presentation: z.string().min(1),
  responseType: z.literal('single-select'),
  prompt: z.string().min(1),
  explanation: z.string().nullable(),
  correctOptionId: z.string().min(1),
  options: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    feedback: z.string().nullable(),
  }).strict()).min(2),
}).strict();

const questionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  feedback: z.string().nullable(),
}).strict();

const practiceQuestionSchema = z.object({
  id: z.string().min(1),
  itemId: z.string().min(1),
  domain: z.enum(['grammar', 'kanji', 'reading', 'listening']),
  level: levelSchema,
  presentation: z.string().min(1),
  responseType: z.literal('single-select'),
  prompt: z.string().min(1),
  explanation: z.string().nullable(),
  correctOptionId: z.string().min(1),
  options: z.array(questionOptionSchema).min(2),
}).strict();

const grammarDetailSchema = z.object({
  id: z.string().min(1),
  meanings: z.array(z.string().min(1)).min(1),
  formation: z.array(z.object({ base: z.string().min(1), structure: z.string().min(1) }).strict()),
  relatedGrammarIds: z.array(z.string().min(1)),
  notes: z.string().nullable(),
}).strict();

const kanjiDetailSchema = z.object({
  id: z.string().min(1),
  meanings: z.array(z.string().min(1)).min(1),
  onReadings: z.array(z.string()),
  kunReadings: z.array(z.string()),
  strokeCount: z.number().int().positive().nullable(),
  vocabularyIds: z.array(z.string().min(1)),
  relatedKanjiIds: z.array(z.string().min(1)),
  components: z.array(z.string()),
}).strict();

const readingPassageSchema = z.object({
  id: z.string().min(1), level: levelSchema, title: z.string().min(1), japanese: z.string().min(1),
  reading: z.string().min(1), english: z.string().min(1), passageType: z.string().min(1),
  difficultyRank: z.number().int().min(1).max(5), estimatedReadingSeconds: z.number().int().positive(),
  vocabularyIds: z.array(z.string().min(1)), grammarIds: z.array(z.string().min(1)), kanjiIds: z.array(z.string().min(1)),
  questionIds: z.array(z.string().min(1)).length(4),
}).strict();

const listeningActivitySchema = z.object({
  id: z.string().min(1), level: levelSchema, title: z.string().min(1), activityType: z.string().min(1),
  transcript: z.string().min(1), learnerTranscript: z.string().nullable(), speechText: z.string().min(1), english: z.string().min(1),
  difficultyRank: z.number().int().min(1).max(5), estimatedDurationSeconds: z.number().int().positive(),
  vocabularyIds: z.array(z.string().min(1)), grammarIds: z.array(z.string().min(1)), kanjiIds: z.array(z.string().min(1)),
  questionIds: z.array(z.string().min(1)).length(3),
  turns: z.array(z.object({
    id: z.string().min(1), position: z.number().int().positive(), speakerLabel: z.string().min(1), displayText: z.string().min(1),
    speechText: z.string().min(1), reading: z.string().min(1), english: z.string().min(1), pauseAfterMs: z.number().int().nonnegative(),
  }).strict()).min(1),
}).strict();

const bundledCurriculumSchema = bundleMetadataSchema.extend({
  sourceSchemaVersion: z.string().min(1),
  items: z.array(curriculumItemSchema),
  vocabularyDetails: z.array(z.object({
    id: z.string().min(1),
    partOfSpeech: z.array(z.string()),
    kanjiIds: z.array(z.string()),
  }).strict()),
  sentences: z.array(sentenceSchema),
  grammarExamples: z.array(grammarExampleSchema),
  vocabularyExamples: z.array(vocabularyExampleSchema),
  kanjiExamples: z.array(z.object({
    id: z.string().min(1), kanjiId: z.string().min(1), sentenceId: z.string().min(1), role: z.enum(['focus', 'supporting']),
  }).strict()),
  vocabularyQuestions: z.array(vocabularyQuestionSchema),
  grammarDetails: z.array(grammarDetailSchema),
  kanjiDetails: z.array(kanjiDetailSchema),
  practiceQuestions: z.array(practiceQuestionSchema),
  readingPassages: z.array(readingPassageSchema),
  listeningActivities: z.array(listeningActivitySchema),
}).strict();

export type BundledCurriculumMetadata = z.infer<typeof bundleMetadataSchema>;
export type BundledCurriculum = z.infer<typeof bundledCurriculumSchema>;
export type BundledVocabularyQuestion = z.infer<typeof vocabularyQuestionSchema>;
export type BundledPracticeQuestion = z.infer<typeof practiceQuestionSchema>;

const rawMetadata: unknown = require('../../../assets/mobile-curriculum/version.json');

export const bundledCurriculumMetadata = bundleMetadataSchema.parse(rawMetadata);
let cachedBundledCurriculum: BundledCurriculum | undefined;

function hasRequiredCollections(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return [
    'items', 'vocabularyDetails', 'sentences', 'grammarExamples', 'vocabularyExamples',
    'kanjiExamples', 'vocabularyQuestions', 'grammarDetails', 'kanjiDetails',
    'practiceQuestions', 'readingPassages', 'listeningActivities',
  ].every((key) => Array.isArray(record[key]));
}

/** Full recursive validation for content tooling and tests, never for an interactive launch. */
export function validateBundledCurriculumPayload(value: unknown): BundledCurriculum {
  return bundledCurriculumSchema.parse(value);
}

/**
 * The packaged release is an application-owned asset that is fully checked in
 * the content pipeline. At runtime we validate its envelope and inventory, but
 * avoid deep-cloning its 18 MB payload with Zod on the JS thread.
 */
export function loadBundledCurriculum(): BundledCurriculum {
  if (cachedBundledCurriculum) return cachedBundledCurriculum;
  const rawBundle: unknown = require('../../../assets/mobile-curriculum/release.json');
  if (!hasRequiredCollections(rawBundle)) throw new Error('Bundled curriculum has an invalid release shape.');
  const envelope = bundleMetadataSchema.parse({
    schemaVersion: rawBundle.schemaVersion,
    contentVersion: rawBundle.contentVersion,
    checksum: rawBundle.checksum,
    counts: rawBundle.counts,
  });
  const bundle = rawBundle as BundledCurriculum;
  if (
    envelope.contentVersion !== bundledCurriculumMetadata.contentVersion
    || envelope.checksum !== bundledCurriculumMetadata.checksum
    || envelope.counts.vocabulary !== bundledCurriculumMetadata.counts.vocabulary
    || envelope.counts.questions !== bundledCurriculumMetadata.counts.questions
    || envelope.counts.sentences !== bundledCurriculumMetadata.counts.sentences
    || envelope.counts.readingPassages !== bundledCurriculumMetadata.counts.readingPassages
    || envelope.counts.listeningActivities !== bundledCurriculumMetadata.counts.listeningActivities
  ) {
    throw new Error('Bundled curriculum metadata does not match the content package.');
  }
  const vocabularyCount = bundle.items.filter((item) => item.type === 'vocabulary').length;
  if (vocabularyCount !== bundle.counts.vocabulary || vocabularyCount !== 1740) {
    throw new Error('Bundled curriculum does not contain the expected release vocabulary inventory.');
  }
  if (bundle.readingPassages.length !== bundle.counts.readingPassages || bundle.readingPassages.length !== 30) {
    throw new Error('Bundled curriculum does not contain the expected initial reading release.');
  }
  if (bundle.listeningActivities.length !== bundle.counts.listeningActivities || bundle.listeningActivities.length !== 30) {
    throw new Error('Bundled curriculum does not contain the expected initial listening release.');
  }
  cachedBundledCurriculum = bundle;
  return cachedBundledCurriculum;
}
