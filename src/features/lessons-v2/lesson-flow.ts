import type { LessonV2Progress } from '@/types/lessons-v2';

export function recordLessonsV2Completion(
  progress: LessonV2Progress,
  sectionId: string,
  questionId?: string,
): LessonV2Progress {
  const now = new Date().toISOString();
  return {
    ...progress,
    currentSectionId: sectionId,
    completedSectionIds: [...new Set([...progress.completedSectionIds, sectionId])],
    completedQuestionIds: questionId ? [...new Set([...progress.completedQuestionIds, questionId])] : progress.completedQuestionIds,
    startedAt: progress.startedAt ?? now,
    updatedAt: now,
  };
}
