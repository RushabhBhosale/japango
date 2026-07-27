import * as SQLite from 'expo-sqlite';
import { z } from 'zod';

import { createFsrsCard, restoreBuriedFsrsCard, restoreSuspendedFsrsCard, scheduleFsrsReview, suspendFsrsCard, buryFsrsCard } from '@/features/review/fsrs-scheduler';
import type { FsrsCard, FsrsQueue, FsrsQueueItem, FsrsQueueLimits, FsrsRating } from '@/types/fsrs';
import { createLocalId } from '@/utils/id';

import { getDatabase } from './database';
import { ensureFsrsCards, FSRS_SCHEDULER_VERSION } from './fsrs-bootstrap';
import { getSetting, setSetting } from './settings-repository';

const limitsSchema = z.object({ newCardsPerDay: z.number().int().min(0).max(100), reviewsPerDay: z.number().int().min(1).max(500) }).strict();
export const defaultFsrsQueueLimits: FsrsQueueLimits = { newCardsPerDay: 10, reviewsPerDay: 120 };

interface FsrsCardRow {
  user_id: string; item_id: string; state: FsrsCard['state']; stability: number; difficulty: number; retrievability: number;
  due_at: string; last_reviewed_at: string | null; repetitions: number; lapses: number; last_rating: FsrsRating | null;
  scheduled_days: number; elapsed_days: number; buried_until: string | null; suspended_at: string | null;
}

function mapCard(row: FsrsCardRow): FsrsCard {
  return { userId: row.user_id, itemId: row.item_id, state: row.state, stability: row.stability, difficulty: row.difficulty, retrievability: row.retrievability, dueAt: row.due_at, lastReviewedAt: row.last_reviewed_at ?? undefined, repetitions: row.repetitions, lapses: row.lapses, lastRating: row.last_rating ?? undefined, scheduledDays: row.scheduled_days, elapsedDays: row.elapsed_days, buriedUntil: row.buried_until ?? undefined, suspendedAt: row.suspended_at ?? undefined };
}

export async function getFsrsCard(database: SQLite.SQLiteDatabase, userId: string, itemId: string): Promise<FsrsCard> {
  const row = await database.getFirstAsync<FsrsCardRow>('SELECT user_id, item_id, state, stability, difficulty, retrievability, due_at, last_reviewed_at, repetitions, lapses, last_rating, scheduled_days, elapsed_days, buried_until, suspended_at FROM fsrs_cards WHERE user_id = ? AND item_id = ?', userId, itemId);
  if (row) return mapCard(row);
  const card = createFsrsCard(userId, itemId);
  await saveFsrsCard(database, card);
  return card;
}

export async function getCurrentUserFsrsCard(itemId: string): Promise<FsrsCard> {
  const database = await getDatabase();
  const profile = await database.getFirstAsync<{ id: string }>('SELECT id FROM learner_profile LIMIT 1');
  if (!profile) throw new Error('A learner profile is required before reading a review card.');
  return getFsrsCard(database, profile.id, itemId);
}

export async function saveFsrsCard(database: SQLite.SQLiteDatabase, card: FsrsCard): Promise<void> {
  await database.runAsync(
    `INSERT INTO fsrs_cards
      (user_id, item_id, state, stability, difficulty, retrievability, due_at, last_reviewed_at,
       repetitions, lapses, last_rating, scheduled_days, elapsed_days, buried_until, suspended_at,
       scheduler_version, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, item_id) DO UPDATE SET
       state = excluded.state, stability = excluded.stability, difficulty = excluded.difficulty,
       retrievability = excluded.retrievability, due_at = excluded.due_at,
       last_reviewed_at = excluded.last_reviewed_at, repetitions = excluded.repetitions,
       lapses = excluded.lapses, last_rating = excluded.last_rating, scheduled_days = excluded.scheduled_days,
       elapsed_days = excluded.elapsed_days, buried_until = excluded.buried_until,
       suspended_at = excluded.suspended_at, scheduler_version = excluded.scheduler_version,
       updated_at = excluded.updated_at`,
    card.userId, card.itemId, card.state, card.stability, card.difficulty, card.retrievability, card.dueAt,
    card.lastReviewedAt ?? null, card.repetitions, card.lapses, card.lastRating ?? null, card.scheduledDays,
    card.elapsedDays, card.buriedUntil ?? null, card.suspendedAt ?? null, FSRS_SCHEDULER_VERSION, new Date().toISOString(),
  );
}

export async function schedulePersistedReview(
  database: SQLite.SQLiteDatabase,
  input: { userId: string; itemId: string; rating: FsrsRating; reviewedAt: string; responseTimeMs: number; attemptId?: string },
): Promise<FsrsCard> {
  const previous = await getFsrsCard(database, input.userId, input.itemId);
  const result = scheduleFsrsReview(previous, input.rating, input.reviewedAt, input.responseTimeMs);
  await saveFsrsCard(database, result.card);
  await database.runAsync(
    `INSERT INTO fsrs_review_history
      (id, user_id, item_id, reviewed_at, rating, state_before, state_after, stability_before,
       stability_after, difficulty_before, difficulty_after, retrievability_before, response_time_ms,
       scheduled_days, due_at, attempt_id, scheduler_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    createLocalId('fsrs-review'), input.userId, input.itemId, input.reviewedAt, input.rating, result.previousState,
    result.card.state, previous.stability, result.card.stability, previous.difficulty, result.card.difficulty,
    previous.retrievability, input.responseTimeMs, result.card.scheduledDays, result.card.dueAt,
    input.attemptId ?? null, FSRS_SCHEDULER_VERSION,
  );
  return result.card;
}

export async function setFsrsCardState(itemId: string, action: 'bury' | 'suspend' | 'restore'): Promise<FsrsCard> {
  const database = await getDatabase();
  const profile = await database.getFirstAsync<{ id: string }>('SELECT id FROM learner_profile LIMIT 1');
  if (!profile) throw new Error('A learner profile is required before updating a review card.');
  const current = await getFsrsCard(database, profile.id, itemId);
  const next = action === 'bury' ? buryFsrsCard(current) : action === 'suspend' ? suspendFsrsCard(current) : restoreSuspendedFsrsCard(restoreBuriedFsrsCard(current));
  await saveFsrsCard(database, next);
  return next;
}

/** Makes an existing review card immediately eligible without recording a fabricated rating. */
export async function makeFsrsCardDueNow(itemId: string): Promise<FsrsCard> {
  const database = await getDatabase();
  const profile = await database.getFirstAsync<{ id: string }>('SELECT id FROM learner_profile LIMIT 1');
  if (!profile) throw new Error('A learner profile is required before updating a review card.');
  const current = await getFsrsCard(database, profile.id, itemId);
  const now = new Date().toISOString();
  const next: FsrsCard = {
    ...current,
    state: current.state === 'suspended' || current.state === 'buried'
      ? current.repetitions ? 'review' : 'new'
      : current.state,
    dueAt: now,
    buriedUntil: undefined,
    suspendedAt: undefined,
  };
  await saveFsrsCard(database, next);
  return next;
}

export async function restoreAllSuspendedFsrsCards(): Promise<number> {
  const database = await getDatabase();
  const profile = await database.getFirstAsync<{ id: string }>('SELECT id FROM learner_profile LIMIT 1');
  if (!profile) return 0;
  const result = await database.runAsync(
    `UPDATE fsrs_cards
     SET state = CASE WHEN repetitions >= 8 AND stability >= 21 THEN 'mastered' WHEN repetitions > 0 THEN 'review' ELSE 'new' END,
       suspended_at = NULL, updated_at = ?
     WHERE user_id = ? AND state = 'suspended'`,
    new Date().toISOString(),
    profile.id,
  );
  return result.changes;
}

export async function getFsrsQueueLimits(): Promise<FsrsQueueLimits> {
  return (await getSetting('fsrs_queue_limits', limitsSchema)) ?? defaultFsrsQueueLimits;
}

export async function setFsrsQueueLimits(limits: FsrsQueueLimits): Promise<void> {
  await setSetting('fsrs_queue_limits', limits, limitsSchema);
}

function queueItem(row: { item_id: string; state: FsrsCard['state']; due_at: string }, now: Date): FsrsQueueItem {
  return { itemId: row.item_id, state: row.state, dueAt: row.due_at, isOverdue: Date.parse(row.due_at) < now.getTime() };
}

export async function getFsrsDailyQueue(limits?: FsrsQueueLimits, now = new Date()): Promise<FsrsQueue> {
  const database = await getDatabase();
  const profile = await database.getFirstAsync<{ id: string }>('SELECT id FROM learner_profile LIMIT 1');
  if (!profile) return { overdue: [], due: [], learning: [], newCards: [] };
  await ensureFsrsCards(database);
  await database.runAsync(
    `UPDATE fsrs_cards
     SET state = CASE
       WHEN repetitions >= 8 AND stability >= 21 THEN 'mastered'
       WHEN repetitions > 0 THEN 'review'
       ELSE 'new'
     END,
       buried_until = NULL,
       updated_at = ?
     WHERE user_id = ? AND state = 'buried' AND buried_until IS NOT NULL AND buried_until <= ?`,
    now.toISOString(),
    profile.id,
    now.toISOString(),
  );
  const effectiveLimits = limits ?? await getFsrsQueueLimits();
  const today = now.toISOString();
  const rows = await database.getAllAsync<{ item_id: string; state: FsrsCard['state']; due_at: string }>(
    `SELECT item_id, state, due_at FROM fsrs_cards
     WHERE user_id = ? AND state NOT IN ('new', 'suspended', 'buried') AND due_at <= ?
     ORDER BY CASE state WHEN 'relearning' THEN 0 WHEN 'learning' THEN 1 WHEN 'review' THEN 2 WHEN 'mastered' THEN 3 ELSE 4 END, due_at, item_id
     LIMIT ?`,
    profile.id, today, effectiveLimits.reviewsPerDay,
  );
  const dueRows = rows.map((row) => queueItem(row, now));
  const learning = dueRows.filter((item) => item.state === 'learning' || item.state === 'relearning');
  const overdue = dueRows.filter((item) => item.isOverdue && item.state !== 'learning' && item.state !== 'relearning');
  const due = dueRows.filter((item) => !item.isOverdue && item.state !== 'learning' && item.state !== 'relearning');
  const newRows = await database.getAllAsync<{ item_id: string; due_at: string }>(
    `SELECT item_id, due_at FROM fsrs_cards WHERE user_id = ? AND state = 'new' ORDER BY item_id LIMIT ?`,
    profile.id, effectiveLimits.newCardsPerDay,
  );
  return { overdue, due, learning, newCards: newRows.map((row) => ({ itemId: row.item_id, state: 'new', dueAt: row.due_at, isOverdue: false })) };
}
