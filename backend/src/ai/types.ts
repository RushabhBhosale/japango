import { z } from 'zod';

export const aiFeatureSchema = z.enum(['explain_vocabulary', 'explain_grammar', 'explain_kanji', 'explain_mistake', 'reading_coach', 'listening_coach', 'conversation', 'writing_check', 'generate_examples', 'study_plan']);
export const aiTeacherResponseSchema = z.object({
  answer: z.string().trim().min(1).max(4000),
  japaneseExamples: z.array(z.object({ japanese: z.string().min(1).max(300), reading: z.string().max(300).optional(), translation: z.string().min(1).max(500), target: z.string().max(100).optional() }).strict()).max(5).optional(),
  corrections: z.array(z.object({ original: z.string().min(1).max(1000), corrected: z.string().min(1).max(1000), explanation: z.string().min(1).max(1000), category: z.enum(['incorrect', 'unnatural', 'style']).optional() }).strict()).max(8).optional(),
  followUpSuggestions: z.array(z.string().min(1).max(180)).max(4).optional(), confidence: z.enum(['low', 'medium', 'high']).optional(),
}).strict().superRefine((value, context) => { if (value.japaneseExamples && new Set(value.japaneseExamples.map((example) => example.japanese)).size !== value.japaneseExamples.length) context.addIssue({ code: 'custom', message: 'Examples must be unique.' }); });

export const aiTeacherRequestSchema = z.object({ feature: aiFeatureSchema, context: z.object({ learnerLevel: z.enum(['N5', 'N4']), targetLevel: z.enum(['N5', 'N4']).optional(), item: z.object({ id: z.string().min(1), type: z.string().min(1), title: z.string().min(1), meaning: z.string().max(500).optional(), reading: z.string().max(500).optional(), details: z.array(z.string().max(400)).max(8).optional() }).optional(), question: z.object({ prompt: z.string().max(1200), userAnswer: z.string().max(600).optional(), correctAnswer: z.string().max(600).optional(), canonicalExplanation: z.string().max(1200).optional() }).optional(), recentMistakes: z.array(z.object({ concept: z.string().max(180), count: z.number().int().positive().max(50) }).strict()).max(5).optional(), deterministicPlan: z.array(z.string().max(180)).max(8).optional() }).strict(), userInput: z.string().trim().max(1200).optional(), requestId: z.string().min(1).max(100), promptVersion: z.string().min(1).max(80) }).strict();

export type AiTeacherRequest = z.infer<typeof aiTeacherRequestSchema>;
export type AiTeacherResponse = z.infer<typeof aiTeacherResponseSchema>;
export interface AiModelCapabilities { structuredOutput: boolean; streaming: boolean; maxContextTokens?: number; supportsJapanese: boolean; supportsSystemMessages: boolean; }
export interface AiProvider { id: string; model: string; capabilities: AiModelCapabilities; complete(input: { system: string; user: string; signal: AbortSignal }): Promise<string>; }
