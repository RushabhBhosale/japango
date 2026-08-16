import { z } from 'zod';

export const practiceLogMetadataSchema = z.object({
  mistakes: z.array(z.object({
    original: z.string().trim().min(1).max(1_000),
    corrected: z.string().trim().min(1).max(1_000),
    type: z.string().trim().max(80).optional(),
    point: z.string().trim().max(160).optional(),
  }).strict()).max(30).default([]),
  newVocabulary: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  kanjiUsed: z.array(z.string().trim().min(1).max(20)).max(80).default([]),
  topics: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
}).strict();

export const practiceAnalysisSchema = z.object({
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

export const practiceSessionAnalysisSchema = z.object({
  sessionId: z.string().trim().min(1).max(180),
  analysis: practiceAnalysisSchema,
  curriculumLinks: z.array(z.object({
    type: z.enum(['grammar', 'vocabulary', 'kanji']),
    key: z.string().trim().min(1).max(160),
    curriculumItemId: z.string().trim().min(1).max(180),
    evidence: z.enum(['weak', 'strong']),
  }).strict()).max(40),
}).strict();

export const practiceAnalysisBatchSchema = z.object({
  analyses: z.array(practiceSessionAnalysisSchema).min(1).max(10),
}).strict();

export const practiceAnalysisApiResponseSchema = z.object({
  success: z.literal(true),
  data: practiceAnalysisBatchSchema,
  meta: z.object({
    fallbackUsed: z.boolean(),
  }).strict().optional(),
}).strict();

export const practiceAnalysisApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string().min(1),
    retryable: z.boolean().optional(),
    message: z.string().min(1).optional(),
  }).strict(),
}).strict();
