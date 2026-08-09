import type { MasteryStatus } from './learning';

export type VocabularyFlashcardLevel = 'all' | 'N5' | 'N4';
export type VocabularyFlashcardProgressFilter = 'all' | 'learned' | 'unlearned';

export interface VocabularyFlashcard {
  id: string;
  level: 'N5' | 'N4';
  japanese: string;
  reading?: string;
  meaning?: string;
  tags: string[];
  masteryStatus: MasteryStatus;
  learned: boolean;
}

export interface VocabularyFlashcardQuery {
  level: VocabularyFlashcardLevel;
  progress: VocabularyFlashcardProgressFilter;
}

export interface VocabularyFlashcardProgress {
  filterKey: string;
  index: number;
  orderedIds: string[];
}
