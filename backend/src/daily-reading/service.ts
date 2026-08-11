import { createServerProviderRegistry } from '../ai/orchestrator';
import { generateDailyReading } from './generator';
import type { DailyReadingGenerationRequest, StoredDailyReading } from './schemas';
import {
  claimDailyReadingGeneration,
  getStoredDailyReading,
  publishDailyReading,
  releaseDailyReadingClaim,
  saveDailyReadingContext,
} from './storage';

export type DailyReadingPreparation =
  | { status: 'ready'; reading: StoredDailyReading }
  | { status: 'generating' };

export async function prepareDailyReading(
  request: DailyReadingGenerationRequest,
  signal: AbortSignal,
): Promise<DailyReadingPreparation> {
  await saveDailyReadingContext(request.level, request.context);
  const existing = await getStoredDailyReading(request.date, request.level);
  if (existing) return { status: 'ready', reading: existing };

  const lockToken = crypto.randomUUID();
  const claimed = await claimDailyReadingGeneration(request.date, request.level, lockToken);
  if (!claimed) {
    const published = await getStoredDailyReading(request.date, request.level);
    return published ? { status: 'ready', reading: published } : { status: 'generating' };
  }

  try {
    const generated = await generateDailyReading(request, createServerProviderRegistry(), signal);
    return { status: 'ready', reading: await publishDailyReading(generated, lockToken) };
  } catch (error) {
    await releaseDailyReadingClaim(request.date, request.level, lockToken);
    throw error;
  }
}
