import { describe, expect, it } from 'vitest';

import { extractOfficialAnswerKey } from './answer-key-mapper';

describe('answer-key mapping', () => {
  it('maps only aligned official answer rows', () => {
    expect(extractOfficialAnswerKey('正答表\n1 2 3\n2 4 1')).toEqual([
      { questionNumber: '1', answerChoice: '2', status: 'official' },
      { questionNumber: '2', answerChoice: '4', status: 'official' },
      { questionNumber: '3', answerChoice: '1', status: 'official' },
    ]);
  });

  it('keeps unknown answers unknown when no key exists', () => {
    expect(extractOfficialAnswerKey('問題 1\n1 2 3 4')).toEqual([]);
  });
});
