import type { CurriculumWithMastery, LearningAttempt } from './learning';

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
}

export interface VocabularyPracticeOption {
  id: string;
  label: string;
  feedback?: string;
}

export interface VocabularyPracticeQuestion {
  id: string;
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
  totalQuestions: number;
  percentage: number;
}
