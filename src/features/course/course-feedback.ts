import { normalizeJapaneseAnswer } from './answer-normalization';
import type { CourseAnswerFeedback, LessonActivityExercise } from '@/types/course';

export interface CourseAnswerEvaluation {
  correct: boolean;
  feedback: CourseAnswerFeedback;
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const stored = previous[rightIndex] ?? 0;
      previous[rightIndex] = Math.min(
        (previous[rightIndex - 1] ?? 0) + 1,
        stored + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = stored;
    }
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function greetingPolitenessIssue(answer: string, expected: readonly string[], required?: string): string | undefined {
  if (required !== 'polite') return undefined;
  const actual = normalizeJapaneseAnswer(answer);
  if (actual === 'おはよう' && expected.some((value) => normalizeJapaneseAnswer(value) === 'おはようございます')) {
    return 'The meaning is right, but this activity asks for the polite greeting: おはようございます。';
  }
  return undefined;
}

function particleIssue(answer: string, expected: string): string | undefined {
  const actual = normalizeJapaneseAnswer(answer);
  const target = normalizeJapaneseAnswer(expected);
  const particles = ['は', 'が', 'を', 'に', 'で', 'へ', 'と', 'も'];
  for (const particle of particles) {
    for (const alternative of particles) {
      if (particle === alternative) continue;
      if (actual.replaceAll(alternative, particle) === target) {
        return `Use 「${particle}」 here. It is the particle that makes this sentence work in this context.`;
      }
    }
  }
  return undefined;
}

function fallbackHint(exercise: LessonActivityExercise, level: number): string | undefined {
  const authored = exercise.hints?.[Math.min(level - 1, exercise.hints.length - 1)];
  if (authored) return authored;
  if (level === 1) {
    if (exercise.category === 'conjugation') return 'Look at the final kana of the verb before you change it.';
    if (exercise.category === 'grammar') return 'Read the model sentence again and keep the required pattern.';
    return 'Read the expected answer format once more, then try a shorter answer.';
  }
  if (level === 2) return exercise.acceptedAnswers?.[0] ? `It begins: ${exercise.acceptedAnswers[0].slice(0, Math.max(1, Math.ceil(exercise.acceptedAnswers[0].length / 2)))}…` : undefined;
  return exercise.acceptedAnswers?.[0] ? `Answer: ${exercise.acceptedAnswers[0]}` : undefined;
}

function correctFeedback(exercise: LessonActivityExercise, answer?: string): CourseAnswerEvaluation {
  const accepted = exercise.acceptedAnswers?.[0];
  return {
    correct: true,
    feedback: {
      kind: 'correct',
      title: 'Correct',
      learnerAnswer: answer,
      acceptedAnswer: accepted,
      explanation: exercise.correctReinforcement ?? exercise.explanation ?? 'That fits the situation. Keep that form in mind for the next example.',
      hintLevel: 0,
      canRetry: false,
      canContinue: true,
      scheduleForReview: false,
    },
  };
}

/**
 * Pure deterministic feedback for authored activities. It deliberately does
 * not claim to grade open-ended Japanese production; that stays self-confirmed
 * and can be reviewed by the optional AI teacher separately.
 */
export function evaluateCourseAnswer(
  exercise: LessonActivityExercise,
  answer: string | undefined,
  previousIncorrectAttempts: number,
): CourseAnswerEvaluation {
  if (exercise.responseKind === 'continue' || exercise.responseKind === 'production') return correctFeedback(exercise, answer);
  const response = answer?.trim() ?? '';
  const expected = exercise.acceptedAnswers ?? [];
  if (exercise.responseKind === 'select') {
    return expected.includes(response)
      ? correctFeedback(exercise, response)
      : incorrectFeedback(exercise, response, previousIncorrectAttempts, 'Choose the answer that best fits the situation.');
  }
  const normalized = normalizeJapaneseAnswer(response);
  const matched = expected.some((candidate) => normalizeJapaneseAnswer(candidate) === normalized);
  if (matched) return correctFeedback(exercise, response);

  const politeIssue = greetingPolitenessIssue(response, expected, exercise.expectedResponse?.politeness);
  if (politeIssue) return partialFeedback(exercise, response, previousIncorrectAttempts, politeIssue);
  const accepted = expected[0] ?? '';
  const normalizedAccepted = normalizeJapaneseAnswer(accepted);
  const particle = accepted ? particleIssue(response, accepted) : undefined;
  const longVowel = normalized.length > 1 && normalizedAccepted.length > normalized.length
    && editDistance(normalized, normalizedAccepted) === 1
    && /[うい]$/u.test(normalizedAccepted)
    ? `You are very close. The final 「${normalizedAccepted.at(-1) ?? ''}」 is needed: ${accepted}`
    : undefined;
  const minorTyping = normalized && normalizedAccepted && editDistance(normalized, normalizedAccepted) === 1
    ? `Almost there. Compare your answer with 「${accepted}」 and correct the one character that differs.`
    : undefined;
  const conjugation = exercise.category === 'conjugation'
    ? `This is a verb-form change. ${exercise.explanation ?? `The expected form is ${accepted}.`}`
    : undefined;
  return incorrectFeedback(exercise, response, previousIncorrectAttempts, particle ?? longVowel ?? minorTyping ?? conjugation ?? exercise.explanation ?? 'Compare the required form with the model, then try again.');
}

function partialFeedback(
  exercise: LessonActivityExercise,
  response: string,
  previousIncorrectAttempts: number,
  explanation: string,
): CourseAnswerEvaluation {
  const attempt = previousIncorrectAttempts + 1;
  return {
    correct: false,
    feedback: {
      kind: 'partial',
      title: 'Correct meaning, different form',
      learnerAnswer: response,
      acceptedAnswer: exercise.acceptedAnswers?.[0],
      explanation,
      hint: fallbackHint(exercise, Math.min(attempt, 3)),
      hintLevel: Math.min(attempt, 3),
      canRetry: attempt < 3,
      canContinue: attempt >= 3,
      scheduleForReview: true,
    },
  };
}

function incorrectFeedback(
  exercise: LessonActivityExercise,
  response: string,
  previousIncorrectAttempts: number,
  explanation: string,
): CourseAnswerEvaluation {
  const attempt = previousIncorrectAttempts + 1;
  const teaching = attempt >= 3;
  return {
    correct: false,
    feedback: {
      kind: teaching ? 'teaching' : 'incorrect',
      title: teaching ? 'Here is the pattern to use' : attempt === 1 ? 'Almost there' : 'Use this clue, then try again',
      learnerAnswer: response,
      acceptedAnswer: exercise.acceptedAnswers?.[0],
      explanation: teaching
        ? `${explanation} The answer is ${exercise.acceptedAnswers?.[0] ?? 'shown above'}. We will add this skill to your review.`
        : explanation,
      hint: fallbackHint(exercise, Math.min(attempt, 3)),
      hintLevel: Math.min(attempt, 3),
      canRetry: !teaching,
      canContinue: teaching,
      scheduleForReview: true,
    },
  };
}
