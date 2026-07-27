import { z } from 'zod';

import { AiOrchestrator, createServerProviderRegistry } from '../../../../src/ai/orchestrator';
import { AiServerError } from '../../../../src/ai/errors';
import { aiTeacherRequestSchema } from '../../../../src/ai/types';

const requestsByClient = new Map<string, { count: number; resetAt: number }>();
const limitWindowMs = 60 * 60 * 1000;
const limitPerWindow = 30;

function allowed(request: Request): boolean {
  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
  const now = Date.now(); const current = requestsByClient.get(client);
  if (!current || current.resetAt <= now) { requestsByClient.set(client, { count: 1, resetAt: now + limitWindowMs }); return true; }
  if (current.count >= limitPerWindow) return false;
  current.count += 1; return true;
}

export async function POST(request: Request): Promise<Response> {
  if (!allowed(request)) return Response.json({ success: false, error: { code: 'RATE_LIMITED', retryable: true, userMessage: 'The AI teacher is busy right now. Please try again soon.' } }, { status: 429 });
  try {
    const payload = aiTeacherRequestSchema.parse(await request.json() as unknown);
    const result = await new AiOrchestrator(createServerProviderRegistry()).run(payload, request.signal);
    return Response.json({ success: true, data: result.response, meta: { cached: false, fallbackUsed: result.fallbackUsed, latencyMs: result.latencyMs } });
  } catch (error) {
    const safe = error instanceof AiServerError ? error : new AiServerError('UNKNOWN', false, 'This request could not be completed.');
    return Response.json({ success: false, error: { code: safe.code, retryable: safe.retryable, userMessage: safe.userMessage } }, { status: safe.code === 'INVALID_INPUT' ? 400 : 503 });
  }
}
