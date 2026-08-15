import { selectDailyHomework, type DailyHomeworkCandidate } from '@/features/daily-homework/selector';
import type { CurrentLearningTarget, DailyHomework, DailyHomeworkItem, DailyHomeworkItemType, DailyHomeworkSource } from '@/types/daily-homework';
import { createLocalId } from '@/utils/id';

import { getLearnerProfile } from './profile-repository';
import { getDatabase } from './database';

interface HomeworkRow {
  id: string;
  user_id: string;
  homework_date: string;
  estimated_minutes: number;
  created_at: string;
  completed_at: string | null;
}

interface HomeworkItemRow {
  id: string;
  homework_id: string;
  item_id: string;
  item_type: DailyHomeworkItemType;
  source: DailyHomeworkSource;
  position: number;
  title: string;
  reading: string | null;
  meaning: string | null;
}

interface CandidateRow {
  id: string;
  type: DailyHomeworkItemType;
  title: string;
  reading: string | null;
  meaning: string | null;
  status: 'new' | 'learning' | 'weak' | 'review' | 'mastered' | null;
  incorrect_count: number | null;
  mastery_score: number | null;
  due_at: string | null;
  card_state: string | null;
}

interface LearnerSkillRow {
  type: DailyHomeworkItemType;
  skill_key: string;
  mastery: number;
  mistakes: number;
}

export function localDateKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/[\s\-‐‑–—_]/gu, '');
}

function mapHomeworkItem(row: HomeworkItemRow): DailyHomeworkItem {
  return {
    id: row.id,
    homeworkId: row.homework_id,
    itemId: row.item_id,
    type: row.item_type,
    source: row.source,
    position: row.position,
    title: row.title,
    reading: row.reading ?? undefined,
    meaning: row.meaning ?? undefined,
  };
}

async function getHomeworkRows(homeworkId: string): Promise<HomeworkItemRow[]> {
  const database = await getDatabase();
  return database.getAllAsync<HomeworkItemRow>(
    `SELECT items.id, items.homework_id, items.item_id, items.item_type, items.source, items.position,
            curriculum.title, curriculum.reading, curriculum.meaning
     FROM daily_homework_items AS items
     INNER JOIN curriculum_items AS curriculum ON curriculum.id = items.item_id
     WHERE items.homework_id = ? ORDER BY items.position ASC`,
    homeworkId,
  );
}

async function completedItemIds(homework: HomeworkRow, itemIds: readonly string[]): Promise<string[]> {
  if (!itemIds.length) return [];
  const database = await getDatabase();
  const marks = itemIds.map(() => '?').join(', ');
  const rows = await database.getAllAsync<{ item_id: string }>(
    `SELECT DISTINCT item_id FROM learning_attempts
     WHERE user_id = ? AND created_at >= ? AND item_id IN (${marks})
     UNION
     SELECT item_id FROM fsrs_cards
     WHERE user_id = ? AND last_reviewed_at >= ? AND item_id IN (${marks})`,
    homework.user_id,
    homework.created_at,
    ...itemIds,
    homework.user_id,
    homework.created_at,
    ...itemIds,
  );
  return rows.map((row) => row.item_id);
}

async function readHomework(row: HomeworkRow): Promise<DailyHomework> {
  const items = (await getHomeworkRows(row.id)).map(mapHomeworkItem);
  const completed = await completedItemIds(row, items.map((item) => item.itemId));
  const completedAt = completed.length === items.length && items.length > 0
    ? row.completed_at ?? new Date().toISOString()
    : row.completed_at ?? undefined;
  if (completedAt && !row.completed_at) {
    const database = await getDatabase();
    await database.runAsync('UPDATE daily_homework SET completed_at = ? WHERE id = ? AND completed_at IS NULL', completedAt, row.id);
  }
  return {
    id: row.id,
    userId: row.user_id,
    date: row.homework_date,
    estimatedMinutes: row.estimated_minutes,
    createdAt: row.created_at,
    completedAt,
    items,
    completedItemIds: completed,
  };
}

function sourceFor(row: CandidateRow, chatSkills: ReadonlyMap<string, LearnerSkillRow>, now: Date): { source: DailyHomeworkSource; priority: number } {
  const dueAt = row.due_at;
  const due = dueAt && dueAt <= now.toISOString() && row.card_state !== 'new' && row.card_state !== 'suspended' && row.card_state !== 'buried';
  if (due && dueAt) {
    const overdueHours = Math.max(0, now.getTime() - Date.parse(dueAt)) / (60 * 60 * 1_000);
    return { source: 'due-review', priority: 1_000 + Math.min(overdueHours, 720) };
  }
  const skill = [row.title, row.reading ?? '', row.meaning ?? '']
    .map(normalize)
    .map((key) => chatSkills.get(`${row.type}:${key}`))
    .find((value): value is LearnerSkillRow => Boolean(value));
  if (skill?.mistakes && skill.mistakes >= 2) {
    return { source: 'chat-mistake', priority: 800 + skill.mistakes * 10 + (1 - skill.mastery) * 100 };
  }
  if (row.status === 'weak' || (row.incorrect_count ?? 0) >= 2) {
    return { source: 'weakness', priority: 600 + (row.incorrect_count ?? 0) * 10 + (100 - (row.mastery_score ?? 0)) };
  }
  if (!row.status || row.status === 'new') return { source: 'new', priority: 400 };
  return { source: 'weakness', priority: 100 + (100 - (row.mastery_score ?? 0)) };
}

async function selectCandidates(): Promise<DailyHomeworkCandidate[]> {
  const database = await getDatabase();
  const now = new Date();
  const [rows, skills] = await Promise.all([
    database.getAllAsync<CandidateRow>(
      `SELECT curriculum.id, curriculum.type, curriculum.title, curriculum.reading, curriculum.meaning,
              mastery.status, mastery.incorrect_count, mastery.mastery_score,
              cards.due_at, cards.state AS card_state
       FROM curriculum_items AS curriculum
       INNER JOIN learner_profile AS profile ON 1 = 1
       LEFT JOIN user_mastery AS mastery ON mastery.user_id = profile.id AND mastery.item_id = curriculum.id
       LEFT JOIN fsrs_cards AS cards ON cards.user_id = profile.id AND cards.item_id = curriculum.id
       WHERE curriculum.type IN ('vocabulary', 'kanji', 'grammar')
         AND curriculum.curriculum_source IN ('bundled', 'course-support')
         AND curriculum.release_ready = 1
       ORDER BY curriculum.type, curriculum.id
       LIMIT 600`,
    ),
    database.getAllAsync<LearnerSkillRow>(
      `SELECT type, skill_key, mastery, mistakes FROM learner_skills
       WHERE type IN ('vocabulary', 'kanji', 'grammar') AND mistakes >= 2
       ORDER BY mastery ASC, mistakes DESC LIMIT 40`,
    ),
  ]);
  const chatSkills = new Map(skills.map((skill) => [`${skill.type}:${normalize(skill.skill_key)}`, skill]));
  return rows.map((row) => {
    const candidate = sourceFor(row, chatSkills, now);
    return { id: row.id, type: row.type, ...candidate };
  });
}

export async function getDailyHomework(date = localDateKey()): Promise<DailyHomework | undefined> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  const row = await database.getFirstAsync<HomeworkRow>(
    'SELECT id, user_id, homework_date, estimated_minutes, created_at, completed_at FROM daily_homework WHERE user_id = ? AND homework_date = ?',
    profile.id,
    date,
  );
  return row ? readHomework(row) : undefined;
}

/** Builds once per local date and returns the same authored plan on every reopen. */
export async function getOrCreateDailyHomework(date = localDateKey()): Promise<DailyHomework> {
  const existing = await getDailyHomework(date);
  if (existing) return existing;

  const [database, profile, candidates] = await Promise.all([getDatabase(), getLearnerProfile(), selectCandidates()]);
  const selected = selectDailyHomework(candidates);
  const id = createLocalId('daily-homework');
  const now = new Date().toISOString();
  try {
    await database.withTransactionAsync(async () => {
      await database.runAsync(
        `INSERT INTO daily_homework (id, user_id, homework_date, estimated_minutes, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        id,
        profile.id,
        date,
        Math.min(10, Math.max(5, Math.ceil(selected.length * 0.8))),
        now,
      );
      for (const [position, item] of selected.entries()) {
        await database.runAsync(
          `INSERT INTO daily_homework_items (id, homework_id, item_id, item_type, source, position)
           VALUES (?, ?, ?, ?, ?, ?)`,
          createLocalId('daily-homework-item'),
          id,
          item.id,
          item.type,
          item.source,
          position,
        );
      }
    });
  } catch (error) {
    const concurrent = await getDailyHomework(date);
    if (concurrent) return concurrent;
    throw error;
  }
  const created = await getDailyHomework(date);
  if (!created) throw new Error('Today’s homework could not be saved.');
  return created;
}

export async function getCurrentLearningTargets(date = localDateKey()): Promise<CurrentLearningTarget[]> {
  const homework = await getOrCreateDailyHomework(date);
  return homework.items.map((item) => ({
    itemId: item.itemId,
    type: item.type,
    key: item.title,
    reading: item.reading,
    meaning: item.meaning,
  }));
}
