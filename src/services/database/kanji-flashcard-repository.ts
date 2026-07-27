import { createKanjiFlashcards, kanjiFlashcardAttemptPolicy } from '@/features/kanji/flashcards';
import { getDatabase } from '@/services/database/database';
import type { FsrsRating } from '@/types/fsrs';
import type { KanjiFlashcard, KanjiFlashcardDirection, KanjiFlashcardItem, KanjiFlashcardSet } from '@/types/kanji-flashcards';
import { createLocalId } from '@/utils/id';
import { z } from 'zod';

import { getKanjiNotebookItems } from './content-learning-repository';
import { getLearnerProfile } from './profile-repository';
import { recordLearningAttempt } from './progress-repository';
import { getSetting, setSetting } from './settings-repository';

const directionsSchema = z.array(z.enum(['kanji-to-meaning', 'kanji-to-reading', 'meaning-to-kanji', 'reading-to-kanji', 'vocabulary-to-reading'])).min(1);
const itemIdsSchema = z.array(z.string().min(1));
const flashcardConfigurationSchema = z.object({
  set: z.enum(['N5', 'N4', 'all', 'weak', 'due', 'bookmarked', 'recently-incorrect', 'custom']),
  directions: directionsSchema,
}).strict();

interface FlashcardSessionRow {
  id: string;
  set_name: KanjiFlashcardSet;
  directions_json: string;
  item_ids_json: string;
  current_index: number;
  status: 'in-progress' | 'completed' | 'ended';
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface KanjiFlashcardSession {
  id: string;
  cards: KanjiFlashcard[];
  currentIndex: number;
  status: FlashcardSessionRow['status'];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

async function recentlyIncorrectKanjiIds(): Promise<Set<string>> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ item_id: string }>(`
    SELECT DISTINCT attempts.item_id
    FROM learning_attempts AS attempts
    INNER JOIN curriculum_items AS items ON items.id = attempts.item_id
    WHERE items.type = 'kanji' AND items.curriculum_source = 'bundled' AND items.release_ready = 1
      AND attempts.correct = 0 AND attempts.created_at >= datetime('now', '-30 days')
    ORDER BY attempts.item_id
  `);
  return new Set(rows.map((row) => row.item_id));
}

async function vocabularyExamples(items: readonly { vocabularyIds: string[] }[]): Promise<Map<string, string>> {
  const vocabularyIds = [...new Set(items.flatMap((item) => item.vocabularyIds))];
  if (!vocabularyIds.length) return new Map();
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ id: string; title: string }>(
    `SELECT id, title FROM curriculum_items WHERE id IN (${vocabularyIds.map(() => '?').join(', ')})`,
    ...vocabularyIds,
  );
  return new Map(rows.map((row) => [row.id, row.title]));
}

export async function getKanjiFlashcardItems(input: {
  set: KanjiFlashcardSet;
  itemIds?: string[];
}): Promise<KanjiFlashcardItem[]> {
  const filter = input.set === 'N5' || input.set === 'N4' || input.set === 'weak' || input.set === 'due' || input.set === 'bookmarked'
    ? input.set
    : 'all';
  const [items, incorrectIds] = await Promise.all([
    getKanjiNotebookItems(filter),
    input.set === 'recently-incorrect' ? recentlyIncorrectKanjiIds() : Promise.resolve(undefined),
  ]);
  const requestedIds = input.set === 'custom' ? new Set(input.itemIds ?? []) : undefined;
  const selected = items.filter((item) => {
    if (incorrectIds) return incorrectIds.has(item.id);
    if (requestedIds) return requestedIds.has(item.id);
    return true;
  });
  const examples = await vocabularyExamples(selected);
  return selected.map((item) => {
    const attempts = item.mastery.correctCount + item.mastery.incorrectCount;
    return {
      ...item,
      exampleVocabulary: item.vocabularyIds.flatMap((id) => examples.get(id) ? [examples.get(id)!] : []).slice(0, 3),
      recentAccuracy: attempts ? Math.round((item.mastery.correctCount / attempts) * 100) : undefined,
    };
  });
}

export async function createKanjiFlashcardSession(input: {
  set: KanjiFlashcardSet;
  directions: KanjiFlashcardDirection[];
  itemIds?: string[];
}): Promise<KanjiFlashcard[]> {
  return createKanjiFlashcards(await getKanjiFlashcardItems({ set: input.set, itemIds: input.itemIds }), input.directions);
}

async function mapPersistedSession(row: FlashcardSessionRow): Promise<KanjiFlashcardSession> {
  const directions = directionsSchema.parse(JSON.parse(row.directions_json) as unknown);
  const itemIds = itemIdsSchema.parse(JSON.parse(row.item_ids_json) as unknown);
  const cards = createKanjiFlashcards(
    await getKanjiFlashcardItems({ set: 'custom', itemIds }),
    directions,
  );
  return {
    id: row.id,
    cards,
    currentIndex: Math.min(row.current_index, cards.length),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export async function startPersistedKanjiFlashcardSession(input: {
  set: KanjiFlashcardSet;
  directions: KanjiFlashcardDirection[];
  itemIds?: string[];
}): Promise<KanjiFlashcardSession> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  const existing = await database.getFirstAsync<FlashcardSessionRow>(
    `SELECT id, set_name, directions_json, item_ids_json, current_index, status, created_at, updated_at, completed_at
     FROM kanji_flashcard_sessions
     WHERE user_id = ? AND status = 'in-progress'
     ORDER BY updated_at DESC LIMIT 1`,
    profile.id,
  );
  if (existing) return mapPersistedSession(existing);

  const items = await getKanjiFlashcardItems({ set: input.set, itemIds: input.itemIds });
  const directions = directionsSchema.parse(input.directions);
  const cards = createKanjiFlashcards(items, directions);
  const now = new Date().toISOString();
  const id = createLocalId('kanji-flashcard-session');
  await database.runAsync(
    `INSERT INTO kanji_flashcard_sessions
      (id, user_id, set_name, directions_json, item_ids_json, current_index, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, 'in-progress', ?, ?)`,
    id,
    profile.id,
    input.set,
    JSON.stringify(directions),
    JSON.stringify(cards.map((card) => card.item.id)),
    now,
    now,
  );
  await setSetting('kanji_flashcard_configuration', { set: input.set, directions }, flashcardConfigurationSchema);
  return {
    id,
    cards,
    currentIndex: 0,
    status: 'in-progress',
    createdAt: now,
    updatedAt: now,
  };
}

export async function advancePersistedKanjiFlashcardSession(
  session: KanjiFlashcardSession,
): Promise<KanjiFlashcardSession> {
  const database = await getDatabase();
  const nextIndex = session.currentIndex + 1;
  const complete = nextIndex >= session.cards.length;
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE kanji_flashcard_sessions
     SET current_index = ?, status = ?, updated_at = ?, completed_at = ?
     WHERE id = ?`,
    nextIndex,
    complete ? 'completed' : 'in-progress',
    now,
    complete ? now : null,
    session.id,
  );
  return {
    ...session,
    currentIndex: nextIndex,
    status: complete ? 'completed' : 'in-progress',
    updatedAt: now,
    completedAt: complete ? now : undefined,
  };
}

export async function endPersistedKanjiFlashcardSession(sessionId: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE kanji_flashcard_sessions
     SET status = CASE WHEN status = 'in-progress' THEN 'ended' ELSE status END,
       updated_at = ?, completed_at = CASE WHEN status = 'in-progress' THEN ? ELSE completed_at END
     WHERE id = ?`,
    now,
    now,
    sessionId,
  );
}

export async function getKanjiFlashcardConfiguration(): Promise<z.infer<typeof flashcardConfigurationSchema> | undefined> {
  return getSetting('kanji_flashcard_configuration', flashcardConfigurationSchema);
}

export async function getLatestKanjiFlashcardSession(): Promise<{
  status: 'in-progress' | 'completed' | 'ended';
  itemCount: number;
  updatedAt: string;
} | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<Pick<FlashcardSessionRow, 'status' | 'item_ids_json' | 'updated_at'>>(
    `SELECT status, item_ids_json, updated_at
     FROM kanji_flashcard_sessions
     WHERE user_id = (SELECT id FROM learner_profile LIMIT 1)
     ORDER BY updated_at DESC LIMIT 1`,
  );
  if (!row) return undefined;
  return {
    status: row.status,
    itemCount: itemIdsSchema.parse(JSON.parse(row.item_ids_json) as unknown).length,
    updatedAt: row.updated_at,
  };
}

export async function recordKanjiFlashcardRating(input: {
  itemId: string;
  direction: KanjiFlashcardDirection;
  rating: FsrsRating;
  responseTimeMs: number;
  sessionId?: string;
}): Promise<void> {
  const profile = await getLearnerProfile();
  const policy = kanjiFlashcardAttemptPolicy(input.rating);
  await recordLearningAttempt({
    id: createLocalId('kanji-flashcard-rating'),
    userId: profile.id,
    itemId: input.itemId,
    lessonId: input.sessionId ?? `kanji-flashcard-${input.direction}`,
    mode: 'quiz',
    correct: policy.correct,
    responseTimeMs: Math.max(0, Math.round(input.responseTimeMs)),
    selectedAnswer: input.rating,
    expectedAnswer: 'again | hard | good | easy',
    createdAt: new Date().toISOString(),
  }, policy.rating);
}
