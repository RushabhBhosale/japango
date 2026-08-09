import { z } from 'zod';

import { getMockExam, getMockExamQuestion } from './mock-exam-catalog';
import type { MockExamAttempt } from '@/types/mock-exam';

const attemptSchema = z.object({
  examId: z.string().min(1), questionIndex: z.number().int().nonnegative(), selectedAnswers: z.record(z.string(), z.string()), elapsedSeconds: z.number().int().nonnegative(), paused: z.boolean(), completedAt: z.string().datetime().optional(),
}).strict();

export interface MockExamResult { correct: number; unanswered: number; total: number; percentage: number; sections: { title: string; correct: number; total: number }[]; }

export function createMockExamAttempt(examId: string): MockExamAttempt {
  return { examId, questionIndex: 0, selectedAnswers: {}, elapsedSeconds: 0, paused: false };
}

export function scoreMockExam(attempt: MockExamAttempt): MockExamResult {
  const exam = getMockExam(attempt.examId);
  if (!exam) throw new Error('This mock exam is no longer available.');
  let correct = 0;
  const sections = exam.sections.map((section) => {
    const placements = exam.placements.filter((placement) => placement.sectionId === section.id);
    const sectionCorrect = placements.filter((placement) => {
      const question = getMockExamQuestion(placement.questionId);
      return Boolean(question && question.correctOptionId === attempt.selectedAnswers[question.id]);
    }).length;
    correct += sectionCorrect;
    return { title: section.title, correct: sectionCorrect, total: placements.length };
  });
  const total = exam.placements.length;
  return { correct, unanswered: total - Object.keys(attempt.selectedAnswers).length, total, percentage: Math.round((correct / total) * 100), sections };
}

export const mockExamAttemptSchema = attemptSchema;
