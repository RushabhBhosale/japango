import type {
  AssessmentAnswer,
  AssessmentCategory,
  AssessmentResult,
  LearnerLevel,
} from '@/types/learning';

const assessmentCategories: AssessmentCategory[] = [
  'vocabulary',
  'kanji',
  'grammar',
  'reading',
];

export function classifyLearnerLevel(overallScore: number): LearnerLevel {
  if (overallScore < 50) return 'N5 foundation needed';
  if (overallScore < 80) return 'N5 recovery';
  return 'Ready to begin N4 gradually';
}

export function getRecommendedPath(level: LearnerLevel): string {
  switch (level) {
    case 'N5 foundation needed':
      return 'Rebuild kana, core vocabulary, and basic particles with short guided lessons.';
    case 'N5 recovery':
      return 'Review weak N5 areas while gradually adding new N4 material.';
    case 'Ready to begin N4 gradually':
      return 'Begin introductory N4 lessons while keeping N5 reviews in rotation.';
  }
}

export function scoreAssessment(answers: AssessmentAnswer[]): AssessmentResult {
  const totalCorrect = answers.filter((answer) => answer.correct).length;
  const totalQuestions = answers.length;
  const overallScore = totalQuestions === 0 ? 0 : Math.round((totalCorrect / totalQuestions) * 100);
  const categoryScores = assessmentCategories.map((category) => {
    const categoryAnswers = answers.filter((answer) => answer.category === category);
    const correct = categoryAnswers.filter((answer) => answer.correct).length;
    const total = categoryAnswers.length;
    return {
      category,
      correct,
      total,
      percentage: total === 0 ? 0 : Math.round((correct / total) * 100),
    };
  });
  const strongAreas = categoryScores
    .filter((score) => score.total > 0 && score.percentage >= 75)
    .map((score) => score.category);
  const weakAreas = categoryScores
    .filter((score) => score.total > 0 && score.percentage < 60)
    .map((score) => score.category);
  const learnerLevel = classifyLearnerLevel(overallScore);

  return {
    overallScore,
    totalCorrect,
    totalQuestions,
    categoryScores,
    strongAreas,
    weakAreas,
    learnerLevel,
    recommendedPath: getRecommendedPath(learnerLevel),
  };
}
