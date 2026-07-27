import type { ContentMasteryAssessment, ContentMasteryInput } from '@/types/content-mastery';

function isDue(input: ContentMasteryInput, now: Date): boolean {
  const dueAt = input.fsrsCard?.dueAt ?? input.mastery.nextReviewAt;
  return Boolean(dueAt && Date.parse(dueAt) <= now.getTime());
}

/**
 * A deterministic notebook-level status. It never turns a single successful
 * quiz into mastery; stable repeated FSRS recall remains the final signal.
 */
export function calculateContentMastery(input: ContentMasteryInput): ContentMasteryAssessment {
  const now = input.now ?? new Date();
  const attempts = input.mastery.correctCount + input.mastery.incorrectCount;
  const accuracy = attempts ? input.mastery.correctCount / attempts : 0;
  const recentMistakes = input.recentMistakeCount ?? 0;
  const quizScore = input.latestQuizScore;
  const card = input.fsrsCard;

  if (!attempts && input.mastery.status === 'new') {
    return { state: 'not_started', reason: 'Not yet tested' };
  }
  if (recentMistakes >= 3) {
    return { state: 'needs_review', reason: `${recentMistakes} recent mistakes` };
  }
  if (quizScore !== undefined && quizScore < 60) {
    return { state: 'needs_review', reason: 'Quiz score below 60%' };
  }
  if (input.mastery.status === 'weak' || card?.state === 'relearning') {
    return { state: 'needs_review', reason: 'Recent recall needs reinforcement' };
  }
  if (isDue(input, now) && attempts > 0) {
    return { state: 'needs_review', reason: 'Due for review' };
  }
  if (
    input.mastery.status === 'mastered'
    && (card?.repetitions ?? attempts) >= 8
    && (card?.stability ?? input.mastery.reviewIntervalDays) >= 21
  ) {
    return { state: 'mastered', reason: 'Stable recall across repeated reviews' };
  }
  if (attempts >= 3 && accuracy >= 0.8 && (quizScore === undefined || quizScore >= 80)) {
    return { state: 'good', reason: 'Strong recent quiz and review performance' };
  }
  return { state: 'studying', reason: attempts ? 'Building repeated recall' : 'Marked ready to study' };
}
