import type { StudyLibraryContentType, StudyLibraryHistoryItem } from '@/types/study-library';
import { createLocalId } from '@/utils/id';

import { getDatabase } from './database';
import { getLearnerProfile } from './profile-repository';

export async function recordStudyContentView(
  itemId: string,
  type: StudyLibraryContentType,
  scrollPosition?: number,
): Promise<void> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  await database.runAsync(
    `INSERT INTO study_content_views (id, user_id, item_id, content_type, viewed_at, scroll_position)
     VALUES (?, ?, ?, ?, ?, ?)`,
    createLocalId('study-view'),
    profile.id,
    itemId,
    type,
    new Date().toISOString(),
    scrollPosition ?? null,
  );
}

export async function getRecentlyViewedStudyContent(limit = 6): Promise<StudyLibraryHistoryItem[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string;
    item_id: string;
    content_type: StudyLibraryContentType;
    level: 'N5' | 'N4';
    title: string;
    meaning: string | null;
    reading: string | null;
    viewed_at: string;
  }>(`
    SELECT views.id, views.item_id, views.content_type, items.level, items.title, items.meaning, items.reading, views.viewed_at
    FROM study_content_views AS views
    INNER JOIN curriculum_items AS items ON items.id = views.item_id
    INNER JOIN (
      SELECT item_id, MAX(viewed_at) AS last_viewed_at
      FROM study_content_views
      WHERE user_id = (SELECT id FROM learner_profile LIMIT 1)
      GROUP BY item_id
    ) AS latest ON latest.item_id = views.item_id AND latest.last_viewed_at = views.viewed_at
    WHERE views.user_id = (SELECT id FROM learner_profile LIMIT 1)
      AND items.curriculum_source = 'bundled' AND items.release_ready = 1
    ORDER BY views.viewed_at DESC
    LIMIT ?
  `, Math.max(1, Math.min(limit, 20)));
  return rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    type: row.content_type,
    level: row.level,
    title: row.title,
    meaning: row.meaning ?? undefined,
    reading: row.reading ?? undefined,
    viewedAt: row.viewed_at,
  }));
}
