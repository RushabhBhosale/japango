import { z } from 'zod';

export const aiFeatureSchema = z.enum(['explain_vocabulary', 'explain_grammar', 'explain_kanji', 'explain_mistake', 'reading_coach', 'listening_coach', 'conversation', 'writing_check', 'generate_examples', 'study_plan']);
export type AiFeature = z.infer<typeof aiFeatureSchema>;
export const aiTeacherResponseSchema = z.object({ answer: z.string().trim().min(1).max(4000), japaneseExamples: z.array(z.object({ japanese: z.string().min(1), reading: z.string().optional(), translation: z.string().min(1), target: z.string().optional() }).strict()).max(5).optional(), corrections: z.array(z.object({ original: z.string().min(1), corrected: z.string().min(1), explanation: z.string().min(1), category: z.enum(['incorrect', 'unnatural', 'style']).optional() }).strict()).max(8).optional(), followUpSuggestions: z.array(z.string().min(1)).max(4).optional(), confidence: z.enum(['low', 'medium', 'high']).optional() }).strict();
export type AiTeacherResponse = z.infer<typeof aiTeacherResponseSchema>;
export interface AiLessonContext { learnerLevel: 'N5' | 'N4'; targetLevel?: 'N5' | 'N4'; item?: { id: string; type: string; title: string; meaning?: string; reading?: string; details?: string[] }; question?: { prompt: string; userAnswer?: string; correctAnswer?: string; canonicalExplanation?: string }; recentMistakes?: { concept: string; count: number }[]; deterministicPlan?: string[]; }
export interface AiTeacherRequest { feature: AiFeature; context: AiLessonContext; userInput?: string; requestId: string; promptVersion: string; }
export type AiRequestState = 'idle' | 'preparing' | 'generating' | 'retrying' | 'using_backup' | 'completed' | 'cancelled' | 'offline_fallback' | 'failed';
export interface AiTeacherResult { response: AiTeacherResponse; source: 'network' | 'cache' | 'fallback'; stale?: boolean; fallbackUsed?: boolean; }
export type AiErrorCode = 'OFFLINE' | 'TIMEOUT' | 'RATE_LIMITED' | 'PROVIDER_UNAVAILABLE' | 'INVALID_RESPONSE' | 'CONTEXT_TOO_LARGE' | 'AUTH_CONFIGURATION_ERROR' | 'SAFETY_REJECTION' | 'CANCELLED' | 'ALL_PROVIDERS_FAILED' | 'INVALID_INPUT' | 'UNKNOWN';
export class AiClientError extends Error { constructor(public readonly code: AiErrorCode, public readonly retryable: boolean, public readonly userMessage: string) { super(code); } }
