import { z } from 'zod';

import { AiChatServerError } from '../../../../../../src/ai-chat/errors';
import { createOpenRouterChatProviders } from '../../../../../../src/ai-chat/provider';
import { AiChatService } from '../../../../../../src/ai-chat/service';
import { aiChatRequestSchema } from '../../../../../../src/ai-chat/schemas';

export const maxDuration = 60;

const requestsByClient = new Map<string, { count: number; resetAt: number }>();
const limitWindowMs = 60 * 60 * 1000;
const limitPerWindow = 30;

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

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
): Promise<Response> {
  const { conversationId } = await context.params;
  if (conversationId !== 'yui-main') {
    return Response.json({ success: false, error: { code: 'NOT_FOUND', retryable: false, userMessage: 'This conversation is not available.' } }, { status: 404 });
  }
  if (!allowed(request)) {
    return Response.json({ success: false, error: { code: 'RATE_LIMITED', retryable: true, userMessage: 'Yui is busy right now. Please try again soon.' } }, { status: 429 });
  }
  try {
    const payload = aiChatRequestSchema.parse(await request.json() as unknown);
    const result = await new AiChatService(createOpenRouterChatProviders()).respond(payload, request.signal);
    return Response.json({ success: true, data: result.response, meta: { fallbackUsed: result.fallbackUsed } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ success: false, error: { code: 'INVALID_INPUT', retryable: false, userMessage: 'Write a message before sending it to Yui.' } }, { status: 400 });
    }
    const safe = error instanceof AiChatServerError
      ? error
      : new AiChatServerError('PROVIDER_UNAVAILABLE', true, 'Yui is unavailable right now. Please try again shortly.');
    return Response.json(
      { success: false, error: { code: safe.code, retryable: safe.retryable, userMessage: safe.userMessage } },
      { status: safe.code === 'AUTH_CONFIGURATION_ERROR' ? 503 : 502 },
    );
  }
}
