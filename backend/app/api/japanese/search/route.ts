import { ZodError } from 'zod';

import { JapaneseRetrievalError } from '../../../../src/japanese-retrieval/errors';
import { japaneseSearchRequestSchema, searchJapaneseOcr } from '../../../../src/japanese-retrieval/search';

const requestsByClient = new Map<string, { count: number; resetAt: number }>();
const limitWindowMs = 60 * 60 * 1000;
const limitPerWindow = 60;

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
    return Response.json(
      { success: false, error: { code: 'RATE_LIMITED', retryable: true, userMessage: 'Japanese search is busy right now. Please try again soon.' } },
      { status: 429 },
    );
  }

  try {
    const payload = japaneseSearchRequestSchema.parse(await request.json() as unknown);
    const results = await searchJapaneseOcr(payload);
    return Response.json({ success: true, data: { results } });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { success: false, error: { code: 'INVALID_INPUT', retryable: false, userMessage: 'Enter a valid Japanese search query.' } },
        { status: 400 },
      );
    }
    const safe = error instanceof JapaneseRetrievalError
      ? error
      : new JapaneseRetrievalError('DATABASE_ERROR', true, 'Japanese search could not be completed.');
    return Response.json(
      { success: false, error: { code: safe.code, retryable: safe.retryable, userMessage: safe.userMessage } },
      { status: safe.code === 'CONFIGURATION_ERROR' ? 503 : 502 },
    );
  }
}
