import { z } from 'zod';

import { proactiveContextSchema } from '../../../../src/ai-chat/proactive/schemas';
import { saveProactiveContext } from '../../../../src/ai-chat/proactive/storage';

const requestsByClient = new Map<string, { count: number; resetAt: number }>();

function allowed(request: Request): boolean {
  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
  const now = Date.now();
  const current = requestsByClient.get(client);
  if (!current || current.resetAt <= now) {
    requestsByClient.set(client, { count: 1, resetAt: now + 60 * 60 * 1_000 });
    return true;
  }
  if (current.count >= 30) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request): Promise<Response> {
  if (!allowed(request)) {
    return Response.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Yui’s availability update is busy right now.' } }, { status: 429 });
  }
  try {
    const input = proactiveContextSchema.parse(await request.json() as unknown);
    await saveProactiveContext(input);
    return Response.json({ success: true, data: {} });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Yui’s availability update was invalid.' } }, { status: 400 });
    }
    return Response.json({ success: false, error: { code: 'CONTEXT_SAVE_FAILED', message: 'Yui’s availability update could not be saved.' } }, { status: 502 });
  }
}
