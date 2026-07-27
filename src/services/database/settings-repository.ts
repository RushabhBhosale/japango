import type { z } from 'zod';

import { getDatabase } from './database';

export async function getSetting<T>(key: string, schema: z.ZodType<T>): Promise<T | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value_json: string }>(
    'SELECT value_json FROM app_settings WHERE key = ?',
    key,
  );
  if (!row) return undefined;
  return schema.parse(JSON.parse(row.value_json) as unknown);
}

export async function setSetting<T>(key: string, value: T, schema: z.ZodType<T>): Promise<void> {
  const parsed = schema.parse(value);
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO app_settings (key, value_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at = excluded.updated_at`,
    key,
    JSON.stringify(parsed),
    new Date().toISOString(),
  );
}
