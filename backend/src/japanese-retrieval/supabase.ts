import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { JapaneseRetrievalConfig } from './config';
import { JapaneseRetrievalError } from './errors';

export function createJapaneseRetrievalSupabaseClient(
  config: JapaneseRetrievalConfig,
): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function asDatabaseError(error: { message: string; code?: string | null }): JapaneseRetrievalError {
  return new JapaneseRetrievalError(
    'DATABASE_ERROR',
    error.code === '57014' || error.code === 'PGRST003',
    'Japanese search is temporarily unavailable.',
  );
}
