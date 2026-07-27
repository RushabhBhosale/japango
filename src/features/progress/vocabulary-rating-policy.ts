import type { VocabularyRating } from '@/types/study';

export interface VocabularyRatingAttemptPolicy {
  correct: boolean;
  responseTimeMs: number;
}

// Kept separate from the mastery engine so Phase 2 has an explicit, replaceable
// rating policy rather than embedding a second SRS algorithm in a screen.
const ratingPolicies: Record<VocabularyRating, VocabularyRatingAttemptPolicy> = {
  again: { correct: false, responseTimeMs: 12000 },
  hard: { correct: true, responseTimeMs: 9000 },
  good: { correct: true, responseTimeMs: 4000 },
  easy: { correct: true, responseTimeMs: 1200 },
};

export function getVocabularyRatingAttemptPolicy(rating: VocabularyRating): VocabularyRatingAttemptPolicy {
  return ratingPolicies[rating];
}
