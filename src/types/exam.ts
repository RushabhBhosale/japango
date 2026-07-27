import type { ContentLessonType, ContentPracticeQuestion } from './content-learning';

export type PracticeDomain = 'vocabulary' | ContentLessonType;
export type PracticeKind = 'practice' | 'mock-exam' | 'section-exam';
export type PracticeTimerMode = 'none' | 'elapsed' | 'countdown';
export type PracticeSessionStatus = 'in-progress' | 'paused' | 'completed' | 'time-expired';
export type PracticeSourceFilter = 'all' | 'weak' | 'bookmarked' | 'incorrect' | 'due' | 'new' | 'mastered';

export interface PracticeSelection {
  kind: PracticeKind;
  level: 'N5' | 'N4';
  domains: PracticeDomain[];
  questionCount: number;
  timerMode: PracticeTimerMode;
  timeLimitSeconds?: number;
  source: PracticeSourceFilter;
  seed: string;
  targetItemIds?: string[];
  vocabularyTag?: string;
}

export interface ExamCandidate extends Omit<ContentPracticeQuestion, 'domain'> {
  domain: PracticeDomain;
  tags: string[];
  masteryStatus: PracticeSourceFilter | 'learning' | 'review';
  bookmarked: boolean;
  isDue: boolean;
  incorrectCount: number;
  lastSeenAt?: string;
  difficultyRank: number;
}

export interface PracticeQuestion extends Omit<ContentPracticeQuestion, 'domain'> {
  domain: PracticeDomain;
  tags: string[];
  difficultyRank: number;
}

export interface PracticeAnswer {
  questionId: string;
  selectedOptionId?: string;
  correct: boolean;
  responseTimeMs: number;
  answeredAt: string;
}

export interface PracticeSession {
  id: string;
  selection: PracticeSelection;
  status: PracticeSessionStatus;
  questionIds: string[];
  currentIndex: number;
  elapsedSeconds: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  questions: PracticeQuestion[];
  answers: PracticeAnswer[];
}

export interface PracticeAggregate {
  key: PracticeDomain;
  correct: number;
  incorrect: number;
  total: number;
  percentage: number;
}

export interface PracticeResult {
  session: PracticeSession;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  percentage: number;
  timeTakenSeconds: number;
  sectionScores: PracticeAggregate[];
  recommendedItemIds: string[];
  weakGrammarIds: string[];
  weakVocabularyIds: string[];
  weakKanjiIds: string[];
}

export interface ExamHistoryItem {
  id: string;
  kind: PracticeKind;
  level: 'N5' | 'N4';
  status: PracticeSessionStatus;
  percentage?: number;
  elapsedSeconds: number;
  createdAt: string;
  completedAt?: string;
  questionCount: number;
}

export interface ExamAnalytics {
  completedMocks: number;
  averageMockScore?: number;
  highestMockScore?: number;
  improvement?: number;
  strongestSection?: PracticeDomain;
  weakestSection?: PracticeDomain;
  readiness: number;
  accuracyByDomain: PracticeAggregate[];
}
