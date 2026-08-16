export type PracticeMistakeCategory =
  | 'grammar'
  | 'vocabulary'
  | 'kanji'
  | 'particle'
  | 'conjugation'
  | 'naturalness';

export type PracticeSkillType = 'grammar' | 'vocabulary' | 'kanji';

export interface PracticeLogMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface PracticeLogMetadata {
  mistakes: {
    original: string;
    corrected: string;
    type?: string;
    point?: string;
  }[];
  newVocabulary: string[];
  kanjiUsed: string[];
  topics: string[];
}

export interface PracticeLogSession {
  id: string;
  practicedAt: string;
  messages: PracticeLogMessage[];
  transcript: string;
  startIndex: number;
  endIndex: number;
  metadata?: PracticeLogMetadata;
}

export interface PracticeAnalysis {
  mistakes: {
    original: string;
    corrected: string;
    category: PracticeMistakeCategory;
    explanation: string;
    confidence: number;
  }[];
  weakGrammar: string[];
  weakVocabulary: string[];
  weakKanji: string[];
  learnedVocabulary: {
    word: string;
    reading: string;
    meaning: string;
  }[];
  strengths: string[];
  recurringMistakes: string[];
  suggestedReview: string[];
  topics: string[];
}

export interface PracticeCurriculumLink {
  type: PracticeSkillType;
  key: string;
  curriculumItemId: string;
  evidence: 'weak' | 'strong';
}

export interface PracticeSessionAnalysis {
  sessionId: string;
  analysis: PracticeAnalysis;
  curriculumLinks: PracticeCurriculumLink[];
}

export interface PracticeSyncState {
  googleConnected: boolean;
  documentId?: string;
  documentTitle?: string;
  lastProcessedIndex: number;
  lastProcessedSessionId?: string;
  lastSyncedAt?: string;
  lastNewConversationCount: number;
  personalizationEnabled: boolean;
  connectedAt?: string;
}

export interface PracticeSkillProfile {
  type: PracticeSkillType;
  key: string;
  curriculumItemId?: string;
  mastery: number;
  mistakes: number;
  successfulUses: number;
  encounters: number;
  lastPracticedAt: string;
}

export interface PracticeMistakeInsight {
  id: string;
  sessionId: string;
  practicedAt: string;
  original: string;
  corrected: string;
  category: PracticeMistakeCategory;
  explanation: string;
  confidence: number;
  frequency: number;
}

export interface PracticeVocabularyInsight {
  word: string;
  reading: string;
  meaning: string;
  firstSeenAt: string;
  lastSeenAt: string;
  frequency: number;
}

export interface PracticeDashboard {
  state: PracticeSyncState;
  sessionCount: number;
  recentMistakes: PracticeMistakeInsight[];
  recurringWeaknesses: PracticeSkillProfile[];
  learnedVocabulary: PracticeVocabularyInsight[];
  suggestedReview: string[];
  recentTopics: string[];
  improvingSkillCount: number;
}

export interface PracticeSyncResult {
  documentTitle: string;
  newConversationCount: number;
  syncedAt: string;
}
