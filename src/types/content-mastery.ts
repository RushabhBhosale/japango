import type { FsrsCard } from './fsrs';
import type { UserMastery } from './learning';

export type ContentMasteryState =
  | 'not_started'
  | 'studying'
  | 'needs_review'
  | 'good'
  | 'mastered';

export interface ContentMasteryAssessment {
  state: ContentMasteryState;
  reason: string;
}

export interface ContentMasteryInput {
  mastery: UserMastery;
  latestQuizScore?: number;
  recentMistakeCount?: number;
  fsrsCard?: FsrsCard;
  now?: Date;
}
