import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import {
  dailyReadingLearningContextSchema,
  generatedDailyReadingSchema,
  type DailyReadingLearningContext,
  type GeneratedDailyReading,
  type StoredDailyReading,
} from './schemas';

const storedRowSchema = z.object({
  id: z.string().min(1),
  reading_date: z.string(),
  level: z.enum(['N5', 'N4']),
  payload: z.unknown(),
  series_id: z.string().nullable(),
  episode_number: z.number().int().nullable(),
  previous_episode_id: z.string().nullable(),
  generated_at: z.string(),
}).passthrough();

function serviceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error('Daily Reading storage is not configured.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function mapStoredRow(value: unknown): StoredDailyReading {
  const row = storedRowSchema.parse(value);
  const payload = generatedDailyReadingSchema.parse(row.payload);
  return {
    ...payload,
    seriesId: row.series_id ?? undefined,
    episodeNumber: row.episode_number ?? undefined,
    previousEpisodeId: row.previous_episode_id ?? undefined,
    id: row.id,
    generatedAt: row.generated_at,
  };
}

export async function getStoredDailyReading(
  date: string,
  level: 'N5' | 'N4',
  client = serviceClient(),
): Promise<StoredDailyReading | undefined> {
  const { data, error } = await client
    .from('daily_readings')
    .select('id, reading_date, level, payload, series_id, episode_number, previous_episode_id, generated_at')
    .eq('reading_date', date)
    .eq('level', level)
    .maybeSingle();
  if (error) throw new Error('Today’s reading could not be loaded.');
  return data ? mapStoredRow(data) : undefined;
}

export async function saveDailyReadingContext(
  level: 'N5' | 'N4',
  context: DailyReadingLearningContext,
  client = serviceClient(),
): Promise<void> {
  const validated = dailyReadingLearningContextSchema.parse(context);
  const { error } = await client.from('daily_reading_generation_contexts').upsert({
    level,
    context_json: validated,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'level' });
  if (error) throw new Error('Daily Reading context could not be saved.');
}

export async function getLatestDailyReadingContext(
  level: 'N5' | 'N4',
  client = serviceClient(),
): Promise<DailyReadingLearningContext | undefined> {
  const { data, error } = await client
    .from('daily_reading_generation_contexts')
    .select('context_json')
    .eq('level', level)
    .maybeSingle();
  if (error) throw new Error('Daily Reading context could not be loaded.');
  if (!data) return undefined;
  return dailyReadingLearningContextSchema.parse((data as { context_json: unknown }).context_json);
}

export async function claimDailyReadingGeneration(
  date: string,
  level: 'N5' | 'N4',
  lockToken: string,
  client = serviceClient(),
): Promise<boolean> {
  const now = new Date();
  const { error } = await client.from('daily_reading_generation_claims').insert({
    reading_date: date,
    level,
    lock_token: lockToken,
    status: 'generating',
    started_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
  if (!error) return true;
  if (error.code !== '23505') throw new Error('Daily Reading generation could not be reserved.');

  const staleBefore = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const { data: claimed, error: retryError } = await client
    .from('daily_reading_generation_claims')
    .update({ lock_token: lockToken, status: 'generating', started_at: now.toISOString(), updated_at: now.toISOString() })
    .eq('reading_date', date)
    .eq('level', level)
    .lt('updated_at', staleBefore)
    .select('lock_token')
    .maybeSingle();
  if (retryError) throw new Error('Daily Reading generation could not be reserved.');
  return Boolean(claimed);
}

export async function publishDailyReading(
  reading: GeneratedDailyReading,
  lockToken: string,
  client = serviceClient(),
): Promise<StoredDailyReading> {
  const generatedAt = new Date().toISOString();
  const id = `daily-reading-${reading.date}-${reading.level.toLowerCase()}`;
  const { data, error } = await client.from('daily_readings').insert({
    id,
    reading_date: reading.date,
    level: reading.level,
    reading_type: reading.type,
    title: reading.title,
    payload: reading,
    series_id: reading.seriesId ?? null,
    episode_number: reading.episodeNumber ?? null,
    previous_episode_id: reading.previousEpisodeId ?? null,
    generated_at: generatedAt,
  }).select('id, reading_date, level, payload, series_id, episode_number, previous_episode_id, generated_at').single();
  if (error) {
    if (error.code === '23505') {
      const existing = await getStoredDailyReading(reading.date, reading.level, client);
      if (existing) return existing;
    }
    throw new Error('The validated Daily Reading could not be saved.');
  }
  await client.from('daily_reading_generation_claims').update({
    status: 'published',
    updated_at: generatedAt,
  }).eq('reading_date', reading.date).eq('level', reading.level).eq('lock_token', lockToken);
  return mapStoredRow(data);
}

export async function releaseDailyReadingClaim(
  date: string,
  level: 'N5' | 'N4',
  lockToken: string,
  client = serviceClient(),
): Promise<void> {
  await client.from('daily_reading_generation_claims')
    .delete()
    .eq('reading_date', date)
    .eq('level', level)
    .eq('lock_token', lockToken);
}
