import type { KanjiFlashcard, KanjiFlashcardDirection, KanjiFlashcardItem } from '@/types/kanji-flashcards';
import type { FsrsRating } from '@/types/fsrs';

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  }
  return result >>> 0;
}

function promptFor(item: KanjiFlashcardItem, direction: KanjiFlashcardDirection): Omit<KanjiFlashcard, 'id' | 'item' | 'direction'> {
  const readings = [...item.onReadings, ...item.kunReadings].join(' · ') || 'No canonical reading available';
  const vocabulary = item.exampleVocabulary.join(' · ') || item.title;
  switch (direction) {
    case 'kanji-to-meaning':
      return { frontLabel: 'What does this kanji mean?', frontText: item.title, answer: item.meanings.join(' · '), answerDetail: readings };
    case 'kanji-to-reading':
      return { frontLabel: 'How is this kanji read?', frontText: item.title, answer: readings, answerDetail: item.meanings.join(' · ') };
    case 'meaning-to-kanji':
      return { frontLabel: 'Which kanji matches this meaning?', frontText: item.meanings.join(' · '), answer: item.title, answerDetail: readings };
    case 'reading-to-kanji':
      return { frontLabel: 'Which kanji matches this reading?', frontText: readings, answer: item.title, answerDetail: item.meanings.join(' · ') };
    case 'vocabulary-to-reading':
      return { frontLabel: 'How is this vocabulary read?', frontText: vocabulary, answer: readings, answerDetail: `${item.title} · ${item.meanings.join(' · ')}` };
  }
}

/**
 * One FSRS card is retained per canonical kanji ID. When multiple directions
 * are selected, this chooses one deterministic direction per kanji rather
 * than rating the same item several times in a single pass.
 */
export function createKanjiFlashcards(
  items: readonly KanjiFlashcardItem[],
  directions: readonly KanjiFlashcardDirection[],
): KanjiFlashcard[] {
  const uniqueItems = [...new Map(items.map((item) => [item.id, item])).values()];
  const usableDirections = [...new Set(directions)];
  if (!usableDirections.length) return [];
  return uniqueItems.map((item) => {
    const direction = usableDirections[hash(`kanji-flashcard-v1:${item.id}`) % usableDirections.length];
    if (!direction) throw new Error('A flashcard direction is required.');
    return {
      id: `${item.id}:${direction}`,
      item,
      direction,
      ...promptFor(item, direction),
    };
  });
}

export function kanjiFlashcardAttemptPolicy(rating: FsrsRating): { correct: boolean; rating: FsrsRating } {
  return { correct: rating !== 'again', rating };
}
