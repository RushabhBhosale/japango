import * as SQLite from 'expo-sqlite';

import {
  bundledCurriculumMetadata,
  loadBundledCurriculum,
  type BundledCurriculum,
} from '@/features/curriculum/bundled-curriculum';

import { insertSqlRows } from './sql-batch';

const bundleKey = 'mobile-release-curriculum';

interface BundleStateRow {
  content_version: string;
  checksum: string;
  vocabulary_count: number;
  question_count: number;
  sentence_count: number;
}

interface CountRow {
  count: number;
}

function hasExpectedBundleState(row: BundleStateRow | null): boolean {
  return Boolean(
    row
    && row.content_version === bundledCurriculumMetadata.contentVersion
    && row.checksum === bundledCurriculumMetadata.checksum
    && row.vocabulary_count === bundledCurriculumMetadata.counts.vocabulary
    && row.question_count === bundledCurriculumMetadata.counts.questions
    && row.sentence_count === bundledCurriculumMetadata.counts.sentences,
  );
}

async function getBundleState(database: SQLite.SQLiteDatabase): Promise<BundleStateRow | null> {
  return database.getFirstAsync<BundleStateRow>(
    `SELECT content_version, checksum, vocabulary_count, question_count, sentence_count
     FROM curriculum_bundle_state WHERE bundle_key = ?`,
    bundleKey,
  );
}

async function importBundle(
  database: SQLite.SQLiteDatabase,
  bundle: BundledCurriculum,
): Promise<void> {
  const installedAt = new Date().toISOString();
  await database.withTransactionAsync(async () => {
    // Removed content is hidden from current curriculum queries, but its stable
    // row and learner-owned attempts/mastery remain available for history.
    await database.runAsync(
      `UPDATE curriculum_items
       SET curriculum_source = 'retired-bundled', release_ready = 0
       WHERE curriculum_source = 'bundled'`,
    );

    await insertSqlRows(
      database,
      `INSERT INTO curriculum_items
        (id, type, level, title, meaning, reading, explanation, tags_json,
         curriculum_source, release_ready, bundled_content_version)
       VALUES`,
      bundle.items.map((item) => [
        item.id, item.type, item.level, item.title, item.meaning, item.reading ?? null, null,
        JSON.stringify(item.tags), 'bundled', 1, bundle.contentVersion,
      ]),
      `ON CONFLICT(id) DO UPDATE SET
         type = excluded.type,
         level = excluded.level,
         title = excluded.title,
         meaning = excluded.meaning,
         reading = excluded.reading,
         explanation = NULL,
         tags_json = excluded.tags_json,
         curriculum_source = 'bundled',
         release_ready = 1,
         bundled_content_version = excluded.bundled_content_version`,
    );

    await database.runAsync('DELETE FROM vocabulary_content_details');
    await insertSqlRows(
      database,
      `INSERT INTO vocabulary_content_details
        (vocabulary_id, part_of_speech_json, kanji_ids_json, bundled_content_version)
       VALUES`,
      bundle.vocabularyDetails.map((detail) => [
        detail.id, JSON.stringify(detail.partOfSpeech), JSON.stringify(detail.kanjiIds), bundle.contentVersion,
      ]),
    );

    await database.runAsync('DELETE FROM vocabulary_sentence_links');
    await database.runAsync('DELETE FROM mobile_sentences');
    await insertSqlRows(
      database,
      `INSERT INTO mobile_sentences
        (id, japanese, reading, english, level, difficulty_rank, bundled_content_version)
       VALUES`,
      bundle.sentences.map((sentence) => [
        sentence.id, sentence.japanese, sentence.reading, sentence.english,
        sentence.difficulty.jlptLevel, sentence.difficulty.rank, bundle.contentVersion,
      ]),
    );
    await insertSqlRows(
      database,
      `INSERT INTO vocabulary_sentence_links
        (id, vocabulary_id, sentence_id, relationship_role, bundled_content_version)
       VALUES`,
      bundle.vocabularyExamples.map((example) => [
        example.id, example.vocabularyId, example.sentenceId, example.role, bundle.contentVersion,
      ]),
    );
    await database.runAsync('DELETE FROM mobile_sentence_grammar_links');
    await insertSqlRows(
      database,
      `INSERT INTO mobile_sentence_grammar_links
        (id, grammar_id, sentence_id, relationship_role, bundled_content_version)
       VALUES`,
      bundle.grammarExamples.map((example) => [
        example.id, example.grammarId, example.sentenceId, example.role, bundle.contentVersion,
      ]),
    );
    await database.runAsync('DELETE FROM kanji_sentence_links');
    await insertSqlRows(
      database,
      `INSERT INTO kanji_sentence_links
        (id, kanji_id, sentence_id, relationship_role, bundled_content_version)
       VALUES`,
      bundle.kanjiExamples.map((example) => [
        example.id, example.kanjiId, example.sentenceId, example.role, bundle.contentVersion,
      ]),
    );

    await database.runAsync('DELETE FROM vocabulary_question_bank');
    await insertSqlRows(
      database,
      `INSERT INTO vocabulary_question_bank
        (id, vocabulary_id, level, presentation, response_type, prompt, explanation,
         correct_option_id, options_json, bundled_content_version)
       VALUES`,
      bundle.vocabularyQuestions.map((question) => [
        question.id, question.vocabularyId, question.level, question.presentation, question.responseType,
        question.prompt, question.explanation, question.correctOptionId, JSON.stringify(question.options), bundle.contentVersion,
      ]),
    );

    await database.runAsync('DELETE FROM curriculum_content_details');
    const contentDetails = [
      ...bundle.grammarDetails.map((detail) => ({ itemId: detail.id, contentType: 'grammar', value: detail })),
      ...bundle.kanjiDetails.map((detail) => ({ itemId: detail.id, contentType: 'kanji', value: detail })),
      ...bundle.readingPassages.map((detail) => ({ itemId: detail.id, contentType: 'reading', value: detail })),
      ...bundle.listeningActivities.map((detail) => ({ itemId: detail.id, contentType: 'listening', value: detail })),
    ];
    await insertSqlRows(
      database,
      `INSERT INTO curriculum_content_details
        (item_id, content_type, detail_json, bundled_content_version)
       VALUES`,
      contentDetails.map((detail) => [detail.itemId, detail.contentType, JSON.stringify(detail.value), bundle.contentVersion]),
    );

    await database.runAsync('DELETE FROM canonical_practice_question_bank');
    await insertSqlRows(
      database,
      `INSERT INTO canonical_practice_question_bank
        (id, item_id, domain, level, presentation, response_type, prompt, explanation,
         correct_option_id, options_json, bundled_content_version)
       VALUES`,
      bundle.practiceQuestions.map((question) => [
        question.id, question.itemId, question.domain, question.level, question.presentation,
        question.responseType, question.prompt, question.explanation, question.correctOptionId,
        JSON.stringify(question.options), bundle.contentVersion,
      ]),
    );

    await database.runAsync(
      `INSERT OR IGNORE INTO user_mastery (user_id, item_id)
       SELECT learner_profile.id, curriculum_items.id
       FROM learner_profile CROSS JOIN curriculum_items
       WHERE curriculum_items.curriculum_source = 'bundled'
         AND curriculum_items.release_ready = 1`,
    );
    await database.runAsync(
      `INSERT INTO curriculum_bundle_state
        (bundle_key, content_version, checksum, vocabulary_count, question_count, sentence_count, installed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(bundle_key) DO UPDATE SET
         content_version = excluded.content_version,
         checksum = excluded.checksum,
         vocabulary_count = excluded.vocabulary_count,
         question_count = excluded.question_count,
         sentence_count = excluded.sentence_count,
         installed_at = excluded.installed_at`,
      bundleKey,
      bundle.contentVersion,
      bundle.checksum,
      bundle.counts.vocabulary,
      bundle.counts.questions,
      bundle.counts.sentences,
      installedAt,
    );
  });
}

async function count(database: SQLite.SQLiteDatabase, sql: string): Promise<number> {
  const row = await database.getFirstAsync<CountRow>(sql);
  return row?.count ?? 0;
}

export async function verifyBundledCurriculumIntegrity(database: SQLite.SQLiteDatabase): Promise<void> {
  const [vocabularyCount, questionCount, sentenceCount, readingCount, listeningCount, readingQuestionCount, listeningQuestionCount, contentDetailCount, nonReleaseCount, invalidQuestionCount, invalidPracticeQuestionCount, foreignKeys] = await Promise.all([
    count(database, `SELECT COUNT(*) AS count FROM curriculum_items WHERE curriculum_source = 'bundled' AND release_ready = 1 AND type = 'vocabulary'`),
    count(database, `SELECT COUNT(*) AS count FROM vocabulary_question_bank`),
    count(database, `SELECT COUNT(*) AS count FROM mobile_sentences`),
    count(database, `SELECT COUNT(*) AS count FROM curriculum_items WHERE curriculum_source = 'bundled' AND release_ready = 1 AND type = 'reading'`),
    count(database, `SELECT COUNT(*) AS count FROM curriculum_items WHERE curriculum_source = 'bundled' AND release_ready = 1 AND type = 'listening'`),
    count(database, `SELECT COUNT(*) AS count FROM canonical_practice_question_bank WHERE domain = 'reading'`),
    count(database, `SELECT COUNT(*) AS count FROM canonical_practice_question_bank WHERE domain = 'listening'`),
    count(database, `SELECT COUNT(*) AS count FROM curriculum_content_details`),
    count(database, `SELECT COUNT(*) AS count FROM curriculum_items WHERE curriculum_source = 'bundled' AND release_ready <> 1`),
    count(database, `SELECT COUNT(*) AS count FROM vocabulary_question_bank AS questions LEFT JOIN curriculum_items AS items ON items.id = questions.vocabulary_id WHERE items.id IS NULL OR items.curriculum_source <> 'bundled' OR items.release_ready <> 1`),
    count(database, `SELECT COUNT(*) AS count FROM canonical_practice_question_bank AS questions LEFT JOIN curriculum_items AS items ON items.id = questions.item_id WHERE items.id IS NULL OR items.curriculum_source <> 'bundled' OR items.release_ready <> 1`),
    database.getAllAsync<{ table: string }>('PRAGMA foreign_key_check'),
  ]);
  if (vocabularyCount !== bundledCurriculumMetadata.counts.vocabulary) {
    throw new Error(`Bundled vocabulary integrity check failed: expected ${bundledCurriculumMetadata.counts.vocabulary}, found ${vocabularyCount}.`);
  }
  if (questionCount !== bundledCurriculumMetadata.counts.questions) {
    throw new Error(`Bundled question integrity check failed: expected ${bundledCurriculumMetadata.counts.questions}, found ${questionCount}.`);
  }
  if (sentenceCount !== bundledCurriculumMetadata.counts.sentences) {
    throw new Error(`Bundled sentence integrity check failed: expected ${bundledCurriculumMetadata.counts.sentences}, found ${sentenceCount}.`);
  }
  if (
    readingCount !== bundledCurriculumMetadata.counts.readingPassages
    || listeningCount !== bundledCurriculumMetadata.counts.listeningActivities
    || readingQuestionCount !== bundledCurriculumMetadata.counts.readingQuestions
    || listeningQuestionCount !== bundledCurriculumMetadata.counts.listeningQuestions
    || contentDetailCount !== bundledCurriculumMetadata.counts.grammar + bundledCurriculumMetadata.counts.kanji + readingCount + listeningCount
  ) {
    throw new Error('Bundled curriculum integrity check found incomplete learner content.');
  }
  if (nonReleaseCount || invalidQuestionCount || invalidPracticeQuestionCount || foreignKeys.length) {
    throw new Error('Bundled curriculum integrity check found invalid release or foreign-key relationships.');
  }
}

export async function installBundledCurriculumIfNeeded(database: SQLite.SQLiteDatabase): Promise<void> {
  const state = await getBundleState(database);
  if (!hasExpectedBundleState(state)) {
    await importBundle(database, loadBundledCurriculum());
  }
  await verifyBundledCurriculumIntegrity(database);
}

export async function getBundledCurriculumVersion(): Promise<string | undefined> {
  const database = await import('./database').then(({ getDatabase }) => getDatabase());
  const state = await getBundleState(database);
  return state?.content_version;
}
