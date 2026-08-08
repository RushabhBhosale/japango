import { describe, expect, it } from 'vitest';

import type { V3JapaneseLine, V3Scene } from '@/types/lesson-v3';

import { episodeOne } from './episode-one';

function japaneseLines(scene: V3Scene): V3JapaneseLine[] {
  switch (scene.type) {
    case 'chat':
      return scene.messages.map((message) => message.line);
    case 'interaction':
      return [
        ...(scene.context ? [scene.context] : []),
        ...scene.options.flatMap((option) => option.line ? [option.line] : []),
      ];
    case 'teachingMoment':
      return scene.contrast;
    case 'sentenceBuild':
      return [scene.answer];
    case 'freeResponse':
      return [scene.message.line];
    default:
      return [];
  }
}

describe('Episode 1 furigana coverage', () => {
  it('does not leave kanji in a plain, unannotated text segment', () => {
    const plainKanji = episodeOne.scenes
      .flatMap(japaneseLines)
      .flatMap((line) => line.text.tokens)
      .filter((token) => token.kind === 'plain' && /[\u3400-\u9fff]/u.test(token.surface));

    expect(plainKanji).toEqual([]);
  });

  it('supplies a reading for every authored word token containing kanji', () => {
    const kanjiTokens = episodeOne.scenes
      .flatMap(japaneseLines)
      .flatMap((line) => line.text.tokens)
      .filter((token) => token.kind === 'word' && /[\u3400-\u9fff]/u.test(token.surface));

    expect(kanjiTokens.every((token) => Boolean(token.reading))).toBe(true);
  });
});
