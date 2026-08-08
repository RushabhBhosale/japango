import { z } from 'zod';

import { learningGoals, selfReportedLevels } from '@/types/lesson-v3';

export const assistanceModeSchema = z.enum(['guided', 'supported', 'independent']);
export const learningGoalSchema = z.enum(learningGoals);
export const selfReportedLevelSchema = z.enum(selfReportedLevels);

export const v3AssessmentAnswerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionId: z.string().min(1),
  correct: z.boolean(),
}).strict();

export const v3AssessmentResultSchema = z.object({
  startingLevel: z.enum(['Beginner', 'Around N5', 'Around N4']),
  assistanceMode: assistanceModeSchema,
  correctCount: z.number().int().nonnegative(),
  questionCount: z.number().int().positive(),
  kana: z.enum(['Comfortable', 'Developing']),
  kanji: z.enum(['Comfortable', 'Developing', 'Just starting']),
  grammar: z.enum(['Foundations developing', 'N5 foundations', 'N5 strong / early N4']),
  reading: z.enum(['Just starting', 'Developing', 'Comfortable']),
}).strict();

export const v3LearnerStateSchema = z.object({
  onboardingCompleted: z.boolean(),
  learningGoal: learningGoalSchema.optional(),
  selfReportedLevel: selfReportedLevelSchema.optional(),
  assistanceMode: assistanceModeSchema,
  assessmentCompleted: z.boolean(),
  assessmentIndex: z.number().int().nonnegative(),
  assessmentAnswers: z.array(v3AssessmentAnswerSchema),
  assessmentResult: v3AssessmentResultSchema.optional(),
  updatedAt: z.string().min(1),
}).strict();

export const v3EpisodeResponseSchema = z.object({
  sceneId: z.string().min(1),
  kind: z.enum(['choice', 'sentenceBuild', 'freeResponse']),
  answer: z.string(),
  correct: z.boolean(),
  feedbackTitle: z.string().min(1),
  feedback: z.string().min(1),
  suggestedResponse: z.string().optional(),
}).strict();

export const v3EpisodeProgressSchema = z.object({
  episodeId: z.string().min(1),
  currentSceneIndex: z.number().int().nonnegative(),
  responses: z.array(v3EpisodeResponseSchema),
  learnedItemIds: z.array(z.string().min(1)),
  storyChoices: z.object({
    availabilityTomorrow: z.enum(['free', 'afternoon-only', 'working', 'unavailable']).optional(),
    preferredMeetingTime: z.enum(['morning', 'afternoon', 'evening']).optional(),
    foodPreference: z.string().min(1).max(80).optional(),
    hobbies: z.array(z.string().min(1).max(80)).max(8).optional(),
  }).strict().default({}),
  completedAt: z.string().min(1).optional(),
  updatedAt: z.string().min(1),
}).strict();
