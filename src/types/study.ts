import type { CurriculumWithMastery, LearningAttempt } from './learning';
import type { FsrsCard } from './fsrs';
import type { ContentMasteryAssessment } from './content-mastery';

export type VocabularyRating = 'again' | 'hard' | 'good' | 'easy';

export interface VocabularySentence {
  id: string;
  japanese: string;
  reading: string;
  meaning: string;
  level: 'N5' | 'N4';
  relationshipRole: 'focus' | 'supporting';
}

export interface LinkedKanji {
  id: string;
  written: string;
  meaning?: string;
  reading?: string;
}

export interface VocabularyLesson extends CurriculumWithMastery {
  partOfSpeech: string[];
  linkedKanji: LinkedKanji[];
  example?: VocabularySentence;
  bookmarked: boolean;
  fsrsCard: FsrsCard;
  recentAccuracy?: number;
}

export interface VocabularyPracticeOption {
  id: string;
  label: string;
  feedback?: string;
}

export interface VocabularyPracticeQuestion {
  id: string;
  sourceQuestionId?: string;
  vocabularyId: string;
  level: 'N5' | 'N4';
  presentation: string;
  prompt: string;
  explanation?: string;
  correctOptionId: string;
  options: VocabularyPracticeOption[];
}

export interface StudySession {
  id: string;
  type: 'vocabulary-practice' | 'review';
  status: 'in-progress' | 'completed';
  itemIds: string[];
  questionIds: string[];
  currentIndex: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  questions: VocabularyPracticeQuestion[];
  attempts: LearningAttempt[];
}

export interface StudySessionResult {
  session: StudySession;
  correctCount: number;
  incorrectCount: number;
  totalQuestions: number;
  percentage: number;
  timeTakenSeconds: number;
  recommendation: 'needs-review' | 'developing' | 'good';
}

export type VocabularyNotebookProgressFilter =
  | 'all'
  | 'studied'
  | 'not-studied'
  | 'weak'
  | 'mastered'
  | 'bookmarked'
  | 'due'
  | 'recently';

export type VocabularyNotebookView = 'compact' | 'cards';

export interface VocabularyNotebookItem extends CurriculumWithMastery {
  partOfSpeech: string[];
  bookmarked: boolean;
  dueForReview: boolean;
  quizScore?: number;
  contentMastery: ContentMasteryAssessment;
}

export interface VocabularyNotebookQuery {
  query?: string;
  level?: 'all' | 'N5' | 'N4';
  progress?: VocabularyNotebookProgressFilter;
  partOfSpeech?: string;
  limit?: number;
  offset?: number;
}
