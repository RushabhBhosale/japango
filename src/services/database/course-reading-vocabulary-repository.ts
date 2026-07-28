import type * as SQLite from 'expo-sqlite';

import { courseReadingVocabulary } from '@/features/curriculum/course-reading-vocabulary';

import { insertSqlRows } from './sql-batch';

export const courseReadingVocabularySource = 'course-support';
const courseReadingVocabularyVersion = 'course-reading-vocabulary-v1';

/** Installs course-passage vocabulary alongside, never instead of, the release bundle. */
export async function installCourseReadingVocabulary(database: SQLite.SQLiteDatabase): Promise<void> {
  await insertSqlRows(
    database,
    `INSERT INTO curriculum_items
      (id, type, level, title, meaning, reading, explanation, tags_json,
       curriculum_source, release_ready, bundled_content_version)
     VALUES`,
    courseReadingVocabulary.map((item) => [
      item.id, item.type, item.level, item.title, item.meaning ?? null,
      item.reading ?? null, item.explanation ?? null, JSON.stringify(item.tags),
      courseReadingVocabularySource, 1, courseReadingVocabularyVersion,
    ]),
    `ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      level = excluded.level,
      title = excluded.title,
      meaning = excluded.meaning,
      reading = excluded.reading,
      explanation = excluded.explanation,
      tags_json = excluded.tags_json,
      curriculum_source = excluded.curriculum_source,
      release_ready = excluded.release_ready,
      bundled_content_version = excluded.bundled_content_version`,
  );

  await insertSqlRows(
    database,
    `INSERT INTO vocabulary_content_details
      (vocabulary_id, part_of_speech_json, kanji_ids_json, bundled_content_version)
     VALUES`,
    courseReadingVocabulary.map((item) => [
      item.id, JSON.stringify(item.partOfSpeech), JSON.stringify([]), courseReadingVocabularyVersion,
    ]),
    `ON CONFLICT(vocabulary_id) DO UPDATE SET
      part_of_speech_json = excluded.part_of_speech_json,
      kanji_ids_json = excluded.kanji_ids_json,
      bundled_content_version = excluded.bundled_content_version`,
  );

  const profile = await database.getFirstAsync<{ id: string }>('SELECT id FROM learner_profile LIMIT 1');
  if (!profile) return;
  await insertSqlRows(
    database,
    'INSERT OR IGNORE INTO user_mastery (user_id, item_id) VALUES',
    courseReadingVocabulary.map((item) => [profile.id, item.id]),
  );
}
