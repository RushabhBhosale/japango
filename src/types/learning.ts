export const curriculumItemTypes = [
  'vocabulary',
  'grammar',
  'kanji',
  'reading',
  'listening',
] as const;

export type CurriculumItemType = (typeof curriculumItemTypes)[number];
export type CurriculumLevel = 'N5' | 'N4';
export type MasteryStatus = 'new' | 'learning' | 'weak' | 'review' | 'mastered';
export type LearningMode = 'reading' | 'listening' | 'quiz' | 'assessment';
export type LearnerLevel =
  | 'N5 foundation needed'
  | 'N5 recovery'
  | 'Ready to begin N4 gradually';

export interface CurriculumItem {
  id: string;
  type: CurriculumItemType;
  level: CurriculumLevel;
  title: string;
  meaning?: string;
  reading?: string;
  explanation?: string;
  tags: string[];
}

export interface LearnerProfile {
  id: string;
  displayName: string;
  dailyGoalMinutes: number;
  onboardingCompleted: boolean;
  assessmentCompleted: boolean;
  assessmentScore?: number;
  learnerLevel?: LearnerLevel;
  assessmentResult?: AssessmentResult;
  createdAt: string;
  updatedAt: string;
}

export interface UserMastery {
  userId: string;
  itemId: string;
  masteryScore: number;
  confidenceScore: number;
  correctCount: number;
  incorrectCount: number;
  averageResponseTimeMs: number;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  reviewIntervalDays: number;
  status: MasteryStatus;
}

export interface LearningAttempt {
  id: string;
  userId: string;
  itemId: string;
  questionId?: string;
  lessonId: string;
  mode: LearningMode;
  correct: boolean;
  responseTimeMs: number;
  selectedAnswer?: string;
  expectedAnswer?: string;
  createdAt: string;
}

export type AssessmentCategory = 'vocabulary' | 'kanji' | 'grammar' | 'reading';
export type AssessmentQuestionType =
  | 'multiple-choice'
  | 'choose-reading'
  | 'fill-blank'
  | 'short-reading';

export interface QuestionOption {
  id: string;
  label: string;
}

interface BaseAssessmentQuestion {
  id: string;
  position: number;
  category: AssessmentCategory;
  curriculumItemId: string;
  prompt: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
}

export type AssessmentQuestion =
  | (BaseAssessmentQuestion & {
      type: 'multiple-choice' | 'choose-reading' | 'fill-blank';
    })
  | (BaseAssessmentQuestion & {
      type: 'short-reading';
      passage: string;
    });

export interface AssessmentAnswer {
  questionId: string;
  category: AssessmentCategory;
  correct: boolean;
}

export interface CategoryScore {
  category: AssessmentCategory;
  correct: number;
  total: number;
  percentage: number;
}

export interface AssessmentResult {
  overallScore: number;
  totalCorrect: number;
  totalQuestions: number;
  categoryScores: CategoryScore[];
  strongAreas: AssessmentCategory[];
  weakAreas: AssessmentCategory[];
  learnerLevel: LearnerLevel;
  recommendedPath: string;
}

export interface CurriculumWithMastery extends CurriculumItem {
  mastery: UserMastery;
}

export interface ProgressSummary {
  statusCounts: Record<MasteryStatus, number>;
  masteredByType: Record<'vocabulary' | 'kanji' | 'grammar', number>;
  dueCount: number;
  weakCount: number;
  recentAttempts: (LearningAttempt & { itemTitle?: string })[];
  scheduler: {
    reviewsToday: number;
    reviewsThisWeek: number;
    reviewsThisMonth: number;
    averageAccuracy: number;
    retention: number;
    matureCards: number;
    learningCards: number;
    newCards: number;
    dueTomorrow: number;
    currentStreak: number;
    longestStreak: number;
    studyTimeMs: number;
    averageResponseTimeMs: number;
    estimatedStudyMinutes: number;
  };
}

export type ThemePreference = 'system' | 'light' | 'dark';
export type FuriganaPreference = 'always' | 'learning' | 'off';

export interface AppSettings {
  themePreference: ThemePreference;
}
