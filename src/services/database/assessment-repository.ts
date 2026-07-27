import { scoreAssessment } from '@/features/assessment/scoring';
import { assessmentIndexSchema } from '@/features/settings/schemas';
import type {
  AssessmentAnswer,
  AssessmentQuestion,
  AssessmentResult,
  LearningAttempt,
} from '@/types/learning';
import { createLocalId } from '@/utils/id';

import { getDatabase } from './database';
import { getLearnerProfile, saveAssessmentResult } from './profile-repository';
import { recordLearningAttempt } from './progress-repository';
import { mapAttemptRow, mapQuestionRow, type AttemptRow, type QuestionRow } from './row-mappers';
import { getSetting, setSetting } from './settings-repository';

const ASSESSMENT_LESSON_ID = 'initial-assessment';

export async function getAssessmentQuestions(): Promise<AssessmentQuestion[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<QuestionRow>(
    'SELECT * FROM assessment_questions ORDER BY position ASC',
  );
  return rows.map(mapQuestionRow);
}

export async function getAssessmentAttempts(): Promise<LearningAttempt[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<AttemptRow>(
    'SELECT * FROM learning_attempts WHERE lesson_id = ? ORDER BY created_at ASC',
    ASSESSMENT_LESSON_ID,
  );
  return rows.map(mapAttemptRow);
}

export async function getAssessmentIndex(): Promise<number> {
  return (await getSetting('assessment_index', assessmentIndexSchema)) ?? 0;
}

export async function saveAssessmentIndex(index: number): Promise<void> {
  await setSetting('assessment_index', index, assessmentIndexSchema);
}

export async function submitAssessmentAnswer(
  question: AssessmentQuestion,
  selectedOptionId: string,
  responseTimeMs: number,
): Promise<LearningAttempt> {
  const profile = await getLearnerProfile();
  const now = new Date().toISOString();
  const attempt: LearningAttempt = {
    id: createLocalId('attempt'),
    userId: profile.id,
    itemId: question.curriculumItemId,
    questionId: question.id,
    lessonId: ASSESSMENT_LESSON_ID,
    mode: 'assessment',
    correct: selectedOptionId === question.correctOptionId,
    responseTimeMs: Math.max(0, Math.round(responseTimeMs)),
    selectedAnswer: selectedOptionId,
    expectedAnswer: question.correctOptionId,
    createdAt: now,
  };
  await recordLearningAttempt(attempt);
  return attempt;
}

export async function completeAssessment(): Promise<AssessmentResult> {
  const [questions, attempts] = await Promise.all([
    getAssessmentQuestions(),
    getAssessmentAttempts(),
  ]);
  const categoryByQuestion = new Map(questions.map((question) => [question.id, question.category]));
  const answers: AssessmentAnswer[] = attempts.flatMap((attempt) => {
    if (!attempt.questionId) return [];
    const category = categoryByQuestion.get(attempt.questionId);
    if (!category) return [];
    return [{ questionId: attempt.questionId, category, correct: attempt.correct }];
  });
  if (answers.length !== questions.length) {
    throw new Error('Please answer every assessment question before finishing.');
  }

  const result = scoreAssessment(answers);
  await saveAssessmentResult(result);
  await saveAssessmentIndex(questions.length);
  return result;
}
