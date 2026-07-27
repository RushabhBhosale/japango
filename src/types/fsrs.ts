export const fsrsCardStates = [
  'new',
  'learning',
  'review',
  'relearning',
  'mastered',
  'suspended',
  'buried',
] as const;

export type FsrsCardState = (typeof fsrsCardStates)[number];
export type FsrsRating = 'again' | 'hard' | 'good' | 'easy';

export interface FsrsCard {
  userId: string;
  itemId: string;
  state: FsrsCardState;
  stability: number;
  difficulty: number;
  retrievability: number;
  dueAt: string;
  lastReviewedAt?: string;
  repetitions: number;
  lapses: number;
  lastRating?: FsrsRating;
  scheduledDays: number;
  elapsedDays: number;
  buriedUntil?: string;
  suspendedAt?: string;
}

export interface FsrsReviewResult {
  card: FsrsCard;
  previousState: FsrsCardState;
  rating: FsrsRating;
  reviewedAt: string;
  responseTimeMs: number;
}

export interface FsrsQueueLimits {
  newCardsPerDay: number;
  reviewsPerDay: number;
}

export interface FsrsQueueItem {
  itemId: string;
  state: FsrsCardState;
  dueAt: string;
  isOverdue: boolean;
}

export interface FsrsQueue {
  overdue: FsrsQueueItem[];
  due: FsrsQueueItem[];
  learning: FsrsQueueItem[];
  newCards: FsrsQueueItem[];
}
