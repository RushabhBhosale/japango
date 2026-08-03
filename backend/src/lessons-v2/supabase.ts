import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { LessonsV2Error } from './errors';

export interface LessonsV2SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export function loadLessonsV2SupabaseConfig(): LessonsV2SupabaseConfig {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new LessonsV2Error('CONFIGURATION_ERROR', 'Lessons V2 storage is not configured.', 503);
  }
  return { url, serviceRoleKey };
}

export function createLessonsV2SupabaseClient(): SupabaseClient {
  const config = loadLessonsV2SupabaseConfig();
  return createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function throwLessonsV2DatabaseError(error: { message: string; code?: string | null }): never {
  throw new LessonsV2Error('DATABASE_ERROR', error.code === '23505' ? 'That Lessons V2 record already exists.' : 'Lessons V2 data could not be saved.', error.code === '23505' ? 409 : 502);
}
