import { describe, expect, it } from 'vitest';

import {
  CURRENT_DATABASE_VERSION,
  databaseMigrations,
  runMigrations,
  type MigrationDatabase,
} from './migrations';

class FakeMigrationDatabase implements MigrationDatabase {
  transactionCount = 0;
  executedSql: string[] = [];
  failOnLearningContentSchema = false;

  constructor(public userVersion: number) {}

  async getFirstAsync<T>(source: string): Promise<T | null> {
    if (source !== 'PRAGMA user_version') throw new Error(`Unexpected query: ${source}`);
    return { user_version: this.userVersion } as T;
  }

  async execAsync(source: string): Promise<void> {
    this.executedSql.push(source);
    if (
      this.failOnLearningContentSchema &&
      source.includes('CREATE TABLE IF NOT EXISTS sentences')
    ) {
      throw new Error('simulated migration failure');
    }
    const version = source.match(/^PRAGMA user_version = (\d+)$/u)?.[1];
    if (version) this.userVersion = Number(version);
  }

  async withTransactionAsync(operation: () => Promise<void>): Promise<void> {
    this.transactionCount += 1;
    const versionSnapshot = this.userVersion;
    try {
      await operation();
    } catch (error) {
      this.userVersion = versionSnapshot;
      throw error;
    }
  }
}

describe('SQLite migrations', () => {
  it('applies every missing version in its own transaction', async () => {
    const database = new FakeMigrationDatabase(0);

    await runMigrations(database);

    expect(database.userVersion).toBe(CURRENT_DATABASE_VERSION);
    expect(database.transactionCount).toBe(22);
    expect(
      database.executedSql.filter((sql) => sql.startsWith('PRAGMA user_version =')),
    ).toEqual([
      'PRAGMA user_version = 1',
      'PRAGMA user_version = 2',
      'PRAGMA user_version = 3',
      'PRAGMA user_version = 4',
      'PRAGMA user_version = 5',
      'PRAGMA user_version = 6',
      'PRAGMA user_version = 7',
      'PRAGMA user_version = 8',
      'PRAGMA user_version = 9',
      'PRAGMA user_version = 10',
      'PRAGMA user_version = 11',
      'PRAGMA user_version = 12',
      'PRAGMA user_version = 13',
      'PRAGMA user_version = 14',
      'PRAGMA user_version = 15',
      'PRAGMA user_version = 16',
      'PRAGMA user_version = 17',
      'PRAGMA user_version = 18',
      'PRAGMA user_version = 19',
      'PRAGMA user_version = 20',
      'PRAGMA user_version = 21',
      'PRAGMA user_version = 22',
    ]);
  });

  it('applies v2 through v22 to an existing v1 database and creates no content rows', async () => {
    const database = new FakeMigrationDatabase(1);

    await runMigrations(database);

    expect(database.transactionCount).toBe(21);
    expect(database.userVersion).toBe(22);
    const schemaSql = database.executedSql[0] ?? '';
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS content_import_batches');
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS sentences');
    expect(schemaSql).toContain('schema_version INTEGER NOT NULL');
    expect(schemaSql).toContain('source_ids_json TEXT NOT NULL');
    expect(schemaSql).toContain('attribution_json TEXT NOT NULL');
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS sentence_grammar_relationships');
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS sentence_vocabulary_relationships');
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS sentence_kanji_relationships');
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS sentence_curriculum_relationships');
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS questions');
    expect(schemaSql).toContain('exam_metadata_json TEXT');
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS question_options');
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS question_target_relationships');
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS learning_item_metadata');
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS review_queue');
    expect(schemaSql).toContain('CREATE VIEW IF NOT EXISTS grammar_example_view');
    expect(schemaSql).toContain('CREATE VIEW IF NOT EXISTS vocabulary_example_view');
    expect(schemaSql).toContain('CREATE VIEW IF NOT EXISTS kanji_example_view');
    expect(schemaSql).not.toMatch(/\bINSERT\s+INTO\b/iu);
    expect(schemaSql).not.toMatch(/\bVALUES\s*\(/iu);
    expect(database.executedSql[2]).toContain(
      "ALTER TABLE sentences ADD COLUMN editorial_json",
    );
    expect(database.executedSql[4]).toContain('CREATE TABLE IF NOT EXISTS reading_passages');
    expect(database.executedSql[4]).toContain('CREATE TABLE IF NOT EXISTS reading_question_target_relationships');
    expect(database.executedSql[6]).toContain('CREATE TABLE IF NOT EXISTS listening_speakers');
    expect(database.executedSql[6]).toContain('CREATE TABLE IF NOT EXISTS listening_activities');
    expect(database.executedSql[6]).toContain('CREATE TABLE IF NOT EXISTS listening_turns');
    expect(database.executedSql[6]).toContain('CREATE TABLE IF NOT EXISTS listening_transcripts');
    expect(database.executedSql[6]).toContain('CREATE TABLE IF NOT EXISTS listening_question_target_relationships');
    expect(database.executedSql[6]).toContain('CREATE VIEW IF NOT EXISTS listening_quiz_view');
    expect(database.executedSql[6]).toContain('CREATE VIEW IF NOT EXISTS listening_review_view');
    expect(database.executedSql[6]).toContain('CREATE VIEW IF NOT EXISTS listening_study_view');
    expect(database.executedSql[6]).toContain('CREATE VIEW IF NOT EXISTS listening_question_view');
    expect(database.executedSql[8]).toContain('CREATE TABLE IF NOT EXISTS assessment_blueprints');
    expect(database.executedSql[8]).toContain('CREATE TABLE IF NOT EXISTS assessment_snapshots');
    expect(database.executedSql[8]).toContain('CREATE TABLE IF NOT EXISTS assessment_question_placements');
    expect(database.executedSql[12]).toContain('CREATE TABLE IF NOT EXISTS curriculum_bundle_state');
    expect(database.executedSql[12]).toContain('CREATE TABLE IF NOT EXISTS vocabulary_question_bank');
    expect(database.executedSql[12]).toContain('CREATE TABLE IF NOT EXISTS study_sessions');
    expect(database.executedSql[14]).toContain('CREATE TABLE IF NOT EXISTS curriculum_content_details');
    expect(database.executedSql[14]).toContain('CREATE TABLE IF NOT EXISTS kanji_sentence_links');
    expect(database.executedSql[14]).toContain('CREATE TABLE IF NOT EXISTS canonical_practice_question_bank');
    expect(database.executedSql[14]).toContain('CREATE TABLE IF NOT EXISTS content_study_sessions');
    expect(database.executedSql[16]).toContain('CREATE TABLE IF NOT EXISTS fsrs_cards');
    expect(database.executedSql[16]).toContain('CREATE TABLE IF NOT EXISTS fsrs_review_history');
    expect(database.executedSql[18]).toContain('CREATE TABLE IF NOT EXISTS practice_sessions');
    expect(database.executedSql[18]).toContain('CREATE TABLE IF NOT EXISTS mistake_notebook');
    expect(database.executedSql[20]).toContain('CREATE TABLE IF NOT EXISTS ai_response_cache');
    expect(database.executedSql[20]).toContain('CREATE TABLE IF NOT EXISTS ai_interaction_history');
    expect(database.executedSql[22]).toContain('CREATE TABLE IF NOT EXISTS study_content_views');
    expect(database.executedSql[22]).toContain('CREATE TABLE IF NOT EXISTS kanji_flashcard_sessions');
    expect(database.executedSql[22]).toContain('learning_attempts_item_mode_recent_idx');
    expect(database.executedSql[24]).toContain('CREATE TABLE IF NOT EXISTS courses');
    expect(database.executedSql[24]).toContain('CREATE TABLE IF NOT EXISTS course_lesson_progress');
    expect(database.executedSql[24]).toContain('CREATE TABLE IF NOT EXISTS course_checkpoint_attempts');
    expect(database.executedSql[24]).toContain('CREATE TABLE IF NOT EXISTS course_placement_decisions');
    expect(database.executedSql.at(-12)).toContain('CREATE TABLE IF NOT EXISTS course_activity_hint_usage');
    expect(database.executedSql.at(-10)).toContain('CREATE TABLE IF NOT EXISTS lesson_v2_cached_lessons');
    expect(database.executedSql.at(-10)).toContain('CREATE TABLE IF NOT EXISTS lesson_v2_progress');
    expect(database.executedSql.at(-8)).toContain('DELETE FROM course_lesson_progress');
    expect(database.executedSql.at(-8)).toContain('UPDATE learner_profile');
    expect(database.executedSql.at(-6)).toContain('CREATE TABLE IF NOT EXISTS audio_lesson_cached_lessons');
    expect(database.executedSql.at(-6)).toContain('CREATE TABLE IF NOT EXISTS audio_lesson_progress');
    expect(database.executedSql.at(-1)).toBe('PRAGMA user_version = 22');
    expect(database.executedSql.at(-4)).toContain('CREATE TABLE IF NOT EXISTS v3_learner_state');
    expect(database.executedSql.at(-4)).toContain('CREATE TABLE IF NOT EXISTS v3_episode_progress');
    expect(database.executedSql.at(-2)).toContain('ADD COLUMN story_choices_json');
  });

  it('does nothing when the database is current', async () => {
    const database = new FakeMigrationDatabase(CURRENT_DATABASE_VERSION);

    await runMigrations(database);

    expect(database.transactionCount).toBe(0);
    expect(database.executedSql).toEqual([]);
  });

  it('rejects a database newer than this app without attempting a migration', async () => {
    const database = new FakeMigrationDatabase(CURRENT_DATABASE_VERSION + 1);

    await expect(runMigrations(database)).rejects.toThrow(
      'is newer than supported version',
    );
    expect(database.transactionCount).toBe(0);
    expect(database.executedSql).toEqual([]);
  });

  it('leaves the previous user version intact when a migration transaction fails', async () => {
    const database = new FakeMigrationDatabase(1);
    database.failOnLearningContentSchema = true;

    await expect(runMigrations(database)).rejects.toThrow(
      'simulated migration failure',
    );

    expect(database.userVersion).toBe(1);
    expect(database.transactionCount).toBe(1);
  });

  it('keeps migration definitions contiguous and includes the one-time learner reset at v19', () => {
    expect(databaseMigrations.map(({ version }) => version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
    expect(databaseMigrations.at(-1)?.version).toBe(CURRENT_DATABASE_VERSION);
    expect(databaseMigrations.every(({ sql }) => !/\bINSERT\s+INTO\b/iu.test(sql))).toBe(true);
    expect(databaseMigrations.at(-4)?.sql).toContain('DELETE FROM lesson_v2_progress');
    expect(databaseMigrations.at(-3)?.sql).toContain('CREATE TABLE IF NOT EXISTS audio_lesson_progress');
    expect(databaseMigrations.at(-2)?.sql).toContain('CREATE TABLE IF NOT EXISTS v3_episode_progress');
    expect(databaseMigrations.at(-1)?.sql).toContain('ADD COLUMN story_choices_json');
  });
});
