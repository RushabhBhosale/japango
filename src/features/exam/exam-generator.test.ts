import { describe, expect, it } from 'vitest';

import { generateExamQuestionIds } from './exam-generator';
import type { PracticeSelection } from '@/types/exam';

const selection: PracticeSelection = { kind: 'mock-exam', level: 'N5', domains: ['vocabulary', 'grammar', 'kanji', 'reading', 'listening'], questionCount: 10, timerMode: 'countdown', timeLimitSeconds: 600, source: 'all', seed: 'n5-example' };
const candidates = selection.domains.flatMap((domain) => [1, 2, 3].map((index) => ({ id: `${domain}-${index}`, itemId: `${domain}-item-${index}`, domain, level: 'N5' as const, presentation: 'meaning', prompt: `${domain} ${index}`, explanation: undefined, correctOptionId: 'a', options: [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }], tags: [domain], masteryStatus: 'new' as const, bookmarked: false, isDue: false, incorrectCount: 0, difficultyRank: 3 })));

describe('generateExamQuestionIds', () => {
  it('is deterministic, balanced by domain, and has no duplicate question IDs', () => {
    const first = generateExamQuestionIds(candidates, selection);
    expect(first).toEqual(generateExamQuestionIds(candidates, selection));
    expect(new Set(first).size).toBe(first.length);
    for (const domain of selection.domains) expect(first.filter((id) => id.startsWith(domain)).length).toBe(2);
  });

  it('avoids recently seen questions while alternatives are available', () => {
    const ids = generateExamQuestionIds(candidates.map((candidate) => candidate.id.endsWith('-1') ? { ...candidate, lastSeenAt: '2026-07-01T00:00:00.000Z' } : candidate), selection);
    expect(ids.some((id) => id.endsWith('-1'))).toBe(false);
  });
});
