import type { CurriculumWithMastery } from './learning';
import type { ContentMasteryAssessment } from './content-mastery';

export const studyLibraryContentTypes = ['grammar', 'vocabulary', 'kanji'] as const;

export type StudyLibraryContentType = (typeof studyLibraryContentTypes)[number];

export type StudyLibraryFilter =
  | 'all'
  | 'N5'
  | 'N4'
  | 'studied'
  | 'not-studied'
  | 'weak'
  | 'mastered'
  | 'bookmarked'
  | 'recently';

export interface StudyLibrarySummary {
  type: StudyLibraryContentType;
  totalCount: number;
  studiedCount: number;
  masteredCount: number;
  bookmarkedCount: number;
}

export type StudyLibraryItem = CurriculumWithMastery & {
  bookmarked: boolean;
  quizScore?: number;
  contentMastery: ContentMasteryAssessment;
};

export type StudyLibraryResumeTarget =
  | {
      kind: 'content-practice';
      sessionId: string;
      contentType: 'grammar' | 'kanji' | 'reading' | 'listening';
      itemId: string;
      updatedAt: string;
    }
  | {
      kind: 'vocabulary-practice';
      sessionId: string;
      itemId: string;
      updatedAt: string;
    };

export interface StudyLibraryHomeData {
  summaries: StudyLibrarySummary[];
  resumableSession?: StudyLibraryResumeTarget;
  bookmarkedItems: StudyLibraryItem[];
  weakItems: StudyLibraryItem[];
  recentlyViewed: StudyLibraryHistoryItem[];
  latestFlashcardSession?: {
    status: 'in-progress' | 'completed' | 'ended';
    itemCount: number;
    updatedAt: string;
  };
}

export interface StudyLibraryHistoryItem {
  id: string;
  itemId: string;
  type: StudyLibraryContentType;
  level: 'N5' | 'N4';
  title: string;
  meaning?: string;
  reading?: string;
  viewedAt: string;
}

export interface StudyLibrarySearchOptions {
  types?: StudyLibraryContentType[];
  level?: 'all' | 'N5' | 'N4';
  limit?: number;
}
