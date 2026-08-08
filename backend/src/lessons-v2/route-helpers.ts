import { ZodError } from 'zod';

import { AiServerError } from '../ai/errors';
import { loadLessonsV2Authorization, LessonsV2AuthorizationError } from './authorization';
import { LessonsV2Error } from './errors';

export async function assertLessonsV2ManagementAccess(request: Request): Promise<void> {
  await loadLessonsV2Authorization().assertManagementAccess(request);
}

export function lessonsV2ErrorResponse(error: unknown): Response {
  if (error instanceof ZodError) {
    return Response.json({ success: false, error: { code: 'INVALID_INPUT', message: 'The Lessons V2 request is invalid.' } }, { status: 400 });
  }
  if (error instanceof LessonsV2AuthorizationError) {
    return Response.json({ success: false, error: { code: error.code, message: error.message } }, { status: 503 });
  }
  if (error instanceof LessonsV2Error) {
    return Response.json({ success: false, error: { code: error.code, message: error.userMessage } }, { status: error.status });
  }
  if (error instanceof AiServerError) {
    return Response.json({ success: false, error: { code: error.code, message: error.userMessage } }, { status: error.code === 'INVALID_INPUT' ? 400 : 503 });
  }
  return Response.json({ success: false, error: { code: 'LESSONS_V2_FAILED', message: 'Lessons V2 could not complete that request.' } }, { status: 500 });
}

export async function confirmed(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json() as unknown;
  if (!body || typeof body !== 'object' || !('confirm' in body) || body.confirm !== true) {
    throw new LessonsV2Error('VALIDATION_FAILED', 'Confirm this destructive Lessons V2 action before continuing.', 400);
  }
  return body as Record<string, unknown>;
}
