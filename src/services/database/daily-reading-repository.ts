import {
  dailyReadingAnswersSchema,
  dailyReadingLearningContextSchema,
  dailyReadingSchema,
  savedVocabularyIdsSchema,
  vocabularyTapCountsSchema,
} from '@/features/daily-reading/schemas';
import { calculateDailyReadingStreak } from '@/features/daily-reading/streak';
import type {
  DailyReading,
  DailyReadingContextItem,
  DailyReadingHomeState,
  DailyReadingLearningContext,
  DailyReadingProgress,
} from '@/types/daily-reading';
import type { CurriculumLevel } from '@/types/learning';

import { getDatabase } from './database';
import { getLearnerProfile } from './profile-repository';

interface DailyReadingRow {
  id: string;
  content_json: string;
}

interface ProgressRow {
  reading_id: string;
  reading_date: string;
  opened_at: string | null;
  answers_json: string;
  vocabulary_tapped_json: string;
  saved_vocabulary_ids_json: string;
  score: number | null;
  completed_at: string | null;
}

interface ContextRow {
  id: string;
  title: string;
  reading: string | null;
  meaning: string | null;
}

function parseReading(row: DailyReadingRow): DailyReading | undefined {
  try {
    const parsed = dailyReadingSchema.safeParse(JSON.parse(row.content_json) as unknown);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function parseJsonWithSchema<T>(value: string, schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false } }, fallback: T): T {
  try {
    const parsed = schema.safeParse(JSON.parse(value) as unknown);
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

function mapContextItem(row: ContextRow): DailyReadingContextItem {
  return {
    id: row.id,
    japanese: row.title,
    reading: row.reading ?? undefined,
    meaning: row.meaning ?? '',
  };
}

function parseProgress(row: ProgressRow): DailyReadingProgress {
  return {
    readingId: row.reading_id,
    date: row.reading_date,
    openedAt: row.opened_at ?? undefined,
    answers: parseJsonWithSchema(row.answers_json, dailyReadingAnswersSchema, []),
    vocabularyTapped: parseJsonWithSchema(row.vocabulary_tapped_json, vocabularyTapCountsSchema, {}),
    savedVocabularyIds: parseJsonWithSchema(row.saved_vocabulary_ids_json, savedVocabularyIdsSchema, []),
    score: row.score ?? undefined,
    completedAt: row.completed_at ?? undefined,
  };
}

async function ensureProgress(reading: DailyReading): Promise<DailyReadingProgress> {
  const database = await getDatabase();
  const profile = await getLearnerProfile();
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT OR IGNORE INTO daily_reading_progress
      (reading_id, user_id, reading_date, answers_json, vocabulary_tapped_json,
       saved_vocabulary_ids_json, updated_at)
     VALUES (?, ?, ?, '[]', '{}', '[]', ?)`,
    reading.id,
    profile.id,
    reading.date,
    now,
  );
  const row = await database.getFirstAsync<ProgressRow>(
    'SELECT * FROM daily_reading_progress WHERE reading_id = ?',
    reading.id,
  );
  if (!row) throw new Error('Daily Reading progress could not be opened.');
  return parseProgress(row);
}

export async function cacheDailyReading(value: unknown): Promise<DailyReading> {
  const reading = dailyReadingSchema.parse(value);
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO daily_readings
      (id, reading_date, level, content_json, generated_at, cached_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       content_json = excluded.content_json,
       generated_at = excluded.generated_at,
       cached_at = excluded.cached_at`,
    reading.id,
    reading.date,
    reading.level,
    JSON.stringify(reading),
    reading.generatedAt,
    new Date().toISOString(),
  );
  return (await getCachedDailyReading(reading.date, reading.level)) ?? reading;
}

export async function getCachedDailyReading(date: string, level: CurriculumLevel): Promise<DailyReading | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<DailyReadingRow>(
    'SELECT id, content_json FROM daily_readings WHERE reading_date = ? AND level = ?',
    date,
    level,
  );
  return row ? parseReading(row) : undefined;
}

export async function getDailyReadingById(id: string): Promise<DailyReading | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<DailyReadingRow>(
    'SELECT id, content_json FROM daily_readings WHERE id = ?',
    id,
  );
  return row ? parseReading(row) : undefined;
}

export async function getDailyReadingProgress(reading: DailyReading): Promise<DailyReadingProgress> {
  return ensureProgress(reading);
}

export async function markDailyReadingOpened(reading: DailyReading): Promise<DailyReadingProgress> {
  const progress = await ensureProgress(reading);
  if (progress.openedAt) return progress;
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    'UPDATE daily_reading_progress SET opened_at = ?, updated_at = ? WHERE reading_id = ?',
    now,
    now,
    reading.id,
  );
  return ensureProgress(reading);
}

async function incrementVocabularySignal(
  vocabularyId: string,
  field: 'tap_count' | 'incorrect_count',
): Promise<void> {
  const database = await getDatabase();
  const profile = await getLearnerProfile();
  const item = await database.getFirstAsync<{ id: string }>(
    "SELECT id FROM curriculum_items WHERE id = ? AND type = 'vocabulary'",
    vocabularyId,
  );
  if (!item) return;
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO daily_reading_vocabulary_signals
      (user_id, vocabulary_id, tap_count, incorrect_count, last_signaled_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, vocabulary_id) DO UPDATE SET
       ${field} = ${field} + 1,
       last_signaled_at = excluded.last_signaled_at`,
    profile.id,
    vocabularyId,
    field === 'tap_count' ? 1 : 0,
    field === 'incorrect_count' ? 1 : 0,
    now,
  );
}

export async function trackDailyReadingVocabularyTap(
  reading: DailyReading,
  vocabularyId: string,
): Promise<void> {
  const progress = await ensureProgress(reading);
  const counts = { ...progress.vocabularyTapped, [vocabularyId]: (progress.vocabularyTapped[vocabularyId] ?? 0) + 1 };
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE daily_reading_progress SET vocabulary_tapped_json = ?, updated_at = ? WHERE reading_id = ?',
    JSON.stringify(counts),
    new Date().toISOString(),
    reading.id,
  );
  await incrementVocabularySignal(vocabularyId, 'tap_count');
}

export async function answerDailyReadingQuestion(
  reading: DailyReading,
  questionId: string,
  selectedAnswer: number,
): Promise<DailyReadingProgress> {
  const question = reading.questions.find((candidate) => candidate.id === questionId);
  if (!question || selectedAnswer < 0 || selectedAnswer >= question.options.length) {
    throw new Error('Select one of the available answers.');
  }
  const progress = await ensureProgress(reading);
  if (progress.answers.some((answer) => answer.questionId === questionId)) return progress;
  const correct = selectedAnswer === question.correctAnswer;
  const answers = [...progress.answers, { questionId, selectedAnswer, correct, answeredAt: new Date().toISOString() }];
  const complete = Boolean(progress.openedAt) && answers.length === reading.questions.length;
  const score = complete ? Math.round((answers.filter((answer) => answer.correct).length / reading.questions.length) * 100) : undefined;
  const now = new Date().toISOString();
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE daily_reading_progress
     SET answers_json = ?, score = ?, completed_at = ?, updated_at = ?
     WHERE reading_id = ?`,
    JSON.stringify(answers),
    score ?? null,
    complete ? now : null,
    now,
    reading.id,
  );
  if (!correct) {
    await Promise.all(question.targetVocabularyIds.map((id) => incrementVocabularySignal(id, 'incorrect_count')));
  }
  return ensureProgress(reading);
}

export async function saveDailyReadingVocabulary(
  reading: DailyReading,
  vocabularyId: string,
): Promise<DailyReadingProgress> {
  const vocabulary = reading.targetVocabulary.find((item) => item.sourceItemId === vocabularyId);
  if (!vocabulary) throw new Error('This word is not part of today’s curated vocabulary.');
  const database = await getDatabase();
  const profile = await getLearnerProfile();
  const item = await database.getFirstAsync<{ id: string }>(
    "SELECT id FROM curriculum_items WHERE id = ? AND type = 'vocabulary' AND title = ? AND reading = ?",
    vocabularyId,
    vocabulary.word,
    vocabulary.reading,
  );
  if (!item) throw new Error('This word is not available in the installed curriculum yet.');
  await database.runAsync(
    'INSERT OR IGNORE INTO vocabulary_bookmarks (user_id, vocabulary_id, created_at) VALUES (?, ?, ?)',
    profile.id,
    vocabularyId,
    new Date().toISOString(),
  );
  const progress = await ensureProgress(reading);
  if (!progress.savedVocabularyIds.includes(vocabularyId)) {
    await database.runAsync(
      'UPDATE daily_reading_progress SET saved_vocabulary_ids_json = ?, updated_at = ? WHERE reading_id = ?',
      JSON.stringify([...progress.savedVocabularyIds, vocabularyId]),
      new Date().toISOString(),
      reading.id,
    );
  }
  return ensureProgress(reading);
}

export async function getDailyReadingStreak(today: string): Promise<number> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ reading_date: string }>(
    `SELECT DISTINCT reading_date FROM daily_reading_progress
     WHERE user_id = (SELECT id FROM learner_profile LIMIT 1) AND completed_at IS NOT NULL`,
  );
  return calculateDailyReadingStreak(rows.map((row) => row.reading_date), today);
}

export async function getDailyReadingHomeState(date: string, level: CurriculumLevel): Promise<DailyReadingHomeState> {
  const reading = await getCachedDailyReading(date, level);
  const [progress, streak] = await Promise.all([
    reading ? ensureProgress(reading) : undefined,
    getDailyReadingStreak(date),
  ]);
  return { reading, progress, streak };
}

async function contextRows(source: string, level: CurriculumLevel, limit: number): Promise<DailyReadingContextItem[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<ContextRow>(source, level, limit);
  return rows.map(mapContextItem);
}

export async function buildDailyReadingLearningContext(level: CurriculumLevel): Promise<DailyReadingLearningContext> {
  const base = `FROM curriculum_items AS c
    INNER JOIN learner_profile AS p ON 1 = 1
    LEFT JOIN user_mastery AS m ON m.user_id = p.id AND m.item_id = c.id
    LEFT JOIN daily_reading_vocabulary_signals AS signals
      ON signals.user_id = p.id AND signals.vocabulary_id = c.id
    LEFT JOIN vocabulary_bookmarks AS bookmarks
      ON bookmarks.user_id = p.id AND bookmarks.vocabulary_id = c.id
    WHERE c.level = ? AND c.release_ready = 1`;
  const [knownVocabulary, weakVocabulary, recentVocabulary, newVocabularyCandidates, recentGrammar, learnedKanji] = await Promise.all([
    contextRows(`SELECT c.id, c.title, c.reading, c.meaning ${base} AND c.type = 'vocabulary' AND c.meaning IS NOT NULL AND (COALESCE(m.status, 'new') <> 'new' OR COALESCE(m.correct_count, 0) + COALESCE(m.incorrect_count, 0) > 0) ORDER BY COALESCE(m.last_reviewed_at, '') DESC, m.mastery_score DESC LIMIT ?`, level, 50),
    contextRows(`SELECT c.id, c.title, c.reading, c.meaning ${base} AND c.type = 'vocabulary' AND c.meaning IS NOT NULL AND (m.status = 'weak' OR bookmarks.vocabulary_id IS NOT NULL OR COALESCE(signals.incorrect_count, 0) > 0 OR COALESCE(signals.tap_count, 0) >= 3) ORDER BY COALESCE(signals.incorrect_count, 0) DESC, COALESCE(signals.tap_count, 0) DESC, m.incorrect_count DESC LIMIT ?`, level, 12),
    contextRows(`SELECT c.id, c.title, c.reading, c.meaning ${base} AND c.type = 'vocabulary' AND c.meaning IS NOT NULL AND m.last_reviewed_at IS NOT NULL ORDER BY m.last_reviewed_at DESC LIMIT ?`, level, 12),
    contextRows(`SELECT c.id, c.title, c.reading, c.meaning ${base} AND c.type = 'vocabulary' AND c.meaning IS NOT NULL AND COALESCE(m.status, 'new') = 'new' AND bookmarks.vocabulary_id IS NULL ORDER BY c.id LIMIT ?`, level, 12),
    contextRows(`SELECT c.id, c.title, c.reading, COALESCE(c.meaning, c.explanation) AS meaning ${base} AND c.type = 'grammar' AND COALESCE(c.meaning, c.explanation) IS NOT NULL AND (COALESCE(m.status, 'new') <> 'new' OR m.last_reviewed_at IS NOT NULL) ORDER BY COALESCE(m.last_reviewed_at, '') DESC LIMIT ?`, level, 8),
    contextRows(`SELECT c.id, c.title, c.reading, c.meaning ${base} AND c.type = 'kanji' AND c.meaning IS NOT NULL AND COALESCE(m.status, 'new') <> 'new' ORDER BY COALESCE(m.last_reviewed_at, '') DESC, m.mastery_score DESC LIMIT ?`, level, 60),
  ]);
  const database = await getDatabase();
  const recentRows = await database.getAllAsync<DailyReadingRow>('SELECT id, content_json FROM daily_readings ORDER BY reading_date DESC LIMIT 10');
  const recentTopics = recentRows.flatMap((row) => {
    const reading = parseReading(row);
    return reading ? [`${reading.type}: ${reading.title}`] : [];
  });
  return dailyReadingLearningContextSchema.parse({
    knownVocabulary,
    weakVocabulary,
    recentVocabulary,
    newVocabularyCandidates,
    recentGrammar,
    learnedKanji,
    recentTopics,
  });
}
