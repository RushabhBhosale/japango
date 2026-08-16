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
    expect(database.transactionCount).toBe(CURRENT_DATABASE_VERSION);
    expect(
      database.executedSql.filter((sql) => sql.startsWith('PRAGMA user_version =')),
    ).toEqual(Array.from({ length: CURRENT_DATABASE_VERSION }, (_, index) => `PRAGMA user_version = ${index + 1}`));
  });

  it('applies every current migration to an existing v1 database and creates no content rows', async () => {
    const database = new FakeMigrationDatabase(1);

    await runMigrations(database);

    expect(database.transactionCount).toBe(CURRENT_DATABASE_VERSION - 1);
    expect(database.userVersion).toBe(CURRENT_DATABASE_VERSION);
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
    expect(database.executedSql.at(-1)).toBe(`PRAGMA user_version = ${CURRENT_DATABASE_VERSION}`);
    expect(databaseMigrations.find(({ version }) => version === 28)?.sql).toContain('CREATE TABLE IF NOT EXISTS daily_homework');
    expect(databaseMigrations.find(({ version }) => version === 28)?.sql).toContain('CREATE TABLE IF NOT EXISTS daily_homework_items');
    expect(databaseMigrations.find(({ version }) => version === 29)?.sql).toContain('CREATE TABLE IF NOT EXISTS notification_log');
    expect(databaseMigrations.find(({ version }) => version === 29)?.sql).toContain('CREATE TABLE IF NOT EXISTS notification_activity');
    expect(databaseMigrations.find(({ version }) => version === 30)?.sql).toContain('CREATE TABLE IF NOT EXISTS chat_learning_patterns');
    expect(databaseMigrations.find(({ version }) => version === 31)?.sql).toContain('CREATE TABLE IF NOT EXISTS practice_sync_state');
    expect(databaseMigrations.find(({ version }) => version === 31)?.sql).toContain('CREATE TABLE IF NOT EXISTS practice_imported_sessions');
    expect(databaseMigrations.find(({ version }) => version === 31)?.sql).toContain('DROP TABLE IF EXISTS ai_chat_messages');
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
    expect(databaseMigrations.map(({ version }) => version)).toEqual(Array.from({ length: CURRENT_DATABASE_VERSION }, (_, index) => index + 1));
    expect(databaseMigrations.at(-1)?.version).toBe(CURRENT_DATABASE_VERSION);
    expect(databaseMigrations.filter(({ version }) => version < 31).every(({ sql }) => !/\bINSERT\s+INTO\b/iu.test(sql))).toBe(true);
    expect(databaseMigrations.find(({ version }) => version === 19)?.sql).toContain('DELETE FROM lesson_v2_progress');
    expect(databaseMigrations.find(({ version }) => version === 20)?.sql).toContain('CREATE TABLE IF NOT EXISTS audio_lesson_progress');
    expect(databaseMigrations.find(({ version }) => version === 21)?.sql).toContain('CREATE TABLE IF NOT EXISTS v3_episode_progress');
    expect(databaseMigrations.find(({ version }) => version === 22)?.sql).toContain('ADD COLUMN story_choices_json');
    expect(databaseMigrations.find(({ version }) => version === 23)?.sql).toContain('CREATE TABLE IF NOT EXISTS daily_reading_progress');
    expect(databaseMigrations.find(({ version }) => version === 24)?.sql).toContain('CREATE TABLE IF NOT EXISTS ai_chat_messages');
    expect(databaseMigrations.find(({ version }) => version === 25)?.sql).toContain('CREATE TABLE IF NOT EXISTS ai_chat_memories');
    expect(databaseMigrations.find(({ version }) => version === 26)?.sql).toContain('ADD COLUMN content_reading TEXT');
    expect(databaseMigrations.find(({ version }) => version === 27)?.sql).toContain('UPDATE ai_chat_messages');
    expect(databaseMigrations.find(({ version }) => version === 28)?.sql).toContain('CREATE TABLE IF NOT EXISTS daily_homework');
    expect(databaseMigrations.find(({ version }) => version === 29)?.sql).toContain('CREATE TABLE IF NOT EXISTS notification_log');
    expect(databaseMigrations.find(({ version }) => version === 30)?.sql).toContain('CREATE TABLE IF NOT EXISTS chat_learning_patterns');
    expect(databaseMigrations.find(({ version }) => version === 31)?.sql).toContain("'conversation-practice'");
  });
});
