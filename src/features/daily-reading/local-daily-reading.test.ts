import { describe, expect, it } from 'vitest';

import type { DailyReadingLearningContext } from '@/types/daily-reading';

import { buildLocalDailyReading } from './local-daily-reading';
import { dailyReadingSchema } from './schemas';

const emptyContext: DailyReadingLearningContext = {
  knownVocabulary: [],
  weakVocabulary: [],
  recentVocabulary: [],
  newVocabularyCandidates: [],
  recentGrammar: [],
  learnedKanji: [],
  recentTopics: [],
};

function dateOffset(offset: number): string {
  const date = new Date(Date.UTC(2026, 0, 1 + offset));
  return date.toISOString().slice(0, 10);
}

describe('local Daily Reading furigana', () => {
  it.each([
    ['N5', 12],
    ['N4', 18],
  ] as const)('validates every bundled %s passage and question reading', (level, passageCount) => {
    const titles = new Set<string>();
    for (let offset = 0; offset < passageCount; offset += 1) {
      const reading = buildLocalDailyReading(dateOffset(offset), level, emptyContext);
      expect(() => dailyReadingSchema.parse(reading), `${reading.id}: ${reading.title}`).not.toThrow();
      titles.add(reading.title);
    }
    expect(titles.size).toBe(passageCount);
  });
});
