import * as SQLite from 'expo-sqlite';

import { assessmentQuestionSeed } from '@/features/assessment/seed';
import { n5CurriculumSeed } from '@/features/curriculum/seed';
import { createLocalId } from '@/utils/id';

import { installBundledCurriculumIfNeeded } from './bundled-curriculum-repository';
import { ensureFsrsCards } from './fsrs-repository';
import { runMigrations } from './migrations';

const DATABASE_NAME = 'japango.db';
let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function seedDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.withTransactionAsync(async () => {
    for (const item of n5CurriculumSeed) {
      await database.runAsync(
        `INSERT OR IGNORE INTO curriculum_items
          (id, type, level, title, meaning, reading, explanation, tags_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        item.id,
        item.type,
        item.level,
        item.title,
        item.meaning ?? null,
        item.reading ?? null,
        item.explanation ?? null,
        JSON.stringify(item.tags),
      );
    }

    for (const question of assessmentQuestionSeed) {
      await database.runAsync(
        `INSERT OR IGNORE INTO assessment_questions
          (id, position, type, category, curriculum_item_id, prompt, passage,
           options_json, correct_option_id, explanation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        question.id,
        question.position,
        question.type,
        question.category,
        question.curriculumItemId,
        question.prompt,
        question.type === 'short-reading' ? question.passage : null,
        JSON.stringify(question.options),
        question.correctOptionId,
        question.explanation,
      );
    }

    const profile = await database.getFirstAsync<{ id: string }>('SELECT id FROM learner_profile LIMIT 1');
    const now = new Date().toISOString();
    const userId = profile?.id ?? createLocalId('learner');
    await database.runAsync(
      `INSERT OR IGNORE INTO learner_profile
        (id, display_name, daily_goal_minutes, onboarding_completed, assessment_completed,
         created_at, updated_at)
       VALUES (?, ?, 10, 0, 0, ?, ?)`,
      userId,
      '',
      now,
      now,
    );

    await database.runAsync(
      `INSERT OR IGNORE INTO user_mastery (user_id, item_id)
       SELECT ?, id FROM curriculum_items`,
      userId,
    );
    await database.runAsync(
      `INSERT OR IGNORE INTO app_settings (key, value_json, updated_at)
       VALUES ('theme_preference', '"system"', ?)`,
      now,
    );
    await database.runAsync(
      `INSERT OR IGNORE INTO app_settings (key, value_json, updated_at)
       VALUES ('assessment_index', '0', ?)`,
      now,
    );
  });
}

async function openAndPrepareDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await runMigrations(database);
  await seedDatabase(database);
  await installBundledCurriculumIfNeeded(database);
  await ensureFsrsCards(database);
  return database;
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  databasePromise ??= openAndPrepareDatabase();
  return databasePromise;
}

export async function initializeDatabase(): Promise<void> {
  await getDatabase();
}
