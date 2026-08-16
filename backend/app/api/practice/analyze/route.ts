import { z } from 'zod';

import { createServerProviderRegistry } from '../../../../src/ai/orchestrator';
import { AiServerError } from '../../../../src/ai/errors';
import { analyzePracticeSessions } from '../../../../src/practice/analyzer';
import { practiceAnalysisRequestSchema } from '../../../../src/practice/schemas';

export const maxDuration = 60;

const requestsByClient = new Map<string, { count: number; resetAt: number }>();
const limitWindowMs = 60 * 60 * 1_000;
const limitPerWindow = 12;

function allowed(request: Request): boolean {
  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
  const now = Date.now();
  const current = requestsByClient.get(client);
  if (!current || current.resetAt <= now) {
    requestsByClient.set(client, { count: 1, resetAt: now + limitWindowMs });
    return true;
  }
  if (current.count >= limitPerWindow) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request): Promise<Response> {
  if (!allowed(request)) {
    return Response.json({ success: false, error: { code: 'RATE_LIMITED', retryable: true, message: 'Practice analysis is busy. Nothing was imported; try again shortly.' } }, { status: 429 });
  }
  try {
    const payload = practiceAnalysisRequestSchema.parse(await request.json() as unknown);
    const result = await analyzePracticeSessions(payload, createServerProviderRegistry(), request.signal);
    return Response.json({ success: true, data: result.response, meta: { fallbackUsed: result.fallbackUsed } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ success: false, error: { code: 'INVALID_INPUT', retryable: false, message: 'The practice log data could not be analyzed.' } }, { status: 400 });
    }
    const safe = error instanceof AiServerError
      ? error
      : new AiServerError('UNKNOWN', false, 'Practice analysis could not be completed. Nothing was imported.');
    return Response.json(
      { success: false, error: { code: safe.code, retryable: safe.retryable, message: safe.userMessage } },
      { status: safe.code === 'AUTH_CONFIGURATION_ERROR' ? 503 : 502 },
    );
  }
}
