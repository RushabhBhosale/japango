import { describe, expect, it } from 'vitest';

import { japaneseTextSimilarity } from './similarity';

describe('source similarity guard', () => {
  it('flags a copied item and permits a distinct original item', () => {
    expect(japaneseTextSimilarity('わたしは駅で友だちを待ちます。', 'わたしは駅で友だちを待ちます。')).toBe(1);
    expect(japaneseTextSimilarity('わたしは駅で友だちを待ちます。', '来週、図書館で本を借ります。')).toBeLessThan(0.82);
  });
});
