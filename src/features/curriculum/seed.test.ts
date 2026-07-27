import { describe, expect, it } from 'vitest';

import { assessmentQuestionSeed } from '../assessment/seed';
import { n5CurriculumSeed } from './seed';

describe('Phase 1 seed data', () => {
  it('contains the required minimum N5 curriculum', () => {
    const count = (type: 'vocabulary' | 'kanji' | 'grammar') =>
      n5CurriculumSeed.filter((item) => item.level === 'N5' && item.type === type).length;

    expect(count('vocabulary')).toBeGreaterThanOrEqual(20);
    expect(count('kanji')).toBeGreaterThanOrEqual(10);
    expect(count('grammar')).toBeGreaterThanOrEqual(10);
  });

  it('provides 20 ordered questions across every required skill and question format', () => {
    expect(assessmentQuestionSeed).toHaveLength(20);
    expect(new Set(assessmentQuestionSeed.map((question) => question.position)).size).toBe(20);
    expect(new Set(assessmentQuestionSeed.map((question) => question.category))).toEqual(
      new Set(['vocabulary', 'kanji', 'grammar', 'reading']),
    );
    expect(new Set(assessmentQuestionSeed.map((question) => question.type))).toEqual(
      new Set(['multiple-choice', 'choose-reading', 'fill-blank', 'short-reading']),
    );
  });
});
