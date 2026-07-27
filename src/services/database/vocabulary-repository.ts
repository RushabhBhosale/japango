import { z } from 'zod';

import { getVocabularyRatingAttemptPolicy } from '@/features/progress/vocabulary-rating-policy';
import type {
  CurriculumWithMastery,
  LearningAttempt,
  MasteryStatus,
} from '@/types/learning';
import type {
  StudySession,
  StudySessionResult,
  VocabularyLesson,
  VocabularyPracticeQuestion,
  VocabularyRating,
} from '@/types/study';
import { createLocalId } from '@/utils/id';

import { getLearnerProfile } from './profile-repository';
import { recordLearningAttempt } from './progress-repository';
import {
  mapAttemptRow,
  mapCurriculumRow,
  mapMasteryRow,
  type AttemptRow,
  type CurriculumRow,
  type MasteryRow,
} from './row-mappers';
import { getDatabase } from './database';
import { getFsrsDailyQueue } from './fsrs-repository';

interface CurriculumMasteryRow extends CurriculumRow, MasteryRow {}

interface DetailRow {
  part_of_speech_json: string;
  kanji_ids_json: string;
}

interface SentenceRow {
  id: string;
  japanese: string;
  reading: string;
  english: string;
  level: 'N5' | 'N4';
  relationship_role: 'focus' | 'supporting';
}

interface QuestionRow {
  id: string;
  vocabulary_id: string;
  level: 'N5' | 'N4';
  presentation: string;
  prompt: string;
  explanation: string | null;
  correct_option_id: string;
  options_json: string;
}

interface StudySessionRow {
  id: string;
  session_type: 'vocabulary-practice' | 'review';
  status: 'in-progress' | 'completed';
  item_ids_json: string;
  question_ids_json: string;
  current_index: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

const vocabularyOptionsSchema = z.array(z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  feedback: z.string().nullable(),
}).strict()).min(2);

const stringArraySchema = z.array(z.string().min(1));

const curriculumMasterySelect = `
  SELECT
    c.id, c.type, c.level, c.title, c.meaning, c.reading, c.explanation, c.tags_json,
    m.user_id, m.item_id, m.mastery_score, m.confidence_score, m.correct_count,
    m.incorrect_count, m.average_response_time_ms, m.last_reviewed_at,
    m.next_review_at, m.review_interval_days, m.status
  FROM curriculum_items AS c
  INNER JOIN learner_profile AS p ON 1 = 1
  INNER JOIN user_mastery AS m ON m.item_id = c.id AND m.user_id = p.id
  WHERE c.curriculum_source = 'bundled' AND c.release_ready = 1
`;

function mapCurriculumWithMastery(row: CurriculumMasteryRow): CurriculumWithMastery {
  const mastery = mapMasteryRow(row);
  return {
    ...mapCurriculumRow(row),
    mastery,
  };
}

function mapQuestion(row: QuestionRow): VocabularyPracticeQuestion {
  const options = vocabularyOptionsSchema.parse(JSON.parse(row.options_json) as unknown);
  if (!options.some((option) => option.id === row.correct_option_id)) {
    throw new Error(`Vocabulary question ${row.id} has no valid correct option.`);
  }
  return {
    id: row.id,
    vocabularyId: row.vocabulary_id,
    level: row.level,
    presentation: row.presentation,
    prompt: row.prompt,
    explanation: row.explanation ?? undefined,
    correctOptionId: row.correct_option_id,
    options: options.map((option) => ({
      id: option.id,
      label: option.label,
      feedback: option.feedback ?? undefined,
    })),
  };
}

async function getLinkedKanji(kanjiIds: string[]): Promise<VocabularyLesson['linkedKanji']> {
  if (!kanjiIds.length) return [];
  const database = await getDatabase();
  const placeholders = kanjiIds.map(() => '?').join(', ');
  const rows = await database.getAllAsync<Pick<CurriculumRow, 'id' | 'title' | 'meaning' | 'reading'>>(
    `SELECT id, title, meaning, reading FROM curriculum_items
     WHERE id IN (${placeholders}) AND curriculum_source = 'bundled' AND release_ready = 1`,
    ...kanjiIds,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return kanjiIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [{ id: row.id, written: row.title, meaning: row.meaning ?? undefined, reading: row.reading ?? undefined }] : [];
  });
}

export async function getCanonicalCurriculumItemById(id: string): Promise<CurriculumWithMastery | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<CurriculumMasteryRow>(`${curriculumMasterySelect} AND c.id = ?`, id);
  return row ? mapCurriculumWithMastery(row) : undefined;
}

export async function getVocabularyLessonById(id: string): Promise<VocabularyLesson | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<CurriculumMasteryRow>(
    `${curriculumMasterySelect} AND c.id = ? AND c.type = 'vocabulary'`,
    id,
  );
  if (!row) return undefined;
  const [detail, example, bookmark] = await Promise.all([
    database.getFirstAsync<DetailRow>(
      'SELECT part_of_speech_json, kanji_ids_json FROM vocabulary_content_details WHERE vocabulary_id = ?',
      id,
    ),
    database.getFirstAsync<SentenceRow>(
      `SELECT sentences.id, sentences.japanese, sentences.reading, sentences.english, sentences.level,
              links.relationship_role
       FROM vocabulary_sentence_links AS links
       INNER JOIN mobile_sentences AS sentences ON sentences.id = links.sentence_id
       WHERE links.vocabulary_id = ?
       ORDER BY CASE links.relationship_role WHEN 'focus' THEN 0 ELSE 1 END, links.id
       LIMIT 1`,
      id,
    ),
    database.getFirstAsync<{ vocabulary_id: string }>(
      `SELECT bookmarks.vocabulary_id FROM vocabulary_bookmarks AS bookmarks
       INNER JOIN learner_profile AS profile ON profile.id = bookmarks.user_id
       WHERE bookmarks.vocabulary_id = ?`,
      id,
    ),
  ]);
  if (!detail) throw new Error(`Vocabulary ${id} has no bundled detail record.`);
  const kanjiIds = stringArraySchema.parse(JSON.parse(detail.kanji_ids_json) as unknown);
  return {
    ...mapCurriculumWithMastery(row),
    partOfSpeech: stringArraySchema.parse(JSON.parse(detail.part_of_speech_json) as unknown),
    linkedKanji: await getLinkedKanji(kanjiIds),
    example: example
      ? {
          id: example.id,
          japanese: example.japanese,
          reading: example.reading,
          meaning: example.english,
          level: example.level,
          relationshipRole: example.relationship_role,
        }
      : undefined,
    bookmarked: Boolean(bookmark),
  };
}

export async function searchVocabulary(query: string, limit = 24): Promise<CurriculumWithMastery[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  const database = await getDatabase();
  const pattern = `%${normalized.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
  const rows = await database.getAllAsync<CurriculumMasteryRow>(
    `${curriculumMasterySelect}
     AND c.type = 'vocabulary'
     AND (c.title LIKE ? ESCAPE '\\' COLLATE NOCASE
       OR c.reading LIKE ? ESCAPE '\\' COLLATE NOCASE
       OR c.meaning LIKE ? ESCAPE '\\' COLLATE NOCASE)
     ORDER BY
       CASE WHEN c.title = ? OR c.reading = ? THEN 0 ELSE 1 END,
       c.level, c.id
     LIMIT ?`,
    pattern,
    pattern,
    pattern,
    normalized,
    normalized,
    Math.max(1, Math.min(limit, 50)),
  );
  return rows.map(mapCurriculumWithMastery);
}

export async function toggleVocabularyBookmark(vocabularyId: string): Promise<boolean> {
  const database = await getDatabase();
  const profile = await getLearnerProfile();
  const existing = await database.getFirstAsync<{ vocabulary_id: string }>(
    'SELECT vocabulary_id FROM vocabulary_bookmarks WHERE user_id = ? AND vocabulary_id = ?',
    profile.id,
    vocabularyId,
  );
  if (existing) {
    await database.runAsync(
      'DELETE FROM vocabulary_bookmarks WHERE user_id = ? AND vocabulary_id = ?',
      profile.id,
      vocabularyId,
    );
    return false;
  }
  await database.runAsync(
    'INSERT INTO vocabulary_bookmarks (user_id, vocabulary_id, created_at) VALUES (?, ?, ?)',
    profile.id,
    vocabularyId,
    new Date().toISOString(),
  );
  return true;
}

export async function recordVocabularyRating(
  vocabularyId: string,
  rating: VocabularyRating,
): Promise<void> {
  const profile = await getLearnerProfile();
  const policy = getVocabularyRatingAttemptPolicy(rating);
  await recordLearningAttempt({
    id: createLocalId('vocabulary-rating'),
    userId: profile.id,
    itemId: vocabularyId,
    lessonId: `vocabulary-rating-${vocabularyId}`,
    mode: 'quiz',
    correct: policy.correct,
    responseTimeMs: policy.responseTimeMs,
    selectedAnswer: rating,
    expectedAnswer: 'again | hard | good | easy',
    createdAt: new Date().toISOString(),
  }, rating);
}

async function getQuestionRows(questionIds: string[]): Promise<VocabularyPracticeQuestion[]> {
  if (!questionIds.length) return [];
  const database = await getDatabase();
  const placeholders = questionIds.map(() => '?').join(', ');
  const rows = await database.getAllAsync<QuestionRow>(
    `SELECT id, vocabulary_id, level, presentation, prompt, explanation, correct_option_id, options_json
     FROM vocabulary_question_bank WHERE id IN (${placeholders})`,
    ...questionIds,
  );
  const byId = new Map(rows.map((row) => [row.id, mapQuestion(row)]));
  return questionIds.map((id) => {
    const question = byId.get(id);
    if (!question) throw new Error(`Vocabulary question ${id} is unavailable in the local bundle.`);
    return question;
  });
}

async function getFirstQuestionForVocabulary(vocabularyId: string): Promise<VocabularyPracticeQuestion | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<QuestionRow>(
    `SELECT id, vocabulary_id, level, presentation, prompt, explanation, correct_option_id, options_json
     FROM vocabulary_question_bank WHERE vocabulary_id = ? ORDER BY id LIMIT 1`,
    vocabularyId,
  );
  return row ? mapQuestion(row) : undefined;
}

function mapStudySessionRow(
  row: StudySessionRow,
  questions: VocabularyPracticeQuestion[],
  attempts: LearningAttempt[],
): StudySession {
  return {
    id: row.id,
    type: row.session_type,
    status: row.status,
    itemIds: stringArraySchema.parse(JSON.parse(row.item_ids_json) as unknown),
    questionIds: stringArraySchema.parse(JSON.parse(row.question_ids_json) as unknown),
    currentIndex: row.current_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
    questions,
    attempts,
  };
}

export async function getStudySession(sessionId: string): Promise<StudySession | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<StudySessionRow>(
    `SELECT id, session_type, status, item_ids_json, question_ids_json, current_index,
            created_at, updated_at, completed_at
     FROM study_sessions WHERE id = ?`,
    sessionId,
  );
  if (!row) return undefined;
  const questionIds = stringArraySchema.parse(JSON.parse(row.question_ids_json) as unknown);
  const [questions, attemptRows] = await Promise.all([
    getQuestionRows(questionIds),
    database.getAllAsync<AttemptRow>(
      'SELECT * FROM learning_attempts WHERE lesson_id = ? ORDER BY created_at',
      sessionId,
    ),
  ]);
  return mapStudySessionRow(row, questions, attemptRows.map(mapAttemptRow));
}

async function findResumableSession(type: StudySession['type']): Promise<StudySession | undefined> {
  const database = await getDatabase();
  const profile = await getLearnerProfile();
  const row = await database.getFirstAsync<{ id: string }>(
    `SELECT id FROM study_sessions
     WHERE user_id = ? AND session_type = ? AND status = 'in-progress'
     ORDER BY updated_at DESC LIMIT 1`,
    profile.id,
    type,
  );
  return row ? getStudySession(row.id) : undefined;
}

export async function startVocabularySession(
  itemIds: string[],
  type: StudySession['type'] = 'vocabulary-practice',
): Promise<StudySession> {
  const uniqueItemIds = [...new Set(itemIds)];
  if (!uniqueItemIds.length) throw new Error('Choose at least one vocabulary item to practise.');
  const existing = await findResumableSession(type);
  if (existing) return existing;

  const questions = (await Promise.all(uniqueItemIds.map(getFirstQuestionForVocabulary))).flatMap((question) => question ? [question] : []);
  if (!questions.length) throw new Error('No release-ready vocabulary questions are available for this session.');
  const profile = await getLearnerProfile();
  const now = new Date().toISOString();
  const id = createLocalId('study-session');
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO study_sessions
      (id, user_id, session_type, status, item_ids_json, question_ids_json, current_index, created_at, updated_at)
     VALUES (?, ?, ?, 'in-progress', ?, ?, 0, ?, ?)`,
    id,
    profile.id,
    type,
    JSON.stringify(questions.map((question) => question.vocabularyId)),
    JSON.stringify(questions.map((question) => question.id)),
    now,
    now,
  );
  const session = await getStudySession(id);
  if (!session) throw new Error('The vocabulary session could not be opened.');
  return session;
}

export async function startReviewSession(mode: 'all' | 'weak'): Promise<StudySession> {
  const database = await getDatabase();
  const queue = await getFsrsDailyQueue();
  const queuedIds = mode === 'weak'
    ? queue.learning.filter((item) => item.state === 'relearning').map((item) => item.itemId)
    : [...queue.learning, ...queue.overdue, ...queue.due].map((item) => item.itemId);
  if (!queuedIds.length) throw new Error(mode === 'weak' ? 'No relearning vocabulary is ready right now.' : 'No vocabulary is due for review.');
  const rows = await database.getAllAsync<{ id: string }>(
    `SELECT id FROM curriculum_items
     WHERE type = 'vocabulary' AND curriculum_source = 'bundled' AND release_ready = 1
       AND id IN (${queuedIds.map(() => '?').join(', ')})`,
    ...queuedIds,
  );
  const availableIds = new Set(rows.map((row) => row.id));
  const vocabularyIds = queuedIds.filter((id) => availableIds.has(id)).slice(0, 20);
  if (!vocabularyIds.length) throw new Error('No vocabulary cards are due for review.');
  return startVocabularySession(vocabularyIds, 'review');
}

export async function answerStudySessionQuestion(
  sessionId: string,
  selectedOptionId: string,
  responseTimeMs: number,
): Promise<StudySession> {
  const session = await getStudySession(sessionId);
  if (!session || session.status !== 'in-progress') throw new Error('This practice session is no longer available.');
  const question = session.questions[session.currentIndex];
  if (!question || !question.options.some((option) => option.id === selectedOptionId)) {
    throw new Error('Select one of the available answers.');
  }
  if (!session.attempts.some((attempt) => attempt.questionId === question.id)) {
    const profile = await getLearnerProfile();
    await recordLearningAttempt({
      id: createLocalId('vocabulary-attempt'),
      userId: profile.id,
      itemId: question.vocabularyId,
      questionId: question.id,
      lessonId: session.id,
      mode: 'quiz',
      correct: selectedOptionId === question.correctOptionId,
      responseTimeMs: Math.max(0, Math.round(responseTimeMs)),
      selectedAnswer: selectedOptionId,
      expectedAnswer: question.correctOptionId,
      createdAt: new Date().toISOString(),
    });
  }
  const updated = await getStudySession(sessionId);
  if (!updated) throw new Error('The saved practice session could not be reloaded.');
  return updated;
}

export async function advanceStudySession(sessionId: string): Promise<StudySession> {
  const session = await getStudySession(sessionId);
  if (!session || session.status !== 'in-progress') throw new Error('This practice session is no longer available.');
  const currentQuestion = session.questions[session.currentIndex];
  if (!currentQuestion || !session.attempts.some((attempt) => attempt.questionId === currentQuestion.id)) {
    throw new Error('Answer the current question before continuing.');
  }
  const database = await getDatabase();
  const now = new Date().toISOString();
  const isComplete = session.currentIndex >= session.questions.length - 1;
  await database.runAsync(
    `UPDATE study_sessions
     SET current_index = ?, status = ?, updated_at = ?, completed_at = ?
     WHERE id = ?`,
    isComplete ? session.currentIndex : session.currentIndex + 1,
    isComplete ? 'completed' : 'in-progress',
    now,
    isComplete ? now : null,
    sessionId,
  );
  const updated = await getStudySession(sessionId);
  if (!updated) throw new Error('The saved practice session could not be reloaded.');
  return updated;
}

export async function getStudySessionResult(sessionId: string): Promise<StudySessionResult | undefined> {
  const session = await getStudySession(sessionId);
  if (!session) return undefined;
  const correctCount = session.attempts.filter((attempt) => attempt.correct).length;
  return {
    session,
    correctCount,
    totalQuestions: session.questions.length,
    percentage: session.questions.length ? Math.round((correctCount / session.questions.length) * 100) : 0,
  };
}

export async function getSuggestedVocabulary(limit = 8): Promise<CurriculumWithMastery[]> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const rows = await database.getAllAsync<CurriculumMasteryRow>(
    `${curriculumMasterySelect}
     AND c.type = 'vocabulary'
     ORDER BY
       CASE
         WHEN m.status = 'weak' THEN 0
         WHEN m.next_review_at IS NOT NULL AND m.next_review_at <= ? THEN 1
         WHEN m.status = 'learning' THEN 2
         WHEN m.status = 'new' THEN 3
         ELSE 4
       END,
       m.mastery_score ASC, c.id ASC
     LIMIT ?`,
    now,
    Math.max(1, Math.min(limit, 30)),
  );
  return rows.map(mapCurriculumWithMastery);
}

export async function getVocabularyForReview(status?: MasteryStatus): Promise<CurriculumWithMastery[]> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  const filter = status === 'weak'
    ? "m.status = 'weak'"
    : "m.status = 'weak' OR (m.next_review_at IS NOT NULL AND m.next_review_at <= ?)";
  const rows = await database.getAllAsync<CurriculumMasteryRow>(
    `${curriculumMasterySelect}
     AND c.type = 'vocabulary' AND (${filter})
     ORDER BY CASE WHEN m.status = 'weak' THEN 0 ELSE 1 END, m.next_review_at ASC, c.id ASC
     LIMIT 30`,
    ...(status === 'weak' ? [] : [now]),
  );
  return rows.map(mapCurriculumWithMastery);
}
