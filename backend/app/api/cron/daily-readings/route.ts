import { createServerProviderRegistry } from '../../../../src/ai/orchestrator';
import { generateDailyReading } from '../../../../src/daily-reading/generator';
import {
  claimDailyReadingGeneration,
  getLatestDailyReadingContext,
  getStoredDailyReading,
  publishDailyReading,
  releaseDailyReadingClaim,
} from '../../../../src/daily-reading/storage';

function dateInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } }, { status: 401 });
  }
  const date = dateInTimeZone(process.env.DAILY_READING_TIME_ZONE ?? 'Asia/Tokyo');
  const results: Record<'N5' | 'N4', string> = { N5: 'skipped', N4: 'skipped' };
  for (const level of ['N5', 'N4'] as const) {
    const existing = await getStoredDailyReading(date, level);
    if (existing) {
      results[level] = 'already-published';
      continue;
    }
    const context = await getLatestDailyReadingContext(level);
    if (!context) continue;
    const lockToken = crypto.randomUUID();
    if (!await claimDailyReadingGeneration(date, level, lockToken)) {
      results[level] = 'already-generating';
      continue;
    }
    try {
      const reading = await generateDailyReading({ date, level, context }, createServerProviderRegistry(), request.signal);
      await publishDailyReading(reading, lockToken);
      results[level] = 'published';
    } catch (error) {
      await releaseDailyReadingClaim(date, level, lockToken);
      console.error('[Daily Reading cron] Generation failed', { level, error: error instanceof Error ? error.message : String(error) });
      results[level] = 'failed';
    }
  }
  return Response.json({ success: true, data: { date, results } });
}
