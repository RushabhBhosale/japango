import * as SQLite from 'expo-sqlite';

import { assessmentQuestionSeed } from '@/features/assessment/seed';
import { n5CurriculumSeed } from '@/features/curriculum/seed';
import { createLocalId } from '@/utils/id';

import { installBundledCurriculumIfNeeded } from './bundled-curriculum-repository';
import { ensureFsrsCards } from './fsrs-bootstrap';
import { runMigrations } from './migrations';

const DATABASE_NAME = 'japango.db';
const initialContentInstallationDelayMs = 3_000;
let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function runStartupStage<T>(name: string, work: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await work();
  } finally {
    if (__DEV__) console.info(`[JapanGo startup] ${name} completed in ${Date.now() - startedAt}ms`);
  }
}

function scheduleLearningContentInstallation(database: SQLite.SQLiteDatabase): void {
  // Content imports can involve thousands of authored rows. Keep them off the
  // startup path: the app already has its schema, learner profile, and core N5
  // data by this point, while feature screens retain their normal loading UI.
  setTimeout(() => {
    void (async () => {
      await runStartupStage('install bundled curriculum', () => installBundledCurriculumIfNeeded(database));
      await runStartupStage('prepare FSRS cards', () => ensureFsrsCards(database));
    })().catch((error: unknown) => {
      console.error(
        '[JapanGo database] Background learning content installation failed',
        error instanceof Error ? { name: error.name, message: error.message } : String(error),
      );
    });
  }, initialContentInstallationDelayMs);
}

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
  const database = await runStartupStage('open local database', () => SQLite.openDatabaseAsync(DATABASE_NAME));
  await runStartupStage('configure local database', () => database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;'));
  await runStartupStage('apply database migrations', () => runMigrations(database));
  await runStartupStage('seed core learning data', () => seedDatabase(database));
  scheduleLearningContentInstallation(database);
  return database;
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openAndPrepareDatabase().catch((error: unknown) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

export async function initializeDatabase(): Promise<void> {
  await getDatabase();
}
