import { z } from 'zod';

export const userMasterySchema = z.object({
  userId: z.string().min(1),
  itemId: z.string().min(1),
  masteryScore: z.number().min(0).max(100),
  confidenceScore: z.number().min(0).max(100),
  correctCount: z.number().int().nonnegative(),
  incorrectCount: z.number().int().nonnegative(),
  averageResponseTimeMs: z.number().nonnegative(),
  lastReviewedAt: z.string().optional(),
  nextReviewAt: z.string().optional(),
  reviewIntervalDays: z.number().nonnegative(),
  status: z.enum(['new', 'learning', 'weak', 'review', 'mastered']),
});

export const learningAttemptSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  itemId: z.string().min(1),
  questionId: z.string().optional(),
  lessonId: z.string().min(1),
  mode: z.enum(['reading', 'listening', 'quiz', 'assessment']),
  correct: z.boolean(),
  responseTimeMs: z.number().int().nonnegative(),
  selectedAnswer: z.string().optional(),
  expectedAnswer: z.string().optional(),
  createdAt: z.string().min(1),
});
