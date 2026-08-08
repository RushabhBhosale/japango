import * as SQLite from 'expo-sqlite';

import { assessmentQuestionSeed } from '@/features/assessment/seed';
import { n5CurriculumSeed } from '@/features/curriculum/seed';
import { createLocalId } from '@/utils/id';

import { installBundledCurriculumIfNeeded, isBundledCurriculumInstalled } from './bundled-curriculum-repository';
import { installCourseReadingVocabulary } from './course-reading-vocabulary-repository';
import { ensureFsrsCards } from './fsrs-bootstrap';
import { runMigrations } from './migrations';

const DATABASE_NAME = 'japango.db';
let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;
let learningContentInstallationPromise: Promise<void> | undefined;

interface CountRow { count: number; }

export type LearningContentInstallationStatus =
  | 'idle'
  | 'scheduled'
  | 'installing_curriculum'
  | 'preparing_reviews'
  | 'preparing_course'
  | 'ready'
  | 'error';

export interface LearningContentInstallationState {
  status: LearningContentInstallationStatus;
  errorMessage?: string;
}

let learningContentInstallationState: LearningContentInstallationState = { status: 'idle' };
const learningContentInstallationListeners = new Set<(state: LearningContentInstallationState) => void>();

function setLearningContentInstallationState(state: LearningContentInstallationState): void {
  learningContentInstallationState = state;
  for (const listener of learningContentInstallationListeners) listener(state);
}

/** Read-only status for the non-blocking offline curriculum preparation UI. */
export function getLearningContentInstallationState(): LearningContentInstallationState {
  return learningContentInstallationState;
}

export function subscribeToLearningContentInstallation(
  listener: (state: LearningContentInstallationState) => void,
): () => void {
  learningContentInstallationListeners.add(listener);
  listener(learningContentInstallationState);
  return () => learningContentInstallationListeners.delete(listener);
}

async function runStartupStage<T>(name: string, work: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    return await work();
  } finally {
    if (__DEV__) console.info(`[JapanGo startup] ${name} completed in ${Date.now() - startedAt}ms`);
  }
}

function scheduleLearningContentInstallation(database: SQLite.SQLiteDatabase): void {
  if (learningContentInstallationPromise) return;
  setLearningContentInstallationState({ status: 'scheduled' });
  learningContentInstallationPromise = new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      void (async () => {
        setLearningContentInstallationState({ status: 'installing_curriculum' });
        await runStartupStage('install bundled curriculum', () => installBundledCurriculumIfNeeded(database));
        setLearningContentInstallationState({ status: 'preparing_reviews' });
        await runStartupStage('prepare FSRS cards', () => ensureFsrsCards(database));
        setLearningContentInstallationState({ status: 'ready' });
      })().then(resolve).catch((error: unknown) => {
        setLearningContentInstallationState({
          status: 'error',
          errorMessage: 'Offline lessons are still being prepared. Your saved lessons remain available.',
        });
        console.error(
          '[JapanGo database] Background learning content installation failed',
          error instanceof Error ? { name: error.name, message: error.message } : String(error),
        );
        learningContentInstallationPromise = undefined;
        reject(error);
      });
    }, 0);
  });
  // The background task may not be awaited before an app restart. Register a
  // handler now while preserving rejection for callers that do await it.
  void learningContentInstallationPromise.catch(() => undefined);
}

/** Starts the one-time local install of all authored lessons, reviews, and course structure. */
export async function prepareAllLearningContent(): Promise<void> {
  const database = await getDatabase();
  if (learningContentInstallationState.status === 'ready') return;
  scheduleLearningContentInstallation(database);
  await learningContentInstallationPromise;
}

/** Joins the one-time install so a deep link cannot race SQLite foreign-key data. */
export async function waitForLearningContentInstallation(): Promise<void> {
  const database = await getDatabase();
  if (learningContentInstallationState.status === 'ready') return;
  scheduleLearningContentInstallation(database);
  await learningContentInstallationPromise;
}

async function isAllLearningContentInstalled(database: SQLite.SQLiteDatabase): Promise<boolean> {
  const [bundleInstalled, manifest, itemCount, cardCount] = await Promise.all([
    isBundledCurriculumInstalled(database),
    database.getFirstAsync<{ installed_at: string }>(
      "SELECT installed_at FROM course_manifest_state WHERE manifest_key = 'structured-course'",
    ),
    database.getFirstAsync<CountRow>(
      "SELECT COUNT(*) AS count FROM curriculum_items WHERE curriculum_source = 'bundled' AND release_ready = 1",
    ),
    database.getFirstAsync<CountRow>(
      `SELECT COUNT(*) AS count
       FROM fsrs_cards AS cards
       INNER JOIN curriculum_items AS items ON items.id = cards.item_id
       WHERE cards.user_id = (SELECT id FROM learner_profile LIMIT 1)
         AND items.curriculum_source = 'bundled' AND items.release_ready = 1`,
    ),
  ]);
  return bundleInstalled && Boolean(manifest) && (itemCount?.count ?? 0) > 0 && itemCount?.count === cardCount?.count;
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

    await installCourseReadingVocabulary(database);

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
  await ensureFsrsCards(database, ['course-support']);
}

async function openAndPrepareDatabase(): Promise<SQLite.SQLiteDatabase> {
  const database = await runStartupStage('open local database', () => SQLite.openDatabaseAsync(DATABASE_NAME));
  await runStartupStage('configure local database', () => database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;'));
  await runStartupStage('apply database migrations', () => runMigrations(database));
  await runStartupStage('seed core learning data', () => seedDatabase(database));
  setLearningContentInstallationState(
    await isAllLearningContentInstalled(database) ? { status: 'ready' } : { status: 'idle' },
  );
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
