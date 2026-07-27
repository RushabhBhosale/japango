import { assessmentResultSchema } from '@/features/assessment/schemas';
import type { AssessmentResult, LearnerProfile } from '@/types/learning';

import { getDatabase } from './database';
import { mapProfileRow, type ProfileRow } from './row-mappers';

export async function getLearnerProfile(): Promise<LearnerProfile> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<ProfileRow>('SELECT * FROM learner_profile LIMIT 1');
  if (!row) throw new Error('Learner profile was not initialized.');
  return mapProfileRow(row);
}

export async function completeOnboarding(
  displayName: string,
  dailyGoalMinutes: number,
): Promise<LearnerProfile> {
  const name = displayName.trim();
  if (!name) throw new Error('A display name is required.');
  if (dailyGoalMinutes < 5 || dailyGoalMinutes > 60) {
    throw new Error('Daily goal must be between 5 and 60 minutes.');
  }

  const database = await getDatabase();
  const profile = await getLearnerProfile();
  await database.runAsync(
    `UPDATE learner_profile
     SET display_name = ?, daily_goal_minutes = ?, onboarding_completed = 1, updated_at = ?
     WHERE id = ?`,
    name,
    dailyGoalMinutes,
    new Date().toISOString(),
    profile.id,
  );
  return getLearnerProfile();
}

export async function saveDailyGoal(dailyGoalMinutes: number): Promise<LearnerProfile> {
  if (dailyGoalMinutes < 5 || dailyGoalMinutes > 60) {
    throw new Error('Daily goal must be between 5 and 60 minutes.');
  }
  const database = await getDatabase();
  const profile = await getLearnerProfile();
  await database.runAsync(
    'UPDATE learner_profile SET daily_goal_minutes = ?, updated_at = ? WHERE id = ?',
    dailyGoalMinutes,
    new Date().toISOString(),
    profile.id,
  );
  return getLearnerProfile();
}

export async function saveAssessmentResult(result: AssessmentResult): Promise<LearnerProfile> {
  const validated = assessmentResultSchema.parse(result);
  const database = await getDatabase();
  const profile = await getLearnerProfile();
  await database.runAsync(
    `UPDATE learner_profile
     SET assessment_completed = 1, assessment_score = ?, learner_level = ?,
         assessment_result_json = ?, updated_at = ?
     WHERE id = ?`,
    validated.overallScore,
    validated.learnerLevel,
    JSON.stringify(validated),
    new Date().toISOString(),
    profile.id,
  );
  return getLearnerProfile();
}
