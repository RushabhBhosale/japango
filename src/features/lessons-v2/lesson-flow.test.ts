import { describe, expect, it } from 'vitest';

import { recordLessonsV2Completion } from './lesson-flow';

describe('Lessons V2 progress', () => {
  it('keeps V2 section/question completion idempotent', () => {
    const initial = { lessonVersionId: 'version-1', completedSectionIds: [], completedQuestionIds: [], updatedAt: '2026-08-03T00:00:00.000Z' };
    const once = recordLessonsV2Completion(initial, 'section-1', 'question-1');
    const twice = recordLessonsV2Completion(once, 'section-1', 'question-1');
    expect(twice.completedSectionIds).toEqual(['section-1']);
    expect(twice.completedQuestionIds).toEqual(['question-1']);
  });
});
