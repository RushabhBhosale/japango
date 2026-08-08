import { scoreV3Assessment, v3AssessmentQuestions } from '@/features/lesson-v3/assessment';
import {
  learningGoalSchema,
  selfReportedLevelSchema,
  v3AssessmentAnswerSchema,
  v3EpisodeProgressSchema,
  v3LearnerStateSchema,
} from '@/features/lesson-v3/schemas';
import type {
  LearningGoal,
  SelfReportedLevel,
  V3AssessmentAnswer,
  V3EpisodeProgress,
  V3LearnerState,
} from '@/types/lesson-v3';

import { getDatabase } from './database';

interface V3LearnerStateRow {
  onboarding_completed: number;
  learning_goal: string | null;
  self_reported_level: string | null;
  assistance_mode: string;
  assessment_completed: number;
  assessment_index: number;
  assessment_answers_json: string;
  assessment_result_json: string | null;
  updated_at: string;
}

interface V3EpisodeProgressRow {
  episode_id: string;
  current_scene_index: number;
  responses_json: string;
  learned_item_ids_json: string;
  story_choices_json: string;
  completed_at: string | null;
  updated_at: string;
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

async function ensureV3LearnerState(): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR IGNORE INTO v3_learner_state
      (id, onboarding_completed, assistance_mode, assessment_completed,
       assessment_index, assessment_answers_json, updated_at)
     VALUES (1, 0, 'guided', 0, 0, '[]', ?)`,
    new Date().toISOString(),
  );
}

function mapLearnerState(row: V3LearnerStateRow): V3LearnerState {
  return v3LearnerStateSchema.parse({
    onboardingCompleted: row.onboarding_completed === 1,
    learningGoal: row.learning_goal ?? undefined,
    selfReportedLevel: row.self_reported_level ?? undefined,
    assistanceMode: row.assistance_mode,
    assessmentCompleted: row.assessment_completed === 1,
    assessmentIndex: row.assessment_index,
    assessmentAnswers: parseJson(row.assessment_answers_json),
    assessmentResult: row.assessment_result_json ? parseJson(row.assessment_result_json) : undefined,
    updatedAt: row.updated_at,
  });
}

export async function getV3LearnerState(): Promise<V3LearnerState> {
  await ensureV3LearnerState();
  const database = await getDatabase();
  const row = await database.getFirstAsync<V3LearnerStateRow>('SELECT * FROM v3_learner_state WHERE id = 1');
  if (!row) throw new Error('V3 learner state was not initialized.');
  return mapLearnerState(row);
}

export async function completeV3Onboarding(
  learningGoal: LearningGoal,
  selfReportedLevel: SelfReportedLevel,
): Promise<V3LearnerState> {
  const goal = learningGoalSchema.parse(learningGoal);
  const level = selfReportedLevelSchema.parse(selfReportedLevel);
  const initialAssistance = ['completely-new', 'not-sure'].includes(level)
    ? 'guided'
    : level === 'kana' || level === 'n5'
      ? 'supported'
      : 'independent';
  const database = await getDatabase();
  await ensureV3LearnerState();
  await database.runAsync(
    `UPDATE v3_learner_state
     SET onboarding_completed = 1, learning_goal = ?, self_reported_level = ?,
         assistance_mode = ?, updated_at = ?
     WHERE id = 1`,
    goal,
    level,
    initialAssistance,
    new Date().toISOString(),
  );
  return getV3LearnerState();
}

export async function saveV3AssessmentAnswer(answer: V3AssessmentAnswer): Promise<V3LearnerState> {
  const parsed = v3AssessmentAnswerSchema.parse(answer);
  const state = await getV3LearnerState();
  const answers = [...state.assessmentAnswers.filter((candidate) => candidate.questionId !== parsed.questionId), parsed];
  const index = Math.min(state.assessmentIndex + 1, v3AssessmentQuestions.length);
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE v3_learner_state
     SET assessment_answers_json = ?, assessment_index = ?, updated_at = ?
     WHERE id = 1`,
    JSON.stringify(answers),
    index,
    new Date().toISOString(),
  );
  return getV3LearnerState();
}

export async function completeV3Assessment(): Promise<V3LearnerState> {
  const state = await getV3LearnerState();
  if (state.assessmentAnswers.length !== v3AssessmentQuestions.length) {
    throw new Error('Every V3 assessment question must be answered.');
  }
  const result = scoreV3Assessment(state.assessmentAnswers, state.selfReportedLevel);
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE v3_learner_state
     SET assessment_completed = 1, assistance_mode = ?, assessment_result_json = ?,
         assessment_index = ?, updated_at = ?
     WHERE id = 1`,
    result.assistanceMode,
    JSON.stringify(result),
    v3AssessmentQuestions.length,
    new Date().toISOString(),
  );
  return getV3LearnerState();
}

function mapEpisodeProgress(row: V3EpisodeProgressRow): V3EpisodeProgress {
  return v3EpisodeProgressSchema.parse({
    episodeId: row.episode_id,
    currentSceneIndex: row.current_scene_index,
    responses: parseJson(row.responses_json),
    learnedItemIds: parseJson(row.learned_item_ids_json),
    storyChoices: parseJson(row.story_choices_json),
    completedAt: row.completed_at ?? undefined,
    updatedAt: row.updated_at,
  });
}

export async function getV3EpisodeProgress(episodeId: string): Promise<V3EpisodeProgress> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<V3EpisodeProgressRow>(
    'SELECT * FROM v3_episode_progress WHERE episode_id = ?',
    episodeId,
  );
  if (row) return mapEpisodeProgress(row);
  return { episodeId, currentSceneIndex: 0, responses: [], learnedItemIds: [], storyChoices: {}, updatedAt: new Date().toISOString() };
}

export async function saveV3EpisodeProgress(progress: V3EpisodeProgress): Promise<V3EpisodeProgress> {
  const parsed = v3EpisodeProgressSchema.parse(progress);
  const database = await getDatabase();
  const updatedAt = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO v3_episode_progress
      (episode_id, current_scene_index, responses_json, learned_item_ids_json, story_choices_json, completed_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(episode_id) DO UPDATE SET
       current_scene_index = excluded.current_scene_index,
       responses_json = excluded.responses_json,
       learned_item_ids_json = excluded.learned_item_ids_json,
       story_choices_json = excluded.story_choices_json,
       completed_at = excluded.completed_at,
       updated_at = excluded.updated_at`,
    parsed.episodeId,
    parsed.currentSceneIndex,
    JSON.stringify(parsed.responses),
    JSON.stringify([...new Set(parsed.learnedItemIds)]),
    JSON.stringify(parsed.storyChoices),
    parsed.completedAt ?? null,
    updatedAt,
  );
  return getV3EpisodeProgress(parsed.episodeId);
}

export async function resetV3LearnerState(): Promise<V3LearnerState> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM v3_episode_progress');
    await database.runAsync('DELETE FROM v3_learner_state WHERE id = 1');
  });
  return getV3LearnerState();
}
