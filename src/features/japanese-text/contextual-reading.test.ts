import { describe, expect, it } from 'vitest';

import mobileCurriculum from '../../../assets/mobile-curriculum/release.json';

import {
  alignContextualReading,
  hasCompleteContextualReading,
  normalizeJapaneseReading,
} from './contextual-reading';

const kanjiPattern = /[\u3400-\u9fff々ヶ]/u;
const kanaPattern = /^[\u3041-\u3096\u309d\u309eー]+$/u;

describe('contextual Japanese readings', () => {
  it('keeps inflected and context-sensitive readings attached to their exact kanji run', () => {
    const segments = alignContextualReading(
      '今日は予定を変える前に、一人で確認します。',
      'きょうはよていをかえるまえに、ひとりでかくにんします。',
    );

    expect(segments?.filter(({ reading }) => reading).map(({ text, reading }) => [text, reading])).toEqual([
      ['今日', 'きょう'],
      ['予定', 'よてい'],
      ['変', 'か'],
      ['前', 'まえ'],
      ['一人', 'ひとり'],
      ['確認', 'かくにん'],
    ]);
  });

  it('normalizes katakana readings without changing punctuation', () => {
    expect(normalizeJapaneseReading('メールを 読む。')).toBe('めーるを読む。');
  });

  it('rejects a reading that cannot reconstruct the written sentence', () => {
    expect(alignContextualReading('今日は雨です。', 'きょうがあめです。')).toBeUndefined();
    expect(hasCompleteContextualReading('今日は雨です。', 'きょうはあめです。')).toBe(true);
  });

  it('aligns the full reading used by Yui’s opening chat message', () => {
    const message = 'こんにちは！今、ちょっと休憩中。今日はどんな一日だった？';
    const reading = 'こんにちは！いま、ちょっときゅうけいちゅう。きょうはどんないちにちだった？';

    expect(hasCompleteContextualReading(message, reading)).toBe(true);
    expect(alignContextualReading(message, reading)?.filter(({ reading: itemReading }) => itemReading)).toEqual([
      expect.objectContaining({ text: '今', reading: 'いま' }),
      expect.objectContaining({ text: '休憩中', reading: 'きゅうけいちゅう' }),
      expect.objectContaining({ text: '今日', reading: 'きょう' }),
      expect.objectContaining({ text: '一日', reading: 'いちにち' }),
    ]);
  });

  it('covers every kanji occurrence in every bundled Daily Reading passage', () => {
    for (const passage of mobileCurriculum.readingPassages) {
      const segments = alignContextualReading(passage.japanese, passage.reading);
      expect(segments, passage.id).toBeDefined();
      expect(segments?.map(({ text }) => text).join(''), passage.id).toBe(passage.japanese);
      for (const segment of segments ?? []) {
        if (!kanjiPattern.test(segment.text)) continue;
        expect(segment.reading, `${passage.id}: ${segment.text}`).toBeDefined();
        expect(segment.reading, `${passage.id}: ${segment.text}`).toMatch(kanaPattern);
      }
    }
  });

  it('uses the reviewed occurrence reading for contextual variants', () => {
    const schedule = mobileCurriculum.readingPassages.find(({ id }) => id === 'reading-passage-n4-medium-009')!;
    const square = mobileCurriculum.readingPassages.find(({ id }) => id === 'reading-passage-n4-medium-008')!;
    const scheduleSegments = alignContextualReading(schedule.japanese, schedule.reading);

    expect(scheduleSegments).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '時計', reading: 'どけい' }),
      expect.objectContaining({ text: '明日', reading: 'あした' }),
    ]));
    expect(square.reading).toContain('ちいさなひろば');
    expect(hasCompleteContextualReading(square.japanese, square.reading)).toBe(true);
  });
});
