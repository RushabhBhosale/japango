import { describe, expect, it } from 'vitest';

import { matchesNotebookProgress, matchesNotebookSearch, type NotebookFilterCandidate } from './notebook-filters';

const candidate: NotebookFilterCandidate = {
  level: 'N4', title: '読む', reading: 'よむ', meaning: 'to read', status: 'weak', attemptCount: 3,
  bookmarked: true, dueForReview: true, recentlyViewed: true,
};

describe('Study Library notebook filters', () => {
  it('filters grammar, vocabulary, and kanji progress using the same deterministic status rules', () => {
    expect(matchesNotebookProgress(candidate, 'weak')).toBe(true);
    expect(matchesNotebookProgress(candidate, 'studied')).toBe(true);
    expect(matchesNotebookProgress(candidate, 'not-studied')).toBe(false);
    expect(matchesNotebookProgress({ ...candidate, status: 'mastered' }, 'mastered')).toBe(true);
    expect(matchesNotebookProgress(candidate, 'bookmarked')).toBe(true);
    expect(matchesNotebookProgress(candidate, 'due')).toBe(true);
    expect(matchesNotebookProgress(candidate, 'recently')).toBe(true);
  });

  it('searches Japanese, readings, and English meanings', () => {
    expect(matchesNotebookSearch(candidate, '読')).toBe(true);
    expect(matchesNotebookSearch(candidate, 'よむ')).toBe(true);
    expect(matchesNotebookSearch(candidate, 'READ')).toBe(true);
    expect(matchesNotebookSearch(candidate, 'write')).toBe(false);
  });
});
