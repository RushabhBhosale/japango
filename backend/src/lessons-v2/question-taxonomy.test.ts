import { describe, expect, it } from 'vitest';

import { classifyJlptQuestionPattern } from './question-taxonomy';

describe('JLPT taxonomy', () => {
  it('classifies observed star-ordering format', () => {
    expect(classifyJlptQuestionPattern({ sourceChunkId: 'a', sourcePath: 'a', sourceTranscription: '文法\n___ ★ ___', section: 'grammar', sourceQuality: 'verified', warnings: [] })).toBe('sentence_order_star');
  });

  it('does not invent an unsupported format', () => {
    expect(classifyJlptQuestionPattern({ sourceChunkId: 'a', sourcePath: 'a', sourceTranscription: '意味が不明です', sourceQuality: 'verified', warnings: [] })).toBeUndefined();
  });
});
