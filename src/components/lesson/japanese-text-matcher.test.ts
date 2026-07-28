import { describe, expect, it } from 'vitest';

import { splitJapaneseText } from './japanese-text-matcher';

const items = [
  { id: 'course-vocab-benkyou-suru', type: 'vocabulary' as const, title: '勉強する', reading: 'べんきょうする' },
  { id: 'course-vocab-isogu', type: 'vocabulary' as const, title: '急ぐ', reading: 'いそぐ' },
  { id: 'kanji-急', type: 'kanji' as const, title: '急', reading: 'きゅう' },
  { id: 'vocab-eki', type: 'vocabulary' as const, title: '駅', reading: 'えき' },
  { id: 'course-vocab-nani', type: 'vocabulary' as const, title: '何', reading: 'なに' },
];

describe('Japanese text matcher', () => {
  it('keeps an inflected vocabulary word together ahead of a single kanji', () => {
    const matched = splitJapaneseText('勉強している。急がずに話します。', items)
      .filter((segment) => segment.kind === 'item');

    expect(matched.map((segment) => [segment.text, segment.reading])).toEqual([
      ['勉強している', 'べんきょうしている'],
      ['急がずに', 'いそがずに'],
    ]);
  });

  it('recognises a single-kanji word when it is followed directly by a particle', () => {
    const matched = splitJapaneseText('確認してから駅の近くで何が大切ですか。', items)
      .filter((segment) => segment.kind === 'item');

    expect(matched.map((segment) => [segment.text, segment.reading])).toEqual([
      ['駅', 'えき'],
      ['何', 'なに'],
    ]);
  });
});
