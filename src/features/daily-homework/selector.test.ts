import { describe, expect, it } from 'vitest';

import { selectDailyHomework, type DailyHomeworkCandidate } from './selector';

function candidates(type: DailyHomeworkCandidate['type'], count: number, source: DailyHomeworkCandidate['source'], offset: number): DailyHomeworkCandidate[] {
  return Array.from({ length: count }, (_, index) => ({ id: `${type}-${source}-${offset + index}`, type, source, priority: count - index }));
}

describe('daily homework selection', () => {
  it('keeps the compact vocabulary, kanji, grammar, and due-review targets', () => {
    const input = [
      ...candidates('vocabulary', 8, 'weakness', 0),
      ...candidates('vocabulary', 8, 'new', 20),
      ...candidates('kanji', 6, 'conversation-practice', 40),
      ...candidates('kanji', 4, 'new', 60),
      ...candidates('grammar', 3, 'weakness', 80),
      ...candidates('vocabulary', 3, 'due-review', 90),
    ];

    const plan = selectDailyHomework(input);

    expect(plan.filter((item) => item.type === 'vocabulary')).toHaveLength(8);
    expect(plan.filter((item) => item.type === 'kanji')).toHaveLength(2);
    expect(plan.filter((item) => item.type === 'grammar')).toHaveLength(1);
    expect(plan.filter((item) => item.source === 'due-review')).toHaveLength(3);
    expect(new Set(plan.map((item) => item.id)).size).toBe(plan.length);
  });

  it('does not invent grammar homework when no supported grammar is available', () => {
    const plan = selectDailyHomework([
      ...candidates('vocabulary', 5, 'new', 0),
      ...candidates('kanji', 2, 'new', 10),
    ]);

    expect(plan.some((item) => item.type === 'grammar')).toBe(false);
  });

  it('uses the local calendar date to rotate equally suitable material', () => {
    const input = [
      ...candidates('vocabulary', 20, 'new', 0),
      ...candidates('kanji', 12, 'new', 30),
      ...candidates('grammar', 8, 'new', 50),
    ].map((candidate) => ({ ...candidate, priority: 400 }));

    const first = selectDailyHomework(input, '2026-08-15');
    const again = selectDailyHomework(input, '2026-08-15');
    const nextDay = selectDailyHomework(input, '2026-08-16');

    expect(again).toEqual(first);
    expect(nextDay.map((item) => item.id)).not.toEqual(first.map((item) => item.id));
  });
});
