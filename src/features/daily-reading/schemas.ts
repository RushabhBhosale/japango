import { z } from 'zod';

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const contextItemSchema = z.object({
  id: z.string().min(1).max(180),
  japanese: z.string().trim().min(1).max(120),
  reading: z.string().trim().min(1).max(160).optional(),
  meaning: z.string().trim().min(1).max(300),
}).strict();

export const dailyReadingVocabularySchema = z.object({
  sourceItemId: z.string().min(1).max(180),
  word: z.string().trim().min(1).max(80),
  reading: z.string().trim().min(1).max(120),
  meaning: z.string().trim().min(1).max(240),
  isNew: z.boolean(),
}).strict();

export const dailyReadingGrammarSchema = z.object({
  sourceItemId: z.string().min(1).max(180),
  pattern: z.string().trim().min(1).max(120),
  meaning: z.string().trim().min(1).max(300),
}).strict();

export const dailyReadingQuestionSchema = z.object({
  id: z.string().min(1).max(120),
  question: z.string().trim().min(1).max(500),
  options: z.tuple([
    z.string().trim().min(1).max(240),
    z.string().trim().min(1).max(240),
    z.string().trim().min(1).max(240),
    z.string().trim().min(1).max(240),
  ]),
  correctAnswer: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1).max(600),
  targetVocabularyIds: z.array(z.string().min(1).max(180)).max(4).default([]),
}).strict();

export const dailyReadingSchema = z.object({
  id: z.string().min(1).max(180),
  date: dateKeySchema,
  level: z.enum(['N5', 'N4']),
  type: z.enum(['slice-of-life', 'conversation', 'diary', 'travel', 'mystery', 'school-work', 'fictional-news', 'culture', 'story-episode']),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(1800),
  targetVocabulary: z.array(dailyReadingVocabularySchema).min(1).max(9),
  targetGrammar: z.array(dailyReadingGrammarSchema).max(2),
  questions: z.array(dailyReadingQuestionSchema).min(3).max(5),
  seriesId: z.string().min(1).max(180).optional(),
  episodeNumber: z.number().int().positive().optional(),
  previousEpisodeId: z.string().min(1).max(180).optional(),
  generatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((reading, context) => {
  if (new Set(reading.questions.map((question) => question.id)).size !== reading.questions.length) {
    context.addIssue({ code: 'custom', path: ['questions'], message: 'Question IDs must be unique.' });
  }
  reading.questions.forEach((question, index) => {
    if (new Set(question.options).size !== question.options.length) {
      context.addIssue({ code: 'custom', path: ['questions', index, 'options'], message: 'Question options must be unique.' });
    }
  });
});

export const dailyReadingLearningContextSchema = z.object({
  knownVocabulary: z.array(contextItemSchema).max(50),
  weakVocabulary: z.array(contextItemSchema).max(12),
  recentVocabulary: z.array(contextItemSchema).max(12),
  newVocabularyCandidates: z.array(contextItemSchema).max(12),
  recentGrammar: z.array(contextItemSchema).max(8),
  learnedKanji: z.array(contextItemSchema).max(60),
  recentTopics: z.array(z.string().trim().min(1).max(120)).max(10),
}).strict();

export const dailyReadingApiResponseSchema = z.object({
  success: z.literal(true),
  data: dailyReadingSchema,
}).passthrough();

export const dailyReadingApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    userMessage: z.string().min(1).optional(),
    retryable: z.boolean().optional(),
  }).passthrough(),
}).passthrough();

export const dailyReadingAnswerSchema = z.object({
  questionId: z.string().min(1),
  selectedAnswer: z.number().int().min(0).max(3),
  correct: z.boolean(),
  answeredAt: z.string().datetime({ offset: true }),
}).strict();

export const dailyReadingAnswersSchema = z.array(dailyReadingAnswerSchema);
export const vocabularyTapCountsSchema = z.record(z.string().min(1), z.number().int().positive());
export const savedVocabularyIdsSchema = z.array(z.string().min(1));
