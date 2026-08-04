import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { AudioLessonsError } from './errors';

export function createAudioLessonsSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new AudioLessonsError('CONFIGURATION_ERROR', 'Audio Lessons storage is not configured.', 503);
  }
  return createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function throwAudioLessonsDatabaseError(error: { code?: string | null; message?: string; details?: string | null; hint?: string | null }): never {
  console.error('[audio-lessons-db]', {
    code: error.code ?? 'unknown',
    message: error.message ?? 'Unknown database error.',
    details: error.details ?? undefined,
    hint: error.hint ?? undefined,
  });
  throw new AudioLessonsError(
    'DATABASE_ERROR',
    error.code === '23505' ? 'That Audio Lesson record already exists.' : 'Audio Lesson data could not be saved.',
    error.code === '23505' ? 409 : 502,
  );
}
