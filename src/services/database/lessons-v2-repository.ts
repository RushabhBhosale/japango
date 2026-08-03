import { z } from 'zod';

import type { LessonV2Progress, LessonV2Version, LessonsV2WordAction } from '@/types/lessons-v2';
import { lessonV2ProgressSchema, lessonV2VersionSchema } from '@/types/lessons-v2';
import { createLocalId } from '@/utils/id';

import { getDatabase } from './database';
import { getLearnerProfile } from './profile-repository';
import { getSetting, setSetting } from './settings-repository';

interface CachedLessonRow { lesson_version_id: string; snapshot_json: string; }
interface ProgressRow { lesson_version_id: string; current_section_id: string | null; completed_section_ids_json: string; completed_question_ids_json: string; started_at: string | null; completed_at: string | null; updated_at: string; }

export async function cacheLessonsV2(lessons: readonly LessonV2Version[]): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  for (const lesson of lessons) {
    await database.runAsync(
      `INSERT INTO lesson_v2_cached_lessons (lesson_version_id, lesson_id, snapshot_json, cached_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(lesson_version_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, cached_at = excluded.cached_at`,
      lesson.id, lesson.lessonId, JSON.stringify(lesson), now,
    );
  }
}

export async function getCachedLessonsV2(): Promise<LessonV2Version[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<CachedLessonRow>('SELECT lesson_version_id, snapshot_json FROM lesson_v2_cached_lessons ORDER BY cached_at DESC');
  return rows.map((row) => lessonV2VersionSchema.parse(JSON.parse(row.snapshot_json) as unknown));
}

export async function getCachedLessonV2(lessonId: string): Promise<LessonV2Version | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<CachedLessonRow>('SELECT lesson_version_id, snapshot_json FROM lesson_v2_cached_lessons WHERE lesson_id = ? ORDER BY cached_at DESC LIMIT 1', lessonId);
  return row ? lessonV2VersionSchema.parse(JSON.parse(row.snapshot_json) as unknown) : undefined;
}

export async function getLessonsV2Progress(lessonVersionId: string): Promise<LessonV2Progress> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  const row = await database.getFirstAsync<ProgressRow>('SELECT lesson_version_id, current_section_id, completed_section_ids_json, completed_question_ids_json, started_at, completed_at, updated_at FROM lesson_v2_progress WHERE user_id = ? AND lesson_version_id = ?', profile.id, lessonVersionId);
  return lessonV2ProgressSchema.parse(row ? {
    lessonVersionId: row.lesson_version_id,
    currentSectionId: row.current_section_id ?? undefined,
    completedSectionIds: JSON.parse(row.completed_section_ids_json) as unknown,
    completedQuestionIds: JSON.parse(row.completed_question_ids_json) as unknown,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    updatedAt: row.updated_at,
  } : { lessonVersionId, completedSectionIds: [], completedQuestionIds: [], updatedAt: new Date().toISOString() });
}

export async function saveLessonsV2Progress(progress: LessonV2Progress): Promise<void> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  await database.runAsync(
    `INSERT INTO lesson_v2_progress (user_id, lesson_version_id, current_section_id, completed_section_ids_json, completed_question_ids_json, started_at, completed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, lesson_version_id) DO UPDATE SET current_section_id = excluded.current_section_id, completed_section_ids_json = excluded.completed_section_ids_json, completed_question_ids_json = excluded.completed_question_ids_json, started_at = excluded.started_at, completed_at = excluded.completed_at, updated_at = excluded.updated_at`,
    profile.id, progress.lessonVersionId, progress.currentSectionId ?? null, JSON.stringify(progress.completedSectionIds), JSON.stringify(progress.completedQuestionIds), progress.startedAt ?? null, progress.completedAt ?? null, progress.updatedAt,
  );
}

export async function recordLessonsV2Attempt(input: { lessonVersionId: string; questionId: string; selectedChoiceId?: string; correct: boolean; responseTimeMs: number }): Promise<void> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  await database.runAsync(
    'INSERT INTO lesson_v2_attempts (id, user_id, lesson_version_id, question_id, selected_choice_id, correct, response_time_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    createLocalId('lesson-v2-attempt'), profile.id, input.lessonVersionId, input.questionId, input.selectedChoiceId ?? null, input.correct ? 1 : 0, Math.max(0, Math.round(input.responseTimeMs)), new Date().toISOString(),
  );
}

export async function saveLessonsV2WordAction(action: LessonsV2WordAction): Promise<void> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  await database.runAsync(
    `INSERT INTO lesson_v2_word_actions (user_id, dependency_type, dependency_id, is_favorite, marked_for_review, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, dependency_type, dependency_id) DO UPDATE SET is_favorite = excluded.is_favorite, marked_for_review = excluded.marked_for_review, updated_at = excluded.updated_at`,
    profile.id, action.dependencyType, action.dependencyId, action.isFavorite ? 1 : 0, action.markedForReview ? 1 : 0, new Date().toISOString(),
  );
}

export const lessonsV2ProgressInputSchema = z.object({ lessonVersionId: z.string().min(1), questionId: z.string().min(1) }).strict();

const furiganaModeSchema = z.enum(['hidden', 'always']);
const furiganaModeKey = 'lessons_v2.furigana_mode';

export async function getLessonsV2FuriganaMode(): Promise<'hidden' | 'always'> {
  return (await getSetting(furiganaModeKey, furiganaModeSchema)) ?? 'hidden';
}

export function setLessonsV2FuriganaMode(mode: 'hidden' | 'always'): Promise<void> {
  return setSetting(furiganaModeKey, mode, furiganaModeSchema);
}
