import { describe, expect, it } from 'vitest';

import { cosineSimilarity, selectRelevantMemories } from './memory-retrieval';

describe('chat memory retrieval', () => {
  it('uses cosine similarity only across compatible vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1], [1, 0])).toBe(0);
  });

  it('returns only the most relevant durable memories', () => {
    const memories = [
      { id: 'anime', characterId: 'yui', text: 'The user likes anime.', importance: 0.8, embedding: [1, 0], createdAt: '2026-01-01' },
      { id: 'kyoto', characterId: 'yui', text: 'The user wants to visit Kyoto.', importance: 0.9, embedding: [0, 1], createdAt: '2026-01-01' },
    ];

    expect(selectRelevantMemories([0.95, 0.05], memories).map(({ memory }) => memory.id)).toEqual(['anime']);
  });
});
