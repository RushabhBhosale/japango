import { ZodError } from 'zod';

import { LessonsV2AuthorizationError } from '../lessons-v2/authorization';
import { assertLessonsV2ManagementAccess } from '../lessons-v2/route-helpers';
import { AudioLessonsError } from './errors';

/** Audio management shares the app's disabled-by-default local-development guard. */
export async function assertAudioLessonsManagementAccess(request: Request): Promise<void> {
  await assertLessonsV2ManagementAccess(request);
}

export function audioLessonsErrorResponse(error: unknown): Response {
  if (error instanceof ZodError) {
    return Response.json({ success: false, error: { code: 'INVALID_INPUT', message: 'The Audio Lessons request is invalid.' } }, { status: 400 });
  }
  if (error instanceof LessonsV2AuthorizationError) {
    return Response.json({ success: false, error: { code: error.code, message: error.message } }, { status: 503 });
  }
  if (error instanceof AudioLessonsError) {
    return Response.json({ success: false, error: { code: error.code, message: error.userMessage } }, { status: error.status });
  }
  return Response.json({ success: false, error: { code: 'AUDIO_LESSONS_FAILED', message: 'Audio Lessons could not complete that request.' } }, { status: 500 });
}

export async function confirmedAudioAction(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json() as unknown;
  if (!body || typeof body !== 'object' || !('confirm' in body) || body.confirm !== true) {
    throw new AudioLessonsError('VALIDATION_FAILED', 'Confirm this Audio Lessons action before continuing.', 400);
  }
  return body as Record<string, unknown>;
}
