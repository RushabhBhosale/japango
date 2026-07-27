import type {
  CourseCheckpointResult,
  CourseLessonDefinition,
  CourseLessonProgress,
  CourseLessonState,
  CoursePlacementRecommendation,
  CourseQuestion,
} from '../../types/course';
import type { AssessmentResult, CurriculumItemType } from '../../types/learning';

export const COURSE_PASSING_SCORE = 75;

export function checkpointClassification(score: number): CourseCheckpointResult['classification'] {
  if (score < 60) return 'needs_review';
  if (score < COURSE_PASSING_SCORE) return 'developing';
  if (score < 90) return 'passed';
  return 'strong';
}

export function scoreCourseCheckpoint(
  questions: readonly CourseQuestion[],
  answers: Readonly<Record<string, string | undefined>>,
): CourseCheckpointResult {
  const byDomain = new Map<CurriculumItemType, { correct: number; total: number }>();
  const wrong = new Set<string>();
  let correct = 0;
  for (const question of questions) {
    const result = byDomain.get(question.domain) ?? { correct: 0, total: 0 };
    result.total += 1;
    if (answers[question.id] === question.correctOptionId) {
      correct += 1;
      result.correct += 1;
    } else {
      wrong.add(question.itemId);
    }
    byDomain.set(question.domain, result);
  }
  const score = questions.length ? Math.round((correct / questions.length) * 100) : 0;
  return {
    score,
    classification: checkpointClassification(score),
    byDomain: Object.fromEntries([...byDomain.entries()].map(([domain, result]) => [domain, { ...result, score: Math.round((result.correct / result.total) * 100) }])),
    weakItemIds: [...wrong].sort(),
  };
}

export function nextLessonState(
  lesson: CourseLessonDefinition,
  progress: CourseLessonProgress | undefined,
  prerequisiteStates: readonly CourseLessonState[],
  allowBrowsing: boolean,
): CourseLessonState {
  if (progress?.placedByAssessment) return 'skipped_by_placement';
  if (progress?.latestCheckpointScore !== undefined && progress.latestCheckpointScore < 60) return 'needs_review';
  if (progress?.completedAt) return (progress.bestCheckpointScore ?? 0) >= 90 ? 'strong' : 'completed';
  if (progress?.startedAt || progress?.completedSectionIds.length) return 'in_progress';
  const prerequisitesMet = lesson.prerequisiteLessonIds.length === 0
    || prerequisiteStates.every((state) => ['completed', 'strong', 'skipped_by_placement'].includes(state));
  if (prerequisitesMet || allowBrowsing) return 'available';
  return 'locked';
}

export function isUnitReviewAvailable(lessons: readonly CourseLessonProgress[]): boolean {
  return lessons.length > 0 && lessons.every((lesson) => lesson.startedAt || lesson.completedAt || lesson.placedByAssessment);
}

export function getPlacementRecommendation(result: AssessmentResult | undefined): CoursePlacementRecommendation {
  const score = result?.overallScore ?? 0;
  if (score < 50) return { courseId: 'foundations', unitId: 'foundations-unit-1', lessonId: 'foundations-lesson-01', reason: 'Build the kana and sentence foundations first.' };
  if (score < 62) return { courseId: 'jlpt-n5', unitId: 'n5-unit-1', lessonId: 'n5-lesson-01', reason: 'Rebuild core N5 communication patterns in sequence.' };
  if (score < 78) return { courseId: 'jlpt-n5', unitId: 'n5-unit-3', lessonId: 'n5-lesson-07', reason: 'Your assessment supports a focused N5 recovery starting with daily life.' };
  if (score < 88) return { courseId: 'jlpt-n5', unitId: 'n5-unit-9', lessonId: 'n5-lesson-25', reason: 'Consolidate N5 in the final review units before beginning N4.' };
  return { courseId: 'jlpt-n4', unitId: 'n4-unit-1', lessonId: 'n4-lesson-01', reason: 'You are ready to begin N4 while keeping N5 reviews active.' };
}
