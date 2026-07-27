import type { KanjiNotebookItem } from './content-learning';

export const kanjiFlashcardDirections = [
  'kanji-to-meaning',
  'kanji-to-reading',
  'meaning-to-kanji',
  'reading-to-kanji',
  'vocabulary-to-reading',
] as const;

export type KanjiFlashcardDirection = (typeof kanjiFlashcardDirections)[number];

export type KanjiFlashcardSet =
  | 'N5'
  | 'N4'
  | 'all'
  | 'weak'
  | 'due'
  | 'bookmarked'
  | 'recently-incorrect'
  | 'custom';

export interface KanjiFlashcardItem extends KanjiNotebookItem {
  exampleVocabulary: string[];
  recentAccuracy?: number;
}

export interface KanjiFlashcard {
  id: string;
  item: KanjiFlashcardItem;
  direction: KanjiFlashcardDirection;
  frontLabel: string;
  frontText: string;
  answer: string;
  answerDetail: string;
}
