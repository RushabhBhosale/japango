import type { CurriculumLevel } from './learning';

export type DailyReadingType =
  | 'slice-of-life'
  | 'conversation'
  | 'diary'
  | 'travel'
  | 'mystery'
  | 'school-work'
  | 'fictional-news'
  | 'culture'
  | 'story-episode';

export interface DailyReadingVocabulary {
  sourceItemId: string;
  word: string;
  reading: string;
  meaning: string;
  isNew: boolean;
}

export interface DailyReadingGrammar {
  sourceItemId: string;
  pattern: string;
  meaning: string;
}

export interface DailyReadingQuestion {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctAnswer: number;
  explanation: string;
  targetVocabularyIds: string[];
}

export interface DailyReading {
  id: string;
  date: string;
  level: CurriculumLevel;
  type: DailyReadingType;
  title: string;
  content: string;
  targetVocabulary: DailyReadingVocabulary[];
  targetGrammar: DailyReadingGrammar[];
  questions: DailyReadingQuestion[];
  seriesId?: string;
  episodeNumber?: number;
  previousEpisodeId?: string;
  generatedAt: string;
}

export interface DailyReadingAnswer {
  questionId: string;
  selectedAnswer: number;
  correct: boolean;
  answeredAt: string;
}

export interface DailyReadingProgress {
  readingId: string;
  date: string;
  openedAt?: string;
  answers: DailyReadingAnswer[];
  vocabularyTapped: Record<string, number>;
  savedVocabularyIds: string[];
  completedAt?: string;
  score?: number;
}

export interface DailyReadingHomeState {
  reading?: DailyReading;
  progress?: DailyReadingProgress;
  streak: number;
}

export interface DailyReadingContextItem {
  id: string;
  japanese: string;
  reading?: string;
  meaning: string;
}

export interface DailyReadingLearningContext {
  knownVocabulary: DailyReadingContextItem[];
  weakVocabulary: DailyReadingContextItem[];
  recentVocabulary: DailyReadingContextItem[];
  newVocabularyCandidates: DailyReadingContextItem[];
  recentGrammar: DailyReadingContextItem[];
  learnedKanji: DailyReadingContextItem[];
  recentTopics: string[];
}
