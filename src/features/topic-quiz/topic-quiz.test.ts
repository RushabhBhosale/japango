import { describe, expect, it } from 'vitest';

import { parseTopicQuizVariantId, selectTopicQuizQuestionIds } from './topic-quiz';

const questions = ['question-a', 'question-b', 'question-c', 'question-d', 'question-e', 'question-f', 'question-g', 'question-h'];

describe('topic quiz selection', () => {
  it('selects a deterministic five-question quick quiz without duplicate IDs', () => {
    const first = selectTopicQuizQuestionIds(questions, 'quick');
    expect(first).toEqual(selectTopicQuizQuestionIds([...questions].reverse(), 'quick'));
    expect(first).toHaveLength(5);
    expect(new Set(first)).toHaveLength(5);
  });

  it('creates deterministic, addressable variants when ten questions are requested from a smaller bank', () => {
    const selected = selectTopicQuizQuestionIds(questions, 'standard');
    expect(selected).toHaveLength(10);
    expect(new Set(selected)).toHaveLength(10);
    expect(selected.slice(8).map(parseTopicQuizVariantId)).toEqual([
      { sourceQuestionId: expect.any(String), variantIndex: 1 },
      { sourceQuestionId: expect.any(String), variantIndex: 1 },
    ]);
  });

  it('uses every canonical question exactly once for full practice', () => {
    expect(selectTopicQuizQuestionIds(questions, 'full')).toEqual(questions);
  });
});
