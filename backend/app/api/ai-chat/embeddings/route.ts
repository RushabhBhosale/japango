import { z } from 'zod';

import { embedAiChatTexts } from '../../../../src/ai-chat/embeddings';
import { AiChatServerError } from '../../../../src/ai-chat/errors';

const requestSchema = z.object({
  inputs: z.array(z.string().trim().min(1).max(1_200)).min(1).max(8),
}).strict();

const requestsByClient = new Map<string, { count: number; resetAt: number }>();

function allowed(request: Request): boolean {
  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
  const now = Date.now();
  const current = requestsByClient.get(client);
  if (!current || current.resetAt <= now) {
    requestsByClient.set(client, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (current.count >= 90) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request): Promise<Response> {
  if (!allowed(request)) {
    return Response.json({ success: false, error: { code: 'RATE_LIMITED', retryable: true, userMessage: 'Yui’s memory service is busy right now.' } }, { status: 429 });
  }
  try {
    const { inputs } = requestSchema.parse(await request.json() as unknown);
    const embeddings = await embedAiChatTexts(inputs, request.signal);
    return Response.json({ success: true, data: { embeddings } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ success: false, error: { code: 'INVALID_INPUT', retryable: false, userMessage: 'No valid chat text was supplied for memory.' } }, { status: 400 });
    }
    const safe = error instanceof AiChatServerError
      ? error
      : new AiChatServerError('PROVIDER_UNAVAILABLE', true, 'Yui’s memory service is unavailable right now.');
    return Response.json({ success: false, error: { code: safe.code, retryable: safe.retryable, userMessage: safe.userMessage } }, { status: safe.code === 'AUTH_CONFIGURATION_ERROR' ? 503 : 502 });
  }
}
