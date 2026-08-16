import { z } from 'zod';

const metadataSchema = z.object({
  mistakes: z.array(z.object({
    original: z.string().trim().min(1).max(1_000),
    corrected: z.string().trim().min(1).max(1_000),
    type: z.string().trim().max(80).optional(),
    point: z.string().trim().max(160).optional(),
  }).strict()).max(30),
  newVocabulary: z.array(z.string().trim().min(1).max(120)).max(40),
  kanjiUsed: z.array(z.string().trim().min(1).max(20)).max(80),
  topics: z.array(z.string().trim().min(1).max(120)).max(20),
}).strict();

export const practiceAnalysisRequestSchema = z.object({
  sessions: z.array(z.object({
    id: z.string().trim().min(1).max(180),
    practicedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    transcript: z.string().trim().min(1).max(20_000),
    metadata: metadataSchema.optional(),
  }).strict()).min(1).max(10),
  curriculumCandidates: z.array(z.object({
    id: z.string().min(1).max(180),
    type: z.enum(['grammar', 'vocabulary', 'kanji']),
    title: z.string().trim().min(1).max(160),
    reading: z.string().trim().min(1).max(180).optional(),
    meaning: z.string().trim().min(1).max(500).optional(),
  }).strict()).max(130),
  existingEvidence: z.array(z.object({
    type: z.enum(['grammar', 'vocabulary', 'kanji']),
    key: z.string().trim().min(1).max(160),
    mistakes: z.number().int().min(0).max(10_000),
    successfulUses: z.number().int().min(0).max(10_000),
    mastery: z.number().min(0).max(1),
  }).strict()).max(30),
}).strict().superRefine((value, context) => {
  if (new Set(value.sessions.map(({ id }) => id)).size !== value.sessions.length) {
    context.addIssue({ code: 'custom', message: 'Session IDs must be unique.' });
  }
});

const analysisSchema = z.object({
  mistakes: z.array(z.object({
    original: z.string().trim().min(1).max(1_000),
    corrected: z.string().trim().min(1).max(1_000),
    category: z.enum(['grammar', 'vocabulary', 'kanji', 'particle', 'conjugation', 'naturalness']),
    explanation: z.string().trim().min(1).max(1_000),
    confidence: z.number().min(0).max(1),
  }).strict()).max(30),
  weakGrammar: z.array(z.string().trim().min(1).max(160)).max(20),
  weakVocabulary: z.array(z.string().trim().min(1).max(120)).max(30),
  weakKanji: z.array(z.string().trim().min(1).max(20)).max(40),
  learnedVocabulary: z.array(z.object({
    word: z.string().trim().min(1).max(120),
    reading: z.string().trim().min(1).max(160),
    meaning: z.string().trim().min(1).max(300),
  }).strict()).max(30),
  strengths: z.array(z.string().trim().min(1).max(200)).max(20),
  recurringMistakes: z.array(z.string().trim().min(1).max(240)).max(20),
  suggestedReview: z.array(z.string().trim().min(1).max(240)).max(20),
  topics: z.array(z.string().trim().min(1).max(120)).max(20),
}).strict();

export const practiceAnalysisBatchSchema = z.object({
  analyses: z.array(z.object({
    sessionId: z.string().trim().min(1).max(180),
    analysis: analysisSchema,
    curriculumLinks: z.array(z.object({
      type: z.enum(['grammar', 'vocabulary', 'kanji']),
      key: z.string().trim().min(1).max(160),
      curriculumItemId: z.string().trim().min(1).max(180),
      evidence: z.enum(['weak', 'strong']),
    }).strict()).max(40),
  }).strict()).min(1).max(10),
}).strict();

export type PracticeAnalysisRequest = z.infer<typeof practiceAnalysisRequestSchema>;
export type PracticeAnalysisBatch = z.infer<typeof practiceAnalysisBatchSchema>;
