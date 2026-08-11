import { z } from 'zod';

import { DailyReadingGenerationError } from '../../../../src/daily-reading/generator';
import {
  dailyReadingDateSchema,
  dailyReadingGenerationRequestSchema,
  dailyReadingLevelSchema,
} from '../../../../src/daily-reading/schemas';
import { prepareDailyReading } from '../../../../src/daily-reading/service';
import { getStoredDailyReading } from '../../../../src/daily-reading/storage';

const querySchema = z.object({ date: dailyReadingDateSchema, level: dailyReadingLevelSchema }).strict();
const requestsByClient = new Map<string, { count: number; resetAt: number }>();

function allowed(request: Request): boolean {
  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anonymous';
  const now = Date.now();
  const current = requestsByClient.get(client);
  if (!current || current.resetAt <= now) {
    requestsByClient.set(client, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (current.count >= 12) return false;
  current.count += 1;
  return true;
}

function errorResponse(code: string, userMessage: string, status: number, retryable = false): Response {
  return Response.json({ success: false, error: { code, userMessage, retryable } }, { status });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const query = querySchema.parse({ date: url.searchParams.get('date'), level: url.searchParams.get('level') });
    const reading = await getStoredDailyReading(query.date, query.level);
    if (!reading) return errorResponse('DAILY_READING_NOT_FOUND', 'Today’s reading has not been prepared yet.', 404, true);
    return Response.json({ success: true, data: reading });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse('INVALID_INPUT', 'Choose a valid date and JLPT level.', 400);
    return errorResponse('DAILY_READING_LOAD_FAILED', 'Today’s reading could not be downloaded. Your saved readings are still available.', 503, true);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!allowed(request)) return errorResponse('RATE_LIMITED', 'Today’s reading is being prepared. Please try again soon.', 429, true);
  try {
    const payload = dailyReadingGenerationRequestSchema.parse(await request.json() as unknown);
    const result = await prepareDailyReading(payload, request.signal);
    if (result.status === 'generating') {
      return errorResponse('GENERATION_IN_PROGRESS', 'Today’s reading is already being prepared. Please try again shortly.', 409, true);
    }
    return Response.json({ success: true, data: result.reading });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse('INVALID_INPUT', 'The learning context for today’s reading was invalid.', 400);
    if (error instanceof DailyReadingGenerationError) {
      console.warn('[Daily Reading] Rejected generated content', { errors: error.validationErrors });
      return errorResponse('DAILY_READING_VALIDATION_FAILED', 'A safe reading could not be prepared today. Please try again later.', 503, true);
    }
    console.error('[Daily Reading] Generation failed', error instanceof Error ? { name: error.name, message: error.message } : String(error));
    return errorResponse('DAILY_READING_GENERATION_FAILED', 'Today’s reading could not be prepared. Your saved readings are still available.', 503, true);
  }
}
