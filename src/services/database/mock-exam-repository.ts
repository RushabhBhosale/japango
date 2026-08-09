import { getSetting, setSetting } from './settings-repository';

import { mockExamAttemptSchema } from '@/features/mock-exam/mock-exam-session';
import type { MockExamAttempt } from '@/types/mock-exam';

function key(examId: string): string { return `v3.mock_exam.${examId}`; }

export function getMockExamAttempt(examId: string): Promise<MockExamAttempt | undefined> {
  return getSetting(key(examId), mockExamAttemptSchema);
}

export function saveMockExamAttempt(attempt: MockExamAttempt): Promise<void> {
  return setSetting(key(attempt.examId), attempt, mockExamAttemptSchema);
}
