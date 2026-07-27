import { assignMasteryStatus, updateMasteryFromAttempt } from '@/features/progress/mastery-engine';
import { learningAttemptSchema, userMasterySchema } from '@/features/progress/schemas';
import type {
  CurriculumWithMastery,
  LearningAttempt,
  MasteryStatus,
  ProgressSummary,
  UserMastery,
} from '@/types/learning';

import { getDatabase } from './database';
import {
  mapAttemptRow,
  mapCurriculumRow,
  mapMasteryRow,
  type AttemptRow,
  type CurriculumRow,
  type MasteryRow,
} from './row-mappers';

interface CurriculumMasteryRow extends CurriculumRow, MasteryRow {}

function mapCurriculumMasteryRow(row: CurriculumMasteryRow, now = new Date()): CurriculumWithMastery {
  const mastery = mapMasteryRow(row);
  return {
    ...mapCurriculumRow(row),
    mastery: {
      ...mastery,
      status: assignMasteryStatus(mastery, now),
    },
  };
}

export async function recordLearningAttempt(input: LearningAttempt): Promise<UserMastery> {
  const attempt = learningAttemptSchema.parse(input);
  const database = await getDatabase();
  let result: UserMastery | undefined;

  await database.withTransactionAsync(async () => {
    const previousRow = await database.getFirstAsync<MasteryRow>(
      'SELECT * FROM user_mastery WHERE user_id = ? AND item_id = ?',
      attempt.userId,
      attempt.itemId,
    );
    const previous = previousRow ? mapMasteryRow(previousRow) : undefined;
    const insertResult = await database.runAsync(
      `INSERT OR IGNORE INTO learning_attempts
        (id, user_id, item_id, question_id, lesson_id, mode, correct,
         response_time_ms, selected_answer, expected_answer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      attempt.id,
      attempt.userId,
      attempt.itemId,
      attempt.questionId ?? null,
      attempt.lessonId,
      attempt.mode,
      attempt.correct ? 1 : 0,
      attempt.responseTimeMs,
      attempt.selectedAnswer ?? null,
      attempt.expectedAnswer ?? null,
      attempt.createdAt,
    );

    if (insertResult.changes === 0) {
      if (!previous) throw new Error('Attempt already exists without a mastery record.');
      result = previous;
      return;
    }

    const updated = userMasterySchema.parse(
      updateMasteryFromAttempt(previous, attempt, new Date(attempt.createdAt)),
    );
    await database.runAsync(
      `INSERT INTO user_mastery
        (user_id, item_id, mastery_score, confidence_score, correct_count, incorrect_count,
         average_response_time_ms, last_reviewed_at, next_review_at, review_interval_days, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, item_id) DO UPDATE SET
         mastery_score = excluded.mastery_score,
         confidence_score = excluded.confidence_score,
         correct_count = excluded.correct_count,
         incorrect_count = excluded.incorrect_count,
         average_response_time_ms = excluded.average_response_time_ms,
         last_reviewed_at = excluded.last_reviewed_at,
         next_review_at = excluded.next_review_at,
         review_interval_days = excluded.review_interval_days,
         status = excluded.status`,
      updated.userId,
      updated.itemId,
      updated.masteryScore,
      updated.confidenceScore,
      updated.correctCount,
      updated.incorrectCount,
      updated.averageResponseTimeMs,
      updated.lastReviewedAt ?? null,
      updated.nextReviewAt ?? null,
      updated.reviewIntervalDays,
      updated.status,
    );
    result = updated;
  });

  if (!result) throw new Error('The learning attempt could not be recorded.');
  return result;
}

const curriculumMasterySelect = `
  SELECT
    c.id, c.type, c.level, c.title, c.meaning, c.reading, c.explanation, c.tags_json,
    m.user_id, m.item_id, m.mastery_score, m.confidence_score, m.correct_count,
    m.incorrect_count, m.average_response_time_ms, m.last_reviewed_at,
    m.next_review_at, m.review_interval_days, m.status
  FROM curriculum_items c
  INNER JOIN user_mastery m ON m.item_id = c.id
`;

export async function getSuggestedCurriculum(limit = 8): Promise<CurriculumWithMastery[]> {
  const database = await getDatabase();
  const now = new Date();
  const rows = await database.getAllAsync<CurriculumMasteryRow>(
    `${curriculumMasterySelect}
     ORDER BY
       CASE
         WHEN m.status = 'weak' THEN 0
         WHEN m.next_review_at IS NOT NULL AND m.next_review_at <= ? THEN 1
         WHEN m.status = 'learning' THEN 2
         WHEN m.status = 'new' THEN 3
         ELSE 4
       END,
       m.mastery_score ASC,
       c.id ASC
     LIMIT ?`,
    now.toISOString(),
    limit,
  );
  return rows.map((row) => mapCurriculumMasteryRow(row, now));
}

export async function getReviewCurriculum(limit = 30): Promise<CurriculumWithMastery[]> {
  const database = await getDatabase();
  const now = new Date();
  const rows = await database.getAllAsync<CurriculumMasteryRow>(
    `${curriculumMasterySelect}
     WHERE m.status = 'weak'
        OR (m.next_review_at IS NOT NULL AND m.next_review_at <= ?)
     ORDER BY CASE WHEN m.status = 'weak' THEN 0 ELSE 1 END, m.next_review_at ASC
     LIMIT ?`,
    now.toISOString(),
    limit,
  );
  return rows.map((row) => mapCurriculumMasteryRow(row, now));
}

export async function getProgressSummary(): Promise<ProgressSummary> {
  const database = await getDatabase();
  const now = new Date();
  const masteryRows = await database.getAllAsync<MasteryRow>('SELECT * FROM user_mastery');
  const masteries = masteryRows.map((row) => {
    const mastery = mapMasteryRow(row);
    return { ...mastery, status: assignMasteryStatus(mastery, now) };
  });
  const statusCounts: Record<MasteryStatus, number> = {
    new: 0,
    learning: 0,
    weak: 0,
    review: 0,
    mastered: 0,
  };
  for (const mastery of masteries) statusCounts[mastery.status] += 1;

  const masteredRows = await database.getAllAsync<{ type: string; count: number }>(
    `SELECT c.type, COUNT(*) AS count
     FROM user_mastery m
     INNER JOIN curriculum_items c ON c.id = m.item_id
     WHERE m.status = 'mastered' AND c.type IN ('vocabulary', 'kanji', 'grammar')
     GROUP BY c.type`,
  );
  const masteredByType = { vocabulary: 0, kanji: 0, grammar: 0 };
  for (const row of masteredRows) {
    if (row.type === 'vocabulary' || row.type === 'kanji' || row.type === 'grammar') {
      masteredByType[row.type] = row.count;
    }
  }

  const attemptRows = await database.getAllAsync<AttemptRow & { item_title: string }>(
    `SELECT a.*, c.title AS item_title
     FROM learning_attempts a
     INNER JOIN curriculum_items c ON c.id = a.item_id
     ORDER BY a.created_at DESC LIMIT 8`,
  );
  return {
    statusCounts,
    masteredByType,
    dueCount: statusCounts.review,
    weakCount: statusCounts.weak,
    recentAttempts: attemptRows.map((row) => ({ ...mapAttemptRow(row), itemTitle: row.item_title })),
  };
}

export async function getMasteryForItem(
  userId: string,
  itemId: string,
): Promise<UserMastery | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<MasteryRow>(
    'SELECT * FROM user_mastery WHERE user_id = ? AND item_id = ?',
    userId,
    itemId,
  );
  return row ? mapMasteryRow(row) : undefined;
}
