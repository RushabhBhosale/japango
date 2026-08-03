import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(160);
const shortTextSchema = z.string().trim().min(1).max(600);
const japaneseTextSchema = z.string().min(1).max(6000);

export const lessonV2LevelSchema = z.enum(['N5', 'N4']);
export const lessonV2StatusSchema = z.enum(['draft', 'review', 'published', 'archived']);
export const lessonV2TokenStatusSchema = z.enum(['verified', 'needs_review', 'manual_correction']);
export const lessonV2SectionKindSchema = z.enum([
  'introduction',
  'dialogue',
  'vocabulary',
  'grammar',
  'kanji',
  'guided_practice',
  'speaking',
  'conversation',
  'review',
  'quiz',
  'review_cards',
  'source_references',
]);
export const jlptSectionSchema = z.enum(['vocabulary_kanji', 'grammar', 'reading', 'listening']);
export const jlptQuestionTypeSchema = z.enum([
  'kanji_reading',
  'kana_to_kanji',
  'vocabulary_cloze',
  'similar_meaning',
  'word_usage',
  'grammar_cloze',
  'sentence_order_star',
  'short_reading',
  'information_retrieval',
  'listening_task',
  'listening_quick_response',
  'app_practice',
]);
export const validationSeveritySchema = z.enum(['info', 'warning', 'critical']);

export const japaneseTokenSchema = z.object({
  id: idSchema,
  kind: z.enum(['word', 'plain']),
  surface: z.string().min(1).max(120),
  reading: z.string().min(1).max(180).optional(),
  vocabularyId: idSchema.optional(),
  kanjiIds: z.array(idSchema).max(12).default([]),
  status: lessonV2TokenStatusSchema.default('needs_review'),
}).strict().superRefine((token, context) => {
  if (token.kind === 'plain' && (token.reading || token.vocabularyId || token.kanjiIds.length > 0)) {
    context.addIssue({ code: 'custom', message: 'Plain tokens cannot carry learning links.' });
  }
  if (token.kind === 'word' && /[\u3400-\u9fff]/u.test(token.surface) && !token.reading) {
    context.addIssue({ code: 'custom', message: 'A word containing kanji requires a reading.' });
  }
});

/** `raw` is canonical: tokens must join to it without normalization or whitespace repair. */
export const structuredJapaneseTextSchema = z.object({
  raw: japaneseTextSchema,
  tokens: z.array(japaneseTokenSchema).min(1).max(500),
  status: lessonV2TokenStatusSchema.default('needs_review'),
}).strict().superRefine((value, context) => {
  if (value.tokens.map((token) => token.surface).join('') !== value.raw) {
    context.addIssue({ code: 'custom', path: ['tokens'], message: 'Tokens must concatenate exactly to raw Japanese text.' });
  }
  if (value.status === 'verified' && value.tokens.some((token) => token.status !== 'verified')) {
    context.addIssue({ code: 'custom', message: 'Verified text cannot contain unverified tokens.' });
  }
});

export const lessonV2VocabularySchema = z.object({
  id: idSchema,
  level: lessonV2LevelSchema,
  written: shortTextSchema,
  reading: shortTextSchema,
  meaning: shortTextSchema,
  partOfSpeech: z.array(shortTextSchema).min(1).max(8),
  canonicalCurriculumItemId: idSchema.optional(),
  status: lessonV2StatusSchema,
}).strict();

export const lessonV2KanjiSchema = z.object({
  id: idSchema,
  level: lessonV2LevelSchema,
  character: z.string().regex(/^[\u3400-\u9fff]$/u),
  meanings: z.array(shortTextSchema).min(1).max(8),
  readings: z.array(shortTextSchema).min(1).max(12),
  canonicalCurriculumItemId: idSchema.optional(),
  status: lessonV2StatusSchema,
}).strict();

export const lessonV2SourceReferenceSchema = z.object({
  id: idSchema,
  sourceChunkId: idSchema,
  sourcePath: shortTextSchema,
  sourceRole: z.enum(['lesson_grounding', 'question_pattern', 'answer_key', 'quality_warning']),
  note: z.string().trim().max(800).optional(),
  excerptHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
}).strict();

const bilingualTextSchema = z.object({
  japanese: structuredJapaneseTextSchema.optional(),
  english: z.string().trim().min(1).max(2000).optional(),
}).strict().superRefine((value, context) => {
  if (!value.japanese && !value.english) context.addIssue({ code: 'custom', message: 'Text needs Japanese or English content.' });
});

export const lessonV2ChoiceSchema = z.object({
  id: idSchema,
  label: bilingualTextSchema,
  isCorrect: z.boolean(),
  explanation: bilingualTextSchema.optional(),
}).strict();

export const lessonV2ExplanationSchema = z.object({
  correct: bilingualTextSchema,
  distractors: z.array(z.object({ choiceId: idSchema, explanation: bilingualTextSchema }).strict()).max(8),
  commonMistake: bilingualTextSchema.optional(),
  readingEvidenceTokenIds: z.array(idSchema).max(40).default([]),
  relatedLessonSectionId: idSchema.optional(),
  vocabularyIds: z.array(idSchema).max(40).default([]),
  kanjiIds: z.array(idSchema).max(40).default([]),
}).strict();

export const lessonV2QuestionSchema = z.object({
  id: idSchema,
  level: lessonV2LevelSchema,
  type: jlptQuestionTypeSchema,
  section: jlptSectionSchema,
  sourcePatternIds: z.array(idSchema).min(1).max(12),
  testedSkill: shortTextSchema,
  objectiveId: idSchema,
  grammarIds: z.array(idSchema).max(12).default([]),
  vocabularyIds: z.array(idSchema).max(40).default([]),
  kanjiIds: z.array(idSchema).max(40).default([]),
  instruction: structuredJapaneseTextSchema,
  passage: structuredJapaneseTextSchema.optional(),
  prompt: structuredJapaneseTextSchema,
  choices: z.array(lessonV2ChoiceSchema).min(2).max(4),
  explanation: lessonV2ExplanationSchema,
  difficulty: z.number().int().min(1).max(5),
  estimatedSeconds: z.number().int().min(10).max(1800),
  validationStatus: z.enum(['draft', 'valid', 'blocked']),
  sourceReferences: z.array(lessonV2SourceReferenceSchema).min(1).max(20),
  similarityScore: z.number().min(0).max(1).optional(),
}).strict().superRefine((question, context) => {
  if (question.type !== 'app_practice' && question.choices.length !== 4) {
    context.addIssue({ code: 'custom', path: ['choices'], message: 'JLPT-style questions require four choices.' });
  }
  const correctChoices = question.choices.filter((choice) => choice.isCorrect);
  if (correctChoices.length !== 1) context.addIssue({ code: 'custom', path: ['choices'], message: 'Exactly one choice must be correct.' });
  if (new Set(question.choices.map((choice) => JSON.stringify(choice.label))).size !== question.choices.length) {
    context.addIssue({ code: 'custom', path: ['choices'], message: 'Choices must be unique.' });
  }
  if (question.type === 'sentence_order_star' && !question.prompt.raw.includes('★')) {
    context.addIssue({ code: 'custom', path: ['prompt'], message: 'Star-order questions require a star marker.' });
  }
});

export const lessonV2SectionSchema = z.object({
  id: idSchema,
  kind: lessonV2SectionKindSchema,
  title: shortTextSchema,
  order: z.number().int().positive(),
  estimatedMinutes: z.number().int().positive().max(90),
  content: z.array(bilingualTextSchema).max(32).default([]),
  questions: z.array(lessonV2QuestionSchema).max(30).default([]),
  vocabularyIds: z.array(idSchema).max(80).default([]),
  grammarIds: z.array(idSchema).max(40).default([]),
  kanjiIds: z.array(idSchema).max(80).default([]),
}).strict();

export const lessonV2VersionSchema = z.object({
  id: idSchema,
  lessonId: idSchema,
  version: z.number().int().positive(),
  status: lessonV2StatusSchema,
  level: lessonV2LevelSchema,
  title: shortTextSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  objectives: z.array(shortTextSchema).min(1).max(12),
  estimatedMinutes: z.number().int().min(1).max(120),
  sections: z.array(lessonV2SectionSchema).min(1).max(20),
  sourceReferences: z.array(lessonV2SourceReferenceSchema).max(40).default([]),
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime().optional(),
}).strict().superRefine((lesson, context) => {
  const ids = lesson.sections.map((section) => section.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['sections'], message: 'Section IDs must be unique.' });
  const orders = lesson.sections.map((section) => section.order);
  if (new Set(orders).size !== orders.length) context.addIssue({ code: 'custom', path: ['sections'], message: 'Section order must be unique.' });
});

export const lessonV2ValidationIssueSchema = z.object({
  severity: validationSeveritySchema,
  subjectId: idSchema,
  issueType: idSchema,
  message: shortTextSchema,
  suggestedFix: z.string().trim().max(1000).optional(),
  sourcePatternId: idSchema.optional(),
  sourceChunkId: idSchema.optional(),
}).strict();

export const lessonV2ProgressSchema = z.object({
  lessonVersionId: idSchema,
  currentSectionId: idSchema.optional(),
  completedSectionIds: z.array(idSchema).default([]),
  completedQuestionIds: z.array(idSchema).default([]),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
}).strict();

export type StructuredJapaneseText = z.infer<typeof structuredJapaneseTextSchema>;
export type JapaneseToken = z.infer<typeof japaneseTokenSchema>;
export type LessonV2Version = z.infer<typeof lessonV2VersionSchema>;
export type LessonV2Question = z.infer<typeof lessonV2QuestionSchema>;
export type LessonV2Explanation = z.infer<typeof lessonV2ExplanationSchema>;
export type LessonV2Section = z.infer<typeof lessonV2SectionSchema>;
export type LessonV2ValidationIssue = z.infer<typeof lessonV2ValidationIssueSchema>;
export type LessonV2Progress = z.infer<typeof lessonV2ProgressSchema>;
