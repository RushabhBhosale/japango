import { describe, expect, it, vi } from 'vitest';

import type { AiProvider } from '../ai/types';
import { generateDailyReading, japanesePassageLength, validateGeneratedDailyReading } from './generator';
import type { DailyReadingGenerationRequest, GeneratedDailyReading } from './schemas';

const request: DailyReadingGenerationRequest = {
  date: '2026-08-11',
  level: 'N5',
  context: {
    knownVocabulary: [],
    weakVocabulary: [
      { id: 'vocab-school', japanese: '学校', reading: 'がっこう', meaning: 'school' },
      { id: 'vocab-friend', japanese: '友達', reading: 'ともだち', meaning: 'friend' },
    ],
    recentVocabulary: [],
    newVocabularyCandidates: [{ id: 'vocab-library', japanese: '図書館', reading: 'としょかん', meaning: 'library' }],
    recentGrammar: [{ id: 'grammar-after', japanese: '〜てから', meaning: 'after doing' }],
    learnedKanji: [],
    recentTopics: ['travel: 駅の旅行'],
  },
};

const content = '今日は学校へ行きました。友達と話してから、図書館で本を読みました。帰りに小さい犬を見ました。家で母に学校の話をしました。明日も友達と図書館へ行くつもりです。その図書館には面白い本がたくさんあります。私は日本の昔話を一冊借りました。';

const validReading: GeneratedDailyReading = {
  date: request.date,
  level: request.level,
  type: 'school-work',
  title: '図書館での一日',
  content,
  targetVocabulary: [
    { sourceItemId: 'vocab-school', word: '学校', reading: 'がっこう', meaning: 'school', isNew: false },
    { sourceItemId: 'vocab-friend', word: '友達', reading: 'ともだち', meaning: 'friend', isNew: false },
    { sourceItemId: 'vocab-library', word: '図書館', reading: 'としょかん', meaning: 'library', isNew: true },
  ],
  targetGrammar: [{ sourceItemId: 'grammar-after', pattern: '〜てから', meaning: 'after doing' }],
  questions: [
    { id: 'q1', question: '今日はどこへ行きましたか。', options: ['学校', '病院', '会社', '空港'], correctAnswer: 0, explanation: '最初の文に書いてあります。', targetVocabularyIds: ['vocab-school'] },
    { id: 'q2', question: 'だれと話しましたか。', options: ['母', '先生', '友達', '父'], correctAnswer: 2, explanation: '友達と話しました。', targetVocabularyIds: ['vocab-friend'] },
    { id: 'q3', question: '明日は何をするつもりですか。', options: ['家で寝る', '本を買う', '犬と歩く', '図書館へ行く'], correctAnswer: 3, explanation: '最後の文から分かります。', targetVocabularyIds: ['vocab-library'] },
  ],
  seriesId: null,
  episodeNumber: null,
  previousEpisodeId: null,
};

function provider(responses: string[]): AiProvider {
  return {
    id: 'test',
    model: 'test-model',
    capabilities: { structuredOutput: true, streaming: false, supportsJapanese: true, supportsSystemMessages: true },
    complete: vi.fn(async () => responses.shift() ?? ''),
  };
}

describe('Daily Reading generation', () => {
  it('accepts a curriculum-grounded reading in the level length range', () => {
    expect(japanesePassageLength(content)).toBeGreaterThanOrEqual(100);
    expect(validateGeneratedDailyReading(validReading, request)).toEqual({ reading: validReading, errors: [] });
  });

  it('rejects uncurated vocabulary and English in the passage', () => {
    const result = validateGeneratedDailyReading({
      ...validReading,
      content: `${content} English`,
      targetVocabulary: [{ sourceItemId: 'invented', word: '難語', reading: 'なんご', meaning: 'invented', isNew: true }],
    }, request);
    expect(result.reading).toBeUndefined();
    expect(result.errors.join(' ')).toContain('English');
    expect(result.errors.join(' ')).toContain('not in the supplied curriculum context');
  });

  it('retries validation once with correction errors and accepts the second response', async () => {
    const testProvider = provider([
      JSON.stringify({ ...validReading, content: '短い文です。' }),
      JSON.stringify(validReading),
    ]);
    const result = await generateDailyReading(request, [testProvider], new AbortController().signal);
    expect(result).toEqual(validReading);
    expect(testProvider.complete).toHaveBeenCalledTimes(2);
    const secondCall = vi.mocked(testProvider.complete).mock.calls[1]?.[0];
    expect(secondCall?.user).toContain('content length is');
  });
});
