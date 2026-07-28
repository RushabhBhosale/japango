import type * as SQLite from 'expo-sqlite';

export const FSRS_SCHEDULER_VERSION = 'japango-fsrs-1';

export async function ensureFsrsCards(
  database: SQLite.SQLiteDatabase,
  curriculumSources: readonly string[] = ['bundled', 'course-support'],
): Promise<void> {
  if (!curriculumSources.length) return;
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT OR IGNORE INTO fsrs_cards
      (user_id, item_id, state, stability, difficulty, retrievability, due_at, last_reviewed_at,
       repetitions, lapses, last_rating, scheduled_days, elapsed_days, scheduler_version, updated_at)
     SELECT m.user_id, m.item_id,
       CASE WHEN m.correct_count + m.incorrect_count = 0 THEN 'new' ELSE 'review' END,
       CASE WHEN m.review_interval_days > 0 THEN m.review_interval_days ELSE 1 END,
       5, 1, COALESCE(m.next_review_at, ?), m.last_reviewed_at,
       m.correct_count + m.incorrect_count, m.incorrect_count, NULL,
       m.review_interval_days, 0, ?, ?
     FROM user_mastery AS m
     INNER JOIN curriculum_items AS items ON items.id = m.item_id
     WHERE items.curriculum_source IN (${curriculumSources.map(() => '?').join(', ')})
       AND items.release_ready = 1`,
    now,
    FSRS_SCHEDULER_VERSION,
    now,
    ...curriculumSources,
  );
}
