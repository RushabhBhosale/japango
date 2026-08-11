import { dailyReadingApiErrorResponseSchema, dailyReadingApiResponseSchema } from './schemas';
import {
  buildDailyReadingLearningContext,
  cacheDailyReading,
  getCachedDailyReading,
} from '@/services/database/daily-reading-repository';
import type { DailyReading } from '@/types/daily-reading';
import type { LearnerProfile, CurriculumLevel } from '@/types/learning';
import type { V3LearnerState } from '@/types/lesson-v3';

export class DailyReadingUnavailableError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'DailyReadingUnavailableError';
  }
}

export function resolveDailyReadingLevel(
  profile?: LearnerProfile,
  learner?: V3LearnerState,
): CurriculumLevel {
  if (profile?.learnerLevel === 'Ready to begin N4 gradually') return 'N4';
  if (learner?.assessmentResult?.startingLevel === 'Around N4') return 'N4';
  if (learner?.selfReportedLevel === 'n4' || learner?.selfReportedLevel === 'n3-plus') return 'N4';
  return 'N5';
}

function endpoint(path: string): string | undefined {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/u, '');
  return base ? `${base}${path}` : undefined;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const body = await response.text();
  if (!body.trim()) {
    throw new DailyReadingUnavailableError(
      'The lesson service returned an empty response. Your saved readings are still available.',
      true,
    );
  }
  if (!contentType.includes('application/json')) {
    throw new DailyReadingUnavailableError(
      response.status === 404
        ? 'Daily Reading is not available from the lesson service yet. Your saved readings are still available.'
        : 'The lesson service returned an unreadable response. Your saved readings are still available.',
      response.status !== 404,
    );
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new DailyReadingUnavailableError(
      'The lesson service returned invalid data. Your saved readings are still available.',
      true,
    );
  }
}

async function parseReadingResponse(
  response: Response,
  allowMissing = false,
): Promise<DailyReading | undefined> {
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    const error = dailyReadingApiErrorResponseSchema.safeParse(payload);
    if (allowMissing && response.status === 404 && error.success && error.data.error.code === 'DAILY_READING_NOT_FOUND') {
      return undefined;
    }
    throw new DailyReadingUnavailableError(
      error.success
        ? error.data.error.userMessage ?? 'Today’s reading could not be downloaded. Your saved readings are still available.'
        : 'The lesson service returned an unexpected response. Your saved readings are still available.',
      error.success ? Boolean(error.data.error.retryable) : true,
    );
  }
  const parsed = dailyReadingApiResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new DailyReadingUnavailableError(
      'The lesson service returned an unsupported reading. Your saved readings are still available.',
      true,
    );
  }
  return parsed.data.data;
}

async function requestReading(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new DailyReadingUnavailableError(
      'Today’s reading could not reach the lesson service. Your saved readings are still available.',
      true,
    );
  }
}

export async function loadTodayDailyReading(
  date: string,
  level: CurriculumLevel,
  signal?: AbortSignal,
): Promise<DailyReading> {
  const cached = await getCachedDailyReading(date, level);
  if (cached) return cached;
  const url = endpoint(`/api/daily-readings/today?date=${encodeURIComponent(date)}&level=${level}`);
  if (!url) {
    throw new DailyReadingUnavailableError('Connect the lesson service to prepare today’s reading.', false);
  }

  const existingResponse = await requestReading(url, { signal });
  const existing = await parseReadingResponse(existingResponse, true);
  if (existing) return cacheDailyReading(existing);

  const context = await buildDailyReadingLearningContext(level);
  const generatedResponse = await requestReading(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ date, level, context }),
    signal,
  });
  const generated = await parseReadingResponse(generatedResponse);
  if (!generated) {
    throw new DailyReadingUnavailableError('Today’s reading is not ready yet. Please try again shortly.', true);
  }
  return cacheDailyReading(generated);
}
