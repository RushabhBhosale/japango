import { describe, expect, it } from 'vitest';

import { createKanjiFlashcards, kanjiFlashcardAttemptPolicy } from './flashcards';
import type { KanjiFlashcardItem } from '@/types/kanji-flashcards';

const item: KanjiFlashcardItem = {
  id: 'kanji-n5-day', type: 'kanji', level: 'N5', title: '日', meaning: 'day', tags: [],
  mastery: { userId: 'learner', itemId: 'kanji-n5-day', masteryScore: 0, confidenceScore: 0, correctCount: 0, incorrectCount: 0, averageResponseTimeMs: 0, reviewIntervalDays: 0, status: 'new' },
  meanings: ['day', 'sun'], onReadings: ['ニチ'], kunReadings: ['ひ'], vocabularyIds: [], bookmarked: false, dueForReview: false, contentMastery: { state: 'not_started', reason: 'Not yet tested' }, exampleVocabulary: ['日本'],
};

describe('kanji flashcards', () => {
  it('keeps one canonical FSRS card per kanji even with multiple directions', () => {
    const cards = createKanjiFlashcards([item, item], ['kanji-to-meaning', 'reading-to-kanji']);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.item.id).toBe(item.id);
  });

  it('renders each supported direction without leaking an answer before reveal', () => {
    for (const direction of ['kanji-to-meaning', 'kanji-to-reading', 'meaning-to-kanji', 'reading-to-kanji', 'vocabulary-to-reading'] as const) {
      const [card] = createKanjiFlashcards([item], [direction]);
      expect(card?.direction).toBe(direction);
      expect(card?.frontText).toBeTruthy();
      expect(card?.answer).toBeTruthy();
    }
  });

  it('maps ratings to deterministic FSRS attempt outcomes', () => {
    expect(kanjiFlashcardAttemptPolicy('again')).toEqual({ correct: false, rating: 'again' });
    expect(kanjiFlashcardAttemptPolicy('easy')).toEqual({ correct: true, rating: 'easy' });
  });
});
