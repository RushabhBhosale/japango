import type { CurrentLearningTarget } from './daily-homework';

export type NotificationType =
  | 'daily_homework'
  | 'due_review'
  | 'micro_vocabulary'
  | 'micro_kanji'
  | 'grammar_tip'
  | 'mistake_review'
  | 'ai_chat'
  | 'scenario_continuation'
  | 'progress';

export type NotificationFrequency = 'light' | 'normal' | 'frequent';
export type NotificationPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';
export type NotificationLogStatus = 'scheduled' | 'delivered' | 'opened' | 'cancelled' | 'failed';

export interface NotificationPreferences {
  enabled: boolean;
  aiChat: boolean;
  dailyHomework: boolean;
  reviews: boolean;
  learningTips: boolean;
  frequency: NotificationFrequency;
  activeHours: { start: number; end: number };
}

export interface JapanGoNotificationData {
  type: NotificationType;
  date?: string;
  chatId?: string;
  messageId?: string;
  itemId?: string;
  itemType?: 'vocabulary' | 'kanji' | 'grammar';
  source: 'japango-auto' | 'japango-test';
}

export interface NotificationLogEntry {
  id: string;
  notificationId?: string;
  type: NotificationType;
  title: string;
  body: string;
  data: JapanGoNotificationData;
  status: NotificationLogStatus;
  scheduledAt: string;
  deliveredAt?: string;
  openedAt?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface NotificationSchedulerState {
  homeworkComplete: boolean;
  reviewsDue: number;
  lastAppOpenAt?: string;
  lastChatAt?: string;
  notificationsSentToday: number;
  lastNotificationAt?: string;
  currentScenario: boolean;
  recentMistakes: number;
  currentLearningTargets: CurrentLearningTarget[];
}

export interface NotificationDiagnostics {
  permission: NotificationPermissionStatus;
  sentToday: number;
  dailyTarget: number;
  nextScheduled: NotificationLogEntry[];
  todayLog: NotificationLogEntry[];
  lastNotification?: NotificationLogEntry;
  lastAppActivity?: string;
  homework: { completed: number; total: number };
  reviewsDue: number;
}
