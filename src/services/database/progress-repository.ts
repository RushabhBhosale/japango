import { learningAttemptSchema, userMasterySchema } from '@/features/progress/schemas';
import type {
  CurriculumWithMastery,
  LearningAttempt,
  MasteryStatus,
  ProgressSummary,
  UserMastery,
} from '@/types/learning';
import type { FsrsCard, FsrsRating } from '@/types/fsrs';

import { getDatabase } from './database';
import { getFsrsDailyQueue, schedulePersistedReview } from './fsrs-repository';
import {
  mapAttemptRow,
  mapCurriculumRow,
  mapMasteryRow,
  type AttemptRow,
  type CurriculumRow,
  type MasteryRow,
} from './row-mappers';

interface CurriculumMasteryRow extends CurriculumRow, MasteryRow {}

function mapCurriculumMasteryRow(row: CurriculumMasteryRow): CurriculumWithMastery {
  const mastery = mapMasteryRow(row);
  return {
    ...mapCurriculumRow(row),
    mastery,
  };
}

function projectedMastery(previous: UserMastery | undefined, attempt: LearningAttempt, card: FsrsCard): UserMastery {
  const correctCount = (previous?.correctCount ?? 0) + (attempt.correct ? 1 : 0);
  const incorrectCount = (previous?.incorrectCount ?? 0) + (attempt.correct ? 0 : 1);
  const priorAttempts = (previous?.correctCount ?? 0) + (previous?.incorrectCount ?? 0);
  const totalAttempts = correctCount + incorrectCount;
  const averageResponseTimeMs = Math.round(((previous?.averageResponseTimeMs ?? 0) * priorAttempts + attempt.responseTimeMs) / totalAttempts);
  const status: MasteryStatus = card.state === 'new' ? 'new'
    : card.state === 'learning' ? 'learning'
      : card.state === 'relearning' ? 'weak'
        : card.state === 'mastered' ? 'mastered'
          : 'review';
  return userMasterySchema.parse({
    userId: attempt.userId,
    itemId: attempt.itemId,
    masteryScore: Math.min(100, Math.round(card.stability * 4 + card.repetitions * 3)),
    confidenceScore: Math.round(card.retrievability * 100),
    correctCount,
    incorrectCount,
    averageResponseTimeMs,
    lastReviewedAt: attempt.createdAt,
    nextReviewAt: card.dueAt,
    reviewIntervalDays: card.scheduledDays,
    status,
  });
}

export async function recordLearningAttempt(input: LearningAttempt, rating: FsrsRating = input.correct ? 'good' : 'again'): Promise<UserMastery> {
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

    const card = await schedulePersistedReview(database, {
      userId: attempt.userId,
      itemId: attempt.itemId,
      rating,
      reviewedAt: attempt.createdAt,
      responseTimeMs: attempt.responseTimeMs,
      attemptId: attempt.id,
    });
    const updated = projectedMastery(previous, attempt, card);
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

/** Records an explicit learner action without fabricating a correct answer or FSRS review. */
export async function markCurriculumItemStudied(itemId: string): Promise<UserMastery> {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE user_mastery
     SET status = CASE WHEN status = 'new' THEN 'learning' ELSE status END,
       mastery_score = CASE WHEN mastery_score < 5 THEN 5 ELSE mastery_score END
     WHERE user_id = (SELECT id FROM learner_profile LIMIT 1) AND item_id = ?`,
    itemId,
  );
  const row = await database.getFirstAsync<MasteryRow>(
    'SELECT * FROM user_mastery WHERE user_id = (SELECT id FROM learner_profile LIMIT 1) AND item_id = ?',
    itemId,
  );
  if (!row) throw new Error('The selected curriculum item could not be marked as studied.');
  return mapMasteryRow(row);
}

const curriculumMasterySelect = `
  SELECT
    c.id, c.type, c.level, c.title, c.meaning, c.reading, c.explanation, c.tags_json,
    m.user_id, m.item_id, m.mastery_score, m.confidence_score, m.correct_count,
    m.incorrect_count, m.average_response_time_ms, m.last_reviewed_at,
    m.next_review_at, m.review_interval_days, m.status
  FROM curriculum_items c
  INNER JOIN user_mastery m ON m.item_id = c.id
  WHERE c.curriculum_source IN ('bundled', 'course-support') AND c.release_ready = 1
`;

export async function getSuggestedCurriculum(limit = 8): Promise<CurriculumWithMastery[]> {
  const database = await getDatabase();
  const queue = await getFsrsDailyQueue();
  const itemIds = [...queue.learning, ...queue.overdue, ...queue.due, ...queue.newCards]
    .map((item) => item.itemId)
    .slice(0, Math.max(1, limit));
  if (!itemIds.length) return [];
  const rows = await database.getAllAsync<CurriculumMasteryRow>(
    `${curriculumMasterySelect}
     AND c.id IN (${itemIds.map(() => '?').join(', ')})`,
    ...itemIds,
  );
  const byId = new Map(rows.map((row) => [row.id, mapCurriculumMasteryRow(row)]));
  return itemIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

export async function getReviewCurriculum(limit = 30): Promise<CurriculumWithMastery[]> {
  const database = await getDatabase();
  const queue = await getFsrsDailyQueue();
  const itemIds = [...queue.learning, ...queue.overdue, ...queue.due]
    .map((item) => item.itemId)
    .slice(0, Math.max(1, limit));
  if (!itemIds.length) return [];
  const rows = await database.getAllAsync<CurriculumMasteryRow>(
    `${curriculumMasterySelect}
     AND c.id IN (${itemIds.map(() => '?').join(', ')})`,
    ...itemIds,
  );
  const byId = new Map(rows.map((row) => [row.id, mapCurriculumMasteryRow(row)]));
  return itemIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

export async function getProgressSummary(): Promise<ProgressSummary> {
  const database = await getDatabase();
  const now = new Date();
  const [queue, reviewRows] = await Promise.all([
    getFsrsDailyQueue(undefined, now),
    database.getAllAsync<{ reviewed_at: string; rating: string; response_time_ms: number; stability_after: number }>(
      `SELECT reviewed_at, rating, response_time_ms, stability_after
       FROM fsrs_review_history
       WHERE user_id = (SELECT id FROM learner_profile LIMIT 1)
       ORDER BY reviewed_at DESC LIMIT 5000`,
    ),
  ]);
  const masteryRows = await database.getAllAsync<MasteryRow>(
    `SELECT m.* FROM user_mastery AS m
     INNER JOIN curriculum_items AS c ON c.id = m.item_id
     WHERE c.curriculum_source IN ('bundled', 'course-support') AND c.release_ready = 1`,
  );
  const masteries = masteryRows.map(mapMasteryRow);
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
       AND c.curriculum_source IN ('bundled', 'course-support') AND c.release_ready = 1
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
     WHERE c.curriculum_source IN ('bundled', 'course-support') AND c.release_ready = 1
     ORDER BY a.created_at DESC LIMIT 8`,
  );
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const reviewedSince = (start: Date) => reviewRows.filter((row) => Date.parse(row.reviewed_at) >= start.getTime());
  const todayReviews = reviewedSince(startOfDay);
  const successful = reviewRows.filter(({ rating }) => rating !== 'again');
  const uniqueDays = [...new Set(reviewRows.map(({ reviewed_at }) => reviewed_at.slice(0, 10)))].sort().reverse();
  let currentStreak = 0; let cursor = new Date(startOfDay);
  while (uniqueDays.includes(cursor.toISOString().slice(0, 10))) { currentStreak += 1; cursor.setDate(cursor.getDate() - 1); }
  let longestStreak = 0; let runningStreak = 0; let previousDay: number | undefined;
  for (const date of [...uniqueDays].reverse()) { const day = Math.floor(Date.parse(`${date}T00:00:00.000Z`) / 86_400_000); runningStreak = previousDay === day - 1 ? runningStreak + 1 : 1; previousDay = day; longestStreak = Math.max(longestStreak, runningStreak); }
  const averageResponseTimeMs = reviewRows.length ? Math.round(reviewRows.reduce((sum, row) => sum + row.response_time_ms, 0) / reviewRows.length) : 0;
  const studyTimeMs = reviewRows.reduce((sum, row) => sum + row.response_time_ms, 0);
  const tomorrow = new Date(startOfDay); tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(tomorrow); dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
  const schedulerCounts = await database.getFirstAsync<{ mature: number; learning: number; fresh: number; due_tomorrow: number }>(
    `SELECT
       SUM(CASE WHEN stability >= 21 AND state IN ('review', 'mastered') THEN 1 ELSE 0 END) AS mature,
       SUM(CASE WHEN state IN ('learning', 'relearning') THEN 1 ELSE 0 END) AS learning,
       SUM(CASE WHEN state = 'new' THEN 1 ELSE 0 END) AS fresh,
       SUM(CASE WHEN due_at >= ? AND due_at < ? AND state NOT IN ('suspended', 'buried') THEN 1 ELSE 0 END) AS due_tomorrow
     FROM fsrs_cards WHERE user_id = (SELECT id FROM learner_profile LIMIT 1)`,
    tomorrow.toISOString(), dayAfterTomorrow.toISOString(),
  );
  return {
    statusCounts,
    masteredByType,
    dueCount: queue.overdue.length + queue.due.length + queue.learning.length,
    weakCount: queue.learning.filter((item) => item.state === 'relearning').length,
    recentAttempts: attemptRows.map((row) => ({ ...mapAttemptRow(row), itemTitle: row.item_title })),
    scheduler: {
      reviewsToday: todayReviews.length,
      reviewsThisWeek: reviewedSince(startOfWeek).length,
      reviewsThisMonth: reviewedSince(startOfMonth).length,
      averageAccuracy: reviewRows.length ? Math.round((successful.length / reviewRows.length) * 100) : 0,
      retention: reviewRows.length ? Math.round((successful.filter(({ stability_after }) => stability_after >= 21).length / Math.max(1, reviewRows.filter(({ stability_after }) => stability_after >= 21).length)) * 100) : 0,
      matureCards: schedulerCounts?.mature ?? 0,
      learningCards: schedulerCounts?.learning ?? 0,
      newCards: schedulerCounts?.fresh ?? 0,
      dueTomorrow: schedulerCounts?.due_tomorrow ?? 0,
      currentStreak,
      longestStreak,
      studyTimeMs,
      averageResponseTimeMs,
      estimatedStudyMinutes: Math.max(1, Math.ceil((queue.overdue.length + queue.due.length + queue.learning.length + queue.newCards.length) * 0.5)),
    },
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
