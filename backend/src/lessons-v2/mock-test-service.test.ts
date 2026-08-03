import { describe, expect, it } from 'vitest';

import { assembleMockTest } from './mock-test-service';

describe('mock-test assembly', () => {
  it('excludes recently seen generated questions', () => {
    const questions = [{ id: 'one', validationStatus: 'valid' }, { id: 'two', validationStatus: 'valid' }, { id: 'three', validationStatus: 'draft' }] as never[];
    const result = assembleMockTest(questions, new Set(['one']), 2);
    expect(result.questions.map((question) => question.id)).toEqual(['two']);
    expect(result.excludedRecentQuestionIds).toEqual(['one']);
  });
});
