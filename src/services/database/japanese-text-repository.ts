import { furiganaPreferenceSchema } from '@/features/settings/schemas';
import type { FuriganaPreference, MasteryStatus } from '@/types/learning';

import { getDatabase } from './database';
import { getSetting, setSetting } from './settings-repository';

const furiganaPreferenceKey = 'japanese_text.furigana_preference';
const defaultFuriganaPreference: FuriganaPreference = 'off';
const contextualReadingCacheVersion = '2';
const textItemCache = new Map<string, JapaneseTextItem[]>();
const furiganaPreferenceListeners = new Set<(preference: FuriganaPreference) => void>();

export interface JapaneseTextItem {
  id: string;
  type: 'vocabulary' | 'kanji';
  title: string;
  reading?: string;
  meaning?: string;
  masteryStatus?: MasteryStatus;
}

interface JapaneseTextRow {
  id: string;
  type: 'vocabulary' | 'kanji';
  title: string;
  reading: string | null;
  meaning: string | null;
  status: MasteryStatus | null;
}

function hasKanji(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function kanjiCharacters(value: string): string[] {
  // A passage can introduce more than sixteen distinct kanji. Limiting this
  // list caused later words to skip the contextual matcher entirely, leaving
  // them as untappable plain text. SQLite supports this bounded per-passage
  // lookup comfortably below its parameter limit.
  return [...new Set(Array.from(value).filter((character) => hasKanji(character)))];
}

export async function getFuriganaPreference(): Promise<FuriganaPreference> {
  return (await getSetting(furiganaPreferenceKey, furiganaPreferenceSchema)) ?? defaultFuriganaPreference;
}

export async function setFuriganaPreference(preference: FuriganaPreference): Promise<void> {
  await setSetting(furiganaPreferenceKey, preference, furiganaPreferenceSchema);
  furiganaPreferenceListeners.forEach((listener) => listener(preference));
}

export function subscribeToFuriganaPreference(listener: (preference: FuriganaPreference) => void): () => void {
  furiganaPreferenceListeners.add(listener);
  return () => furiganaPreferenceListeners.delete(listener);
}

/**
 * Looks up only the Japanese words present in the displayed string. This keeps
 * lesson rendering lightweight while using the existing curriculum and mastery tables.
 */
export async function findJapaneseTextItems(text: string): Promise<JapaneseTextItem[]> {
  if (!hasKanji(text)) return [];
  const cacheKey = `${contextualReadingCacheVersion}\u0000${text}`;
  const cached = textItemCache.get(cacheKey);
  if (cached) return cached;
  const database = await getDatabase();
  const characters = kanjiCharacters(text);
  const characterClauses = characters.map(() => 'instr(c.title, ?) > 0').join(' OR ');
  const rows = await database.getAllAsync<JapaneseTextRow>(
    `SELECT c.id, c.type, c.title, c.reading, c.meaning, m.status
     FROM curriculum_items AS c
     LEFT JOIN learner_profile AS p ON 1 = 1
     LEFT JOIN user_mastery AS m ON m.item_id = c.id AND m.user_id = p.id
     WHERE c.type IN ('vocabulary', 'kanji')
       AND (instr(?, c.title) > 0 OR ${characterClauses})`,
    text,
    ...characters,
  );
  const items = rows
    .filter((row) => row.reading && row.title && hasKanji(row.title))
    .map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      reading: row.reading ?? undefined,
      meaning: row.meaning ?? undefined,
      masteryStatus: row.status ?? undefined,
    }))
    .sort((left, right) => {
      const byLength = right.title.length - left.title.length;
      if (byLength) return byLength;
      const byCourseSupport = Number(right.id.startsWith('course-vocab-')) - Number(left.id.startsWith('course-vocab-'));
      if (byCourseSupport) return byCourseSupport;
      if (left.type !== right.type) return left.type === 'vocabulary' ? -1 : 1;
      return left.title.localeCompare(right.title);
    });
  textItemCache.set(cacheKey, items);
  return items;
}
