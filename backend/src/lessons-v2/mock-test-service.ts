import type { LessonV2Question } from './contracts';

export interface MockTestAssembly {
  questions: LessonV2Question[];
  excludedRecentQuestionIds: string[];
}

/** Deterministic assembly keeps recent questions out and never changes source content. */
export function assembleMockTest(
  questions: readonly LessonV2Question[],
  recentlySeenIds: ReadonlySet<string>,
  requestedCount: number,
): MockTestAssembly {
  const eligible = questions.filter((question) => question.validationStatus === 'valid' && !recentlySeenIds.has(question.id));
  const selected = eligible.slice(0, Math.max(1, requestedCount));
  return { questions: selected, excludedRecentQuestionIds: questions.filter((question) => recentlySeenIds.has(question.id)).map((question) => question.id) };
}
