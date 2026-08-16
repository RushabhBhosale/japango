import type { CurriculumItemType } from './learning';

export type DailyHomeworkItemType = Extract<CurriculumItemType, 'vocabulary' | 'kanji' | 'grammar'>;
export type DailyHomeworkSource = 'weakness' | 'new' | 'conversation-practice' | 'due-review';

export interface DailyHomeworkItem {
  id: string;
  homeworkId: string;
  itemId: string;
  type: DailyHomeworkItemType;
  source: DailyHomeworkSource;
  position: number;
  title: string;
  reading?: string;
  meaning?: string;
}

export interface DailyHomework {
  id: string;
  userId: string;
  date: string;
  estimatedMinutes: number;
  createdAt: string;
  items: DailyHomeworkItem[];
  completedItemIds: string[];
  completedAt?: string;
}

export interface CurrentLearningTarget {
  itemId: string;
  type: DailyHomeworkItemType;
  key: string;
  reading?: string;
  meaning?: string;
}
