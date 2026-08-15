import { z } from 'zod';

import { deviceRegistrationSchema } from '../../../../../src/ai-chat/proactive/schemas';
import { registerChatDevice } from '../../../../../src/ai-chat/proactive/storage';

const requestsByClient = new Map<string, { count: number; resetAt: number }>();

function allowed(request: Request): boolean {
  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
  const now = Date.now();
  const current = requestsByClient.get(client);
  if (!current || current.resetAt <= now) {
    requestsByClient.set(client, { count: 1, resetAt: now + 60 * 60 * 1_000 });
    return true;
  }
  if (current.count >= 12) return false;
  current.count += 1;
  return true;
}

export async function POST(request: Request): Promise<Response> {
  if (!allowed(request)) {
    return Response.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Notification setup is busy right now.' } }, { status: 429 });
  }
  try {
    const input = deviceRegistrationSchema.parse(await request.json() as unknown);
    await registerChatDevice(input);
    return Response.json({ success: true, data: {} });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Notification setup details were invalid.' } }, { status: 400 });
    }
    return Response.json({ success: false, error: { code: 'REGISTRATION_FAILED', message: 'Notification setup could not be saved.' } }, { status: 502 });
  }
}
