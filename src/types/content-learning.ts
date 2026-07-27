import type { CurriculumWithMastery, LearningAttempt } from './learning';

export type ContentLessonType = 'grammar' | 'kanji' | 'reading' | 'listening';

export interface LinkedCurriculumItem {
  id: string;
  title: string;
  meaning?: string;
  reading?: string;
}

export interface ContentSentence {
  id: string;
  japanese: string;
  reading: string;
  meaning: string;
}

export interface ContentPracticeQuestion {
  id: string;
  itemId: string;
  domain: ContentLessonType;
  level: 'N5' | 'N4';
  presentation: string;
  prompt: string;
  explanation?: string;
  correctOptionId: string;
  options: { id: string; label: string; feedback?: string }[];
}

export interface GrammarLesson extends CurriculumWithMastery {
  meanings: string[];
  formation: { base: string; structure: string }[];
  notes?: string;
  relatedGrammar: LinkedCurriculumItem[];
  examples: ContentSentence[];
  bookmarked: boolean;
  questionCount: number;
}

export interface KanjiLesson extends CurriculumWithMastery {
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
  strokeCount?: number;
  components: string[];
  linkedVocabulary: LinkedCurriculumItem[];
  relatedKanji: LinkedCurriculumItem[];
  examples: ContentSentence[];
  bookmarked: boolean;
  questionCount: number;
}

export interface ReadingLesson extends CurriculumWithMastery {
  japanese: string;
  readingText: string;
  translation: string;
  passageType: string;
  difficultyRank: number;
  estimatedReadingSeconds: number;
  linkedVocabulary: LinkedCurriculumItem[];
  linkedGrammar: LinkedCurriculumItem[];
  bookmarked: boolean;
  questionCount: number;
}

export interface ListeningLesson extends CurriculumWithMastery {
  activityType: string;
  transcript: string;
  learnerTranscript?: string;
  speechText: string;
  translation: string;
  difficultyRank: number;
  estimatedDurationSeconds: number;
  turns: { id: string; position: number; speakerLabel: string; displayText: string; speechText: string; reading: string; english: string; pauseAfterMs: number }[];
  linkedVocabulary: LinkedCurriculumItem[];
  linkedGrammar: LinkedCurriculumItem[];
  bookmarked: boolean;
  questionCount: number;
}

export interface ContentStudySession {
  id: string;
  type: ContentLessonType;
  status: 'in-progress' | 'completed';
  itemId: string;
  questionIds: string[];
  currentIndex: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  questions: ContentPracticeQuestion[];
  attempts: LearningAttempt[];
}

export interface ContentStudyResult {
  session: ContentStudySession;
  correctCount: number;
  totalQuestions: number;
  percentage: number;
}

export interface CurriculumSearchResult {
  id: string;
  type: ContentLessonType | 'vocabulary' | 'sentence';
  level?: 'N5' | 'N4';
  title: string;
  subtitle?: string;
}
