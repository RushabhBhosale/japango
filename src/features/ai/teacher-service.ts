import { aiTeacherResponseSchema, type AiFeature, type AiLessonContext, type AiTeacherRequest, type AiTeacherResult, AiClientError } from '@/types/ai';
import { createLocalId } from '@/utils/id';

import { getAiCachedResponse, saveAiInteraction, saveAiResponseCache, saveFailedAiDraft } from '@/services/database/ai-repository';
import { deterministicAiFallback } from './fallbacks';

const inFlight = new Map<string, Promise<AiTeacherResult>>();
const cacheable = new Set<AiFeature>(['explain_vocabulary', 'explain_grammar', 'explain_kanji', 'reading_coach', 'listening_coach', 'generate_examples']);
const promptVersions: Record<AiFeature, string> = { explain_vocabulary: 'AI_PROMPT_EXPLAIN_VOCABULARY_V2', explain_grammar: 'AI_PROMPT_EXPLAIN_GRAMMAR_V2', explain_kanji: 'AI_PROMPT_EXPLAIN_KANJI_V2', explain_mistake: 'AI_PROMPT_EXPLAIN_MISTAKE_V2', reading_coach: 'AI_PROMPT_READING_COACH_V2', listening_coach: 'AI_PROMPT_LISTENING_COACH_V2', conversation: 'AI_PROMPT_CONVERSATION_V2', writing_check: 'AI_PROMPT_WRITING_V2', generate_examples: 'AI_PROMPT_NATURAL_EXAMPLES_V2', study_plan: 'AI_PROMPT_STUDY_PLAN_V2' };

function fingerprint(feature: AiFeature, context: AiLessonContext, userInput: string | undefined): string { return `${promptVersions[feature]}:${feature}:${context.item?.id ?? 'none'}:${context.learnerLevel}:${userInput?.trim().toLowerCase() ?? ''}`; }
function endpoint(): string | undefined { const base = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/u, ''); return base ? `${base}/api/ai/teacher` : undefined; }

export async function askAiTeacher(feature: AiFeature, context: AiLessonContext, userInput?: string, signal?: AbortSignal): Promise<AiTeacherResult> {
  const trimmed = userInput?.trim(); if (trimmed && trimmed.length > 1200) throw new AiClientError('INVALID_INPUT', false, 'Please keep your message under 1,200 characters.');
  const key = fingerprint(feature, context, trimmed); const cached = cacheable.has(feature) ? await getAiCachedResponse(key) : undefined;
  if (cached && cached.expiresAt > new Date().toISOString()) return { response: cached.response, source: 'cache' };
  const existing = inFlight.get(key); if (existing) return existing;
  const task = (async () => { const request: AiTeacherRequest = { feature, context, userInput: trimmed, requestId: createLocalId('ai-request'), promptVersion: promptVersions[feature] }; const url = endpoint(); if (!url || signal?.aborted) { const fallback = deterministicAiFallback(feature, context); await saveAiInteraction(request, fallback.response, 'offline-fallback', false, true); return fallback; }
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 12_000); const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    try { const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request), signal: controller.signal }); const body = await response.json() as { success?: boolean; data?: unknown; error?: { code?: string; retryable?: boolean; userMessage?: string }; meta?: { fallbackUsed?: boolean } }; if (!body.success) throw new AiClientError((body.error?.code as AiClientError['code']) ?? 'PROVIDER_UNAVAILABLE', Boolean(body.error?.retryable), body.error?.userMessage ?? 'Your AI teacher is temporarily unavailable.'); const result = { response: aiTeacherResponseSchema.parse(body.data), source: 'network' as const, fallbackUsed: body.meta?.fallbackUsed }; await saveAiInteraction(request, result.response, 'completed', false, Boolean(result.fallbackUsed)); if (cacheable.has(feature)) await saveAiResponseCache(key, request, result.response); return result; } catch (error) { if (signal?.aborted) throw new AiClientError('CANCELLED', false, 'The AI request was cancelled.'); await saveFailedAiDraft(request, error instanceof AiClientError ? error.code : 'UNKNOWN'); const fallback = deterministicAiFallback(feature, context); await saveAiInteraction(request, fallback.response, 'offline-fallback', false, true); return fallback; } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
  })();
  inFlight.set(key, task); try { return await task; } finally { inFlight.delete(key); }
}

export function promptVersionFor(feature: AiFeature): string { return promptVersions[feature]; }
