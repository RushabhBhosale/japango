import { z } from 'zod';

export const dailyReadingDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
export const dailyReadingLevelSchema = z.enum(['N5', 'N4']);

const contextItemSchema = z.object({
  id: z.string().min(1).max(180),
  japanese: z.string().trim().min(1).max(120),
  reading: z.string().trim().min(1).max(160).optional(),
  meaning: z.string().trim().min(1).max(300),
}).strict();

export const dailyReadingLearningContextSchema = z.object({
  knownVocabulary: z.array(contextItemSchema).max(50),
  weakVocabulary: z.array(contextItemSchema).max(12),
  recentVocabulary: z.array(contextItemSchema).max(12),
  newVocabularyCandidates: z.array(contextItemSchema).max(12),
  recentGrammar: z.array(contextItemSchema).max(8),
  learnedKanji: z.array(contextItemSchema).max(60),
  recentTopics: z.array(z.string().trim().min(1).max(120)).max(10),
}).strict();

export const dailyReadingGenerationRequestSchema = z.object({
  date: dailyReadingDateSchema,
  level: dailyReadingLevelSchema,
  context: dailyReadingLearningContextSchema,
}).strict();

export const generatedDailyReadingSchema = z.object({
  date: dailyReadingDateSchema,
  level: dailyReadingLevelSchema,
  type: z.enum(['slice-of-life', 'conversation', 'diary', 'travel', 'mystery', 'school-work', 'fictional-news', 'culture', 'story-episode']),
  title: z.string().trim().min(1).max(120),
  titleReading: z.string().trim().min(1).max(180),
  content: z.string().trim().min(1).max(1800),
  contentReading: z.string().trim().min(1).max(2400),
  targetVocabulary: z.array(z.object({
    sourceItemId: z.string().min(1).max(180),
    word: z.string().trim().min(1).max(80),
    reading: z.string().trim().min(1).max(120),
    meaning: z.string().trim().min(1).max(240),
    isNew: z.boolean(),
  }).strict()).min(1).max(9),
  targetGrammar: z.array(z.object({
    sourceItemId: z.string().min(1).max(180),
    pattern: z.string().trim().min(1).max(120),
    reading: z.string().trim().min(1).max(180).optional(),
    meaning: z.string().trim().min(1).max(300),
  }).strict()).max(2),
  questions: z.array(z.object({
    id: z.string().min(1).max(120),
    question: z.string().trim().min(1).max(500),
    questionReading: z.string().trim().min(1).max(700),
    options: z.tuple([
      z.string().trim().min(1).max(240),
      z.string().trim().min(1).max(240),
      z.string().trim().min(1).max(240),
      z.string().trim().min(1).max(240),
    ]),
    optionReadings: z.tuple([
      z.string().trim().min(1).max(360),
      z.string().trim().min(1).max(360),
      z.string().trim().min(1).max(360),
      z.string().trim().min(1).max(360),
    ]),
    correctAnswer: z.number().int().min(0).max(3),
    explanation: z.string().trim().min(1).max(600),
    explanationReading: z.string().trim().min(1).max(900).optional(),
    targetVocabularyIds: z.array(z.string().min(1).max(180)).max(4),
  }).strict()).min(3).max(5),
  seriesId: z.string().min(1).max(180).nullable().optional(),
  episodeNumber: z.number().int().positive().nullable().optional(),
  previousEpisodeId: z.string().min(1).max(180).nullable().optional(),
}).strict();

export type DailyReadingGenerationRequest = z.infer<typeof dailyReadingGenerationRequestSchema>;
export type GeneratedDailyReading = z.infer<typeof generatedDailyReadingSchema>;
export type DailyReadingLearningContext = z.infer<typeof dailyReadingLearningContextSchema>;

export interface StoredDailyReading extends Omit<GeneratedDailyReading, 'seriesId' | 'episodeNumber' | 'previousEpisodeId'> {
  id: string;
  seriesId?: string;
  episodeNumber?: number;
  previousEpisodeId?: string;
  generatedAt: string;
}
