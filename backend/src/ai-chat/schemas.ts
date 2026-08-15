import { z } from 'zod';

const recentMessageSchema = z.object({
  role: z.enum(['learner', 'character']),
  content: z.string().trim().min(1).max(1_200),
}).strict();

const weaknessSchema = z.object({
  type: z.enum(['grammar', 'vocabulary', 'kanji']),
  key: z.string().trim().min(1).max(160),
  mastery: z.number().min(0).max(1),
  mistakes: z.number().int().min(0).max(10_000),
}).strict();

export const aiChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(1_200),
  learnerLevel: z.enum(['N5', 'N4']),
  conversation: z.object({
    summary: z.string().trim().min(1).max(1_500).optional(),
    recentMessages: z.array(recentMessageSchema).min(1).max(20),
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
  weaknesses: z.array(weaknessSchema).max(5),
}).strict();

const detectedMistakeSchema = z.object({
  original: z.string().trim().min(1).max(500),
  corrected: z.string().trim().min(1).max(500),
  category: z.enum(['grammar', 'particle', 'vocabulary', 'kanji', 'conjugation', 'naturalness', 'register']),
  target: z.string().trim().min(1).max(160).optional(),
  severity: z.enum(['low', 'medium', 'high']),
  confidence: z.number().min(0).max(1),
  explanation: z.string().trim().min(1).max(600).optional(),
}).strict();

const learningSignalSchema = z.object({
  target: z.string().trim().min(1).max(160),
  type: z.enum(['grammar', 'vocabulary', 'kanji']),
  result: z.enum(['strong', 'weak', 'uncertain']),
  confidence: z.number().min(0).max(1),
}).strict();

export const aiChatResponseSchema = z.object({
  reply: z.string().trim().min(1).max(900),
  replyReading: z.string().trim().min(1).max(1_800).optional(),
  detectedMistakes: z.array(detectedMistakeSchema).max(6),
  learningSignals: z.array(learningSignalSchema).max(8),
  memoryCandidates: z.array(z.object({
    text: z.string().trim().min(1).max(280),
    importance: z.number().min(0).max(1),
  }).strict()).max(4),
  conversationState: z.object({
    mood: z.string().trim().min(1).max(80).optional(),
    topic: z.string().trim().min(1).max(120).optional(),
    scenarioProgress: z.string().trim().min(1).max(160).optional(),
  }).strict(),
  conversationSummary: z.string().trim().min(1).max(1_500).optional(),
}).strict();

export type AiChatRequest = z.infer<typeof aiChatRequestSchema>;
export type AiChatResponse = z.infer<typeof aiChatResponseSchema>;
