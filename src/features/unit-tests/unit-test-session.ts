import type { UnitTest, UnitTestAttempt } from '../../types/unit-test';

export function createUnitTestAttempt(unitTestId: string): UnitTestAttempt { return { unitTestId, questionIndex: 0, answers: {} }; }

export function scoreUnitTest(test: UnitTest, attempt: UnitTestAttempt) {
  const byDomain = new Map(test.questions.map((question) => [question.domain, { correct: 0, total: 0 }]));
  let correct = 0;
  for (const question of test.questions) {
    const score = byDomain.get(question.domain)!;
    score.total += 1;
    if (attempt.answers[question.id] === question.correctChoiceId) { correct += 1; score.correct += 1; }
  }
  const percentage = Math.round((correct / test.questions.length) * 100);
  return { correct, total: test.questions.length, percentage, status: percentage >= 80 ? 'Mastered' : percentage >= 60 ? 'Passed' : 'Review and retry', byDomain };
}
