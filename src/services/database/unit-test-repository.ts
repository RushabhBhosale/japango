import { z } from 'zod';

import { getSetting, setSetting } from './settings-repository';
import { getDatabase } from './database';
import { getLearnerProfile } from './profile-repository';
import { recordLearningAttempt } from './progress-repository';

import { v3Episodes } from '@/features/lesson-v3/episodes';
import { createLocalId } from '@/utils/id';
import type { UnitTest, UnitTestAttempt } from '@/types/unit-test';

const schema = z.object({ unitTestId: z.string(), questionIndex: z.number().int().nonnegative(), answers: z.record(z.string(), z.string()), completedAt: z.string().datetime().optional() }).strict();
const key = (id: string) => `v3.unit_test.${id}`;
export const getUnitTestAttempt = (id: string): Promise<UnitTestAttempt | undefined> => getSetting(key(id), schema);
export const saveUnitTestAttempt = (attempt: UnitTestAttempt): Promise<void> => setSetting(key(attempt.unitTestId), attempt, schema);

/** Adds canonical episode targets missed in this test to the existing FSRS
 * queue. The flashcards screen already reads that same mastery state. */
export async function prioritizeUnitTestMistakes(test: UnitTest, attempt: UnitTestAttempt): Promise<void> {
  const linkedIds = new Set(test.questions
    .filter((question) => attempt.answers[question.id] !== question.correctChoiceId)
    .flatMap((question) => question.linkedEpisodeItemIds));
  if (!linkedIds.size) return;
  const titles = test.episodeIds.flatMap((episodeId) => v3Episodes[episodeId]?.learningObjectives ?? [])
    .filter((objective) => linkedIds.has(objective.id) && objective.kind === 'vocabulary')
    .map((objective) => objective.japanese);
  const directGrammarIds = [...linkedIds].filter((id) => id.startsWith('grammar-'));
  const database = await getDatabase();
  const marks = titles.map(() => '?').join(', ');
  const rows = marks ? await database.getAllAsync<{ id: string }>(`SELECT id FROM curriculum_items WHERE type = 'vocabulary' AND title IN (${marks}) AND curriculum_source IN ('bundled', 'course-support') AND release_ready = 1`, ...titles) : [];
  const itemIds = [...new Set([...directGrammarIds, ...rows.map((row) => row.id)])];
  if (!itemIds.length) return;
  const profile = await getLearnerProfile();
  const now = new Date().toISOString();
  await Promise.all(itemIds.map((itemId) => recordLearningAttempt({ id: createLocalId('unit-test-weak'), userId: profile.id, itemId, lessonId: test.id, mode: 'quiz', correct: false, responseTimeMs: 0, createdAt: now }, 'again')));
}
