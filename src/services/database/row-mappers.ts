import { assessmentQuestionSchema, assessmentResultSchema } from '@/features/assessment/schemas';
import { curriculumItemSchema } from '@/features/curriculum/schemas';
import { learningAttemptSchema, userMasterySchema } from '@/features/progress/schemas';
import { z } from 'zod';
import type {
  AssessmentQuestion,
  CurriculumItem,
  LearnerProfile,
  LearningAttempt,
  UserMastery,
} from '@/types/learning';

export interface ProfileRow {
  id: string;
  display_name: string;
  daily_goal_minutes: number;
  onboarding_completed: number;
  assessment_completed: number;
  assessment_score: number | null;
  learner_level: string | null;
  assessment_result_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface CurriculumRow {
  id: string;
  type: string;
  level: string;
  title: string;
  meaning: string | null;
  reading: string | null;
  explanation: string | null;
  tags_json: string;
}

export interface QuestionRow {
  id: string;
  position: number;
  type: string;
  category: string;
  curriculum_item_id: string;
  prompt: string;
  passage: string | null;
  options_json: string;
  correct_option_id: string;
  explanation: string;
}

export interface MasteryRow {
  user_id: string;
  item_id: string;
  mastery_score: number;
  confidence_score: number;
  correct_count: number;
  incorrect_count: number;
  average_response_time_ms: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  review_interval_days: number;
  status: string;
}

export interface AttemptRow {
  id: string;
  user_id: string;
  item_id: string;
  question_id: string | null;
  lesson_id: string;
  mode: string;
  correct: number;
  response_time_ms: number;
  selected_answer: string | null;
  expected_answer: string | null;
  created_at: string;
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

const learnerProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string(),
  dailyGoalMinutes: z.number().int().min(5).max(60),
  onboardingCompleted: z.boolean(),
  assessmentCompleted: z.boolean(),
  assessmentScore: z.number().min(0).max(100).optional(),
  learnerLevel: assessmentResultSchema.shape.learnerLevel.optional(),
  assessmentResult: assessmentResultSchema.optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export function mapProfileRow(row: ProfileRow): LearnerProfile {
  const learnerLevel = row.learner_level
    ? assessmentResultSchema.shape.learnerLevel.parse(row.learner_level)
    : undefined;
  return learnerProfileSchema.parse({
    id: row.id,
    displayName: row.display_name,
    dailyGoalMinutes: row.daily_goal_minutes,
    onboardingCompleted: row.onboarding_completed === 1,
    assessmentCompleted: row.assessment_completed === 1,
    assessmentScore: row.assessment_score ?? undefined,
    learnerLevel,
    assessmentResult: row.assessment_result_json
      ? assessmentResultSchema.parse(parseJson(row.assessment_result_json))
      : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function mapCurriculumRow(row: CurriculumRow): CurriculumItem {
  return curriculumItemSchema.parse({
    id: row.id,
    type: row.type,
    level: row.level,
    title: row.title,
    meaning: row.meaning ?? undefined,
    reading: row.reading ?? undefined,
    explanation: row.explanation ?? undefined,
    tags: parseJson(row.tags_json),
  });
}

export function mapQuestionRow(row: QuestionRow): AssessmentQuestion {
  return assessmentQuestionSchema.parse({
    id: row.id,
    position: row.position,
    type: row.type,
    category: row.category,
    curriculumItemId: row.curriculum_item_id,
    prompt: row.prompt,
    passage: row.passage ?? undefined,
    options: parseJson(row.options_json),
    correctOptionId: row.correct_option_id,
    explanation: row.explanation,
  });
}

export function mapMasteryRow(row: MasteryRow): UserMastery {
  return userMasterySchema.parse({
    userId: row.user_id,
    itemId: row.item_id,
    masteryScore: row.mastery_score,
    confidenceScore: row.confidence_score,
    correctCount: row.correct_count,
    incorrectCount: row.incorrect_count,
    averageResponseTimeMs: row.average_response_time_ms,
    lastReviewedAt: row.last_reviewed_at ?? undefined,
    nextReviewAt: row.next_review_at ?? undefined,
    reviewIntervalDays: row.review_interval_days,
    status: row.status,
  });
}

export function mapAttemptRow(row: AttemptRow): LearningAttempt {
  return learningAttemptSchema.parse({
    id: row.id,
    userId: row.user_id,
    itemId: row.item_id,
    questionId: row.question_id ?? undefined,
    lessonId: row.lesson_id,
    mode: row.mode,
    correct: row.correct === 1,
    responseTimeMs: row.response_time_ms,
    selectedAnswer: row.selected_answer ?? undefined,
    expectedAnswer: row.expected_answer ?? undefined,
    createdAt: row.created_at,
  });
}
