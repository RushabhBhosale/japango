import { z } from 'zod';

export const aiChatDetectedMistakeSchema = z.object({
  original: z.string().trim().min(1).max(500),
  correction: z.string().trim().min(1).max(500),
  category: z.enum(['grammar', 'particle', 'vocabulary', 'kanji', 'conjugation', 'naturalness', 'other']),
  severity: z.enum(['low', 'medium', 'high']),
  confidence: z.number().min(0).max(1),
}).strict();

export const aiChatLearningSignalSchema = z.object({
  key: z.string().trim().min(1).max(160),
  type: z.enum(['grammar', 'vocabulary', 'kanji']),
  result: z.enum(['strong', 'weak', 'mistake']),
}).strict();

export const aiChatResponseSchema = z.object({
  reply: z.string().trim().min(1).max(900),
  replyReading: z.string().trim().min(1).max(1_800).optional(),
  mistakes: z.array(aiChatDetectedMistakeSchema).max(6).optional().default([]),
  learningSignals: z.array(aiChatLearningSignalSchema).max(8).optional().default([]),
  memoryCandidates: z.array(z.object({
    text: z.string().trim().min(1).max(280),
    importance: z.number().min(0).max(1),
  }).strict()).max(4).optional().default([]),
  scenario: z.object({
    topic: z.string().trim().min(1).max(120).optional(),
    state: z.string().trim().min(1).max(160).optional(),
    continuationSuggested: z.boolean().optional(),
  }).strict().optional(),
}).strict();

export const aiChatNetworkRequestSchema = z.object({
  message: z.string().trim().min(1).max(1_200),
  learnerLevel: z.enum(['N5', 'N4']),
  conversation: z.object({
    summary: z.string().trim().min(1).max(1_500).optional(),
    recentMessages: z.array(z.object({
      role: z.enum(['learner', 'character']),
      content: z.string().trim().min(1).max(1_200),
    }).strict()).min(1).max(20),
    relevantMemories: z.array(z.string().trim().min(1).max(280)).max(3).optional(),
    scenario: z.object({
      title: z.string().trim().min(1).max(120),
      setting: z.string().trim().min(1).max(180),
      goal: z.string().trim().min(1).max(180),
      targetGrammar: z.array(z.string().trim().min(1).max(100)).max(4),
      targetVocabulary: z.array(z.string().trim().min(1).max(100)).max(6),
      complication: z.string().trim().min(1).max(180).optional(),
    }).strict().optional(),
  }).strict(),
  chatPatterns: z.array(z.object({
    type: z.enum(['grammar', 'particle', 'vocabulary', 'kanji', 'conjugation', 'naturalness', 'other', 'english-fallback']),
    observations: z.number().int().min(1).max(10_000),
  }).strict()).max(4),
  learningTargets: z.array(z.object({
    itemId: z.string().trim().min(1).max(160),
    type: z.enum(['grammar', 'vocabulary', 'kanji']),
    key: z.string().trim().min(1).max(160),
    reading: z.string().trim().min(1).max(160).optional(),
    meaning: z.string().trim().min(1).max(240).optional(),
  }).strict()).max(8),
  weaknesses: z.array(z.object({
    type: z.enum(['grammar', 'vocabulary', 'kanji']),
    key: z.string().trim().min(1).max(160),
    mastery: z.number().min(0).max(1),
    mistakes: z.number().int().min(0).max(10_000),
  }).strict()).max(5),
}).strict();

export type AiChatNetworkRequest = z.infer<typeof aiChatNetworkRequestSchema>;
