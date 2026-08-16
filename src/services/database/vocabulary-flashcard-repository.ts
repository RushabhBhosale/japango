import { z } from 'zod';

import type { MasteryStatus } from '@/types/learning';
import type {
  VocabularyFlashcard,
  VocabularyFlashcardProgress,
  VocabularyFlashcardQuery,
} from '@/types/vocabulary-flashcards';

import { getDatabase, waitForLearningContentInstallation } from './database';
import { getSetting, setSetting } from './settings-repository';

interface VocabularyFlashcardRow {
  id: string;
  level: 'N5' | 'N4';
  title: string;
  reading: string | null;
  meaning: string | null;
  tags_json: string;
  mastery_status: string;
  correct_count: number;
  incorrect_count: number;
}

const progressSchema = z.object({
  filterKey: z.string().min(1),
  index: z.number().int().nonnegative(),
  orderedIds: z.array(z.string().min(1)),
}).strict();

const tagsSchema = z.array(z.string());
const vocabularyFlashcardProgressKey = 'v3.vocabulary_flashcards.progress';

function isMasteryStatus(value: string): value is MasteryStatus {
  return ['new', 'learning', 'weak', 'review', 'mastered'].includes(value);
}

function mapFlashcard(row: VocabularyFlashcardRow): VocabularyFlashcard {
  return {
    id: row.id,
    level: row.level,
    japanese: row.title,
    reading: row.reading ?? undefined,
    meaning: row.meaning ?? undefined,
    tags: tagsSchema.parse(JSON.parse(row.tags_json) as unknown),
    masteryStatus: isMasteryStatus(row.mastery_status) ? row.mastery_status : 'new',
    learned: row.correct_count + row.incorrect_count > 0 || row.mastery_status !== 'new',
  };
}

export async function getVocabularyFlashcards(query: VocabularyFlashcardQuery): Promise<VocabularyFlashcard[]> {
  await waitForLearningContentInstallation();
  const database = await getDatabase();
  const clauses = [
    `c.type = 'vocabulary'`,
    `c.curriculum_source IN ('bundled', 'course-support')`,
    'c.release_ready = 1',
  ];
  const values: (string | number)[] = [];

  if (query.level !== 'all') {
    clauses.push('c.level = ?');
    values.push(query.level);
  }
  if (query.progress === 'learned') {
    clauses.push("(COALESCE(m.correct_count, 0) + COALESCE(m.incorrect_count, 0) > 0 OR COALESCE(m.status, 'new') <> 'new')");
  } else if (query.progress === 'unlearned') {
    clauses.push("COALESCE(m.correct_count, 0) + COALESCE(m.incorrect_count, 0) = 0 AND COALESCE(m.status, 'new') = 'new'");
  }

  const rows = await database.getAllAsync<VocabularyFlashcardRow>(
    `SELECT c.id, c.level, c.title, c.reading, c.meaning, c.tags_json,
            COALESCE(m.status, 'new') AS mastery_status,
            COALESCE(m.correct_count, 0) AS correct_count,
            COALESCE(m.incorrect_count, 0) AS incorrect_count
     FROM curriculum_items AS c
     INNER JOIN learner_profile AS p ON 1 = 1
     LEFT JOIN user_mastery AS m ON m.user_id = p.id AND m.item_id = c.id
     LEFT JOIN practice_sync_state AS practice_state ON practice_state.id = 1
     LEFT JOIN practice_skill_profile AS practice
       ON practice.user_id = p.id AND practice.curriculum_item_id = c.id
       AND practice_state.personalization_enabled = 1
     WHERE ${clauses.join(' AND ')}
     ORDER BY CASE WHEN COALESCE(practice.mistakes, 0) >= 2 THEN 0 ELSE 1 END,
       COALESCE(practice.mistakes, 0) DESC,
       CASE c.level WHEN 'N5' THEN 0 ELSE 1 END, c.id`,
    ...values,
  );
  return rows.map(mapFlashcard);
}

export async function getVocabularyFlashcardProgress(): Promise<VocabularyFlashcardProgress | undefined> {
  return getSetting(vocabularyFlashcardProgressKey, progressSchema);
}

export async function saveVocabularyFlashcardProgress(progress: VocabularyFlashcardProgress): Promise<void> {
  await setSetting(vocabularyFlashcardProgressKey, progress, progressSchema);
}
