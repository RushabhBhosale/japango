import { z } from 'zod';

import { getActiveYuiScenario, getRecentChatMistakes } from '@/services/database/ai-chat-repository';
import { getDailyHomework, getOrCreateDailyHomework, getCurrentLearningTargets, localDateKey } from '@/services/database/daily-homework-repository';
import { getFsrsDailyQueue } from '@/services/database/fsrs-repository';
import type { NotificationLogEntry, NotificationLogStatus, NotificationPreferences, NotificationSchedulerState, NotificationType } from '@/types/notifications';
import { createLocalId } from '@/utils/id';

import { getDatabase } from './database';
import { getSetting, setSetting } from './settings-repository';

const notificationTypeSchema = z.enum([
  'daily_homework', 'due_review', 'micro_vocabulary', 'micro_kanji', 'grammar_tip',
  'mistake_review', 'ai_chat', 'scenario_continuation', 'progress',
]);
const notificationDataSchema = z.object({
  type: notificationTypeSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
  chatId: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  itemId: z.string().min(1).optional(),
  itemType: z.enum(['vocabulary', 'kanji', 'grammar']).optional(),
  source: z.enum(['japango-auto', 'japango-test']),
}).strict();
const preferencesSchema = z.object({
  enabled: z.boolean(),
  aiChat: z.boolean(),
  dailyHomework: z.boolean(),
  reviews: z.boolean(),
  learningTips: z.boolean(),
  frequency: z.enum(['light', 'normal', 'frequent']),
  activeHours: z.object({ start: z.number().int().min(0).max(23), end: z.number().int().min(0).max(23) }).strict(),
}).strict().refine((value) => value.activeHours.start < value.activeHours.end, 'Active hours must have a start before the end.');

export const defaultNotificationPreferences: NotificationPreferences = {
  enabled: false,
  aiChat: true,
  dailyHomework: true,
  reviews: true,
  learningTips: true,
  frequency: 'normal',
  activeHours: { start: 9, end: 21 },
};

interface NotificationLogRow {
  id: string;
  notification_id: string | null;
  notification_type: NotificationType;
  title: string;
  body: string;
  data_json: string;
  status: NotificationLogStatus;
  scheduled_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  error_message: string | null;
  created_at: string;
}

function mapLog(row: NotificationLogRow): NotificationLogEntry {
  return {
    id: row.id,
    notificationId: row.notification_id ?? undefined,
    type: row.notification_type,
    title: row.title,
    body: row.body,
    data: notificationDataSchema.parse(JSON.parse(row.data_json) as unknown),
    status: row.status,
    scheduledAt: row.scheduled_at,
    deliveredAt: row.delivered_at ?? undefined,
    openedAt: row.opened_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
  };
}

function localDayRange(date: string): { from: string; to: string } {
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(year!, month! - 1, day!, 0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  return (await getSetting('notification_preferences', preferencesSchema)) ?? defaultNotificationPreferences;
}

export async function setNotificationPreferences(preferences: NotificationPreferences): Promise<void> {
  await setSetting('notification_preferences', preferences, preferencesSchema);
}

export async function recordNotificationAppActivity(now = new Date().toISOString()): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO notification_activity (id, last_app_open_at, updated_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_app_open_at = excluded.last_app_open_at, updated_at = excluded.updated_at`,
    now,
    now,
  );
}

export async function getLastNotificationAppActivity(): Promise<string | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ last_app_open_at: string | null }>('SELECT last_app_open_at FROM notification_activity WHERE id = 1');
  return row?.last_app_open_at ?? undefined;
}

export async function createNotificationLog(input: Omit<NotificationLogEntry, 'id' | 'createdAt'>): Promise<NotificationLogEntry> {
  const database = await getDatabase();
  const entry: NotificationLogEntry = { ...input, id: createLocalId('notification-log'), createdAt: new Date().toISOString() };
  await database.runAsync(
    `INSERT INTO notification_log
     (id, notification_id, notification_type, title, body, data_json, status, scheduled_at, delivered_at, opened_at, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    entry.id,
    entry.notificationId ?? null,
    entry.type,
    entry.title,
    entry.body,
    JSON.stringify(notificationDataSchema.parse(entry.data)),
    entry.status,
    entry.scheduledAt,
    entry.deliveredAt ?? null,
    entry.openedAt ?? null,
    entry.errorMessage ?? null,
    entry.createdAt,
  );
  return entry;
}

export async function updateNotificationLog(notificationId: string, status: NotificationLogStatus, errorMessage?: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE notification_log SET status = ?, delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END,
       opened_at = CASE WHEN ? = 'opened' THEN ? ELSE opened_at END,
       error_message = COALESCE(?, error_message)
     WHERE notification_id = ?`,
    status,
    status,
    now,
    status,
    now,
    errorMessage ?? null,
    notificationId,
  );
}

export async function getNotificationLogs(input: { date?: string; limit?: number; status?: NotificationLogStatus } = {}): Promise<NotificationLogEntry[]> {
  const database = await getDatabase();
  const limit = Math.max(1, Math.min(100, input.limit ?? 30));
  const clauses: string[] = [];
  const values: (string | number)[] = [];
  if (input.date) {
    const range = localDayRange(input.date);
    clauses.push('scheduled_at >= ? AND scheduled_at < ?');
    values.push(range.from, range.to);
  }
  if (input.status) {
    clauses.push('status = ?');
    values.push(input.status);
  }
  const rows = await database.getAllAsync<NotificationLogRow>(
    `SELECT * FROM notification_log ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY scheduled_at DESC LIMIT ?`,
    ...values,
    limit,
  );
  return rows.map(mapLog);
}

export async function cancelNotificationLog(notificationId: string): Promise<void> {
  await updateNotificationLog(notificationId, 'cancelled');
}

export async function getNotificationSchedulerState(date = localDateKey()): Promise<NotificationSchedulerState> {
  const [homework, queue, appActivity, scenario, mistakes, targets, logs, database] = await Promise.all([
    getOrCreateDailyHomework(date),
    getFsrsDailyQueue(),
    getLastNotificationAppActivity(),
    getActiveYuiScenario(),
    getRecentChatMistakes(3),
    getCurrentLearningTargets(date),
    getNotificationLogs({ date, limit: 20 }),
    getDatabase(),
  ]);
  const chatActivity = await database.getFirstAsync<{ created_at: string | null }>(
    `SELECT MAX(created_at) AS created_at FROM ai_chat_messages WHERE chat_id = 'yui-main'`,
  );
  return {
    homeworkComplete: homework.completedItemIds.length >= homework.items.length && homework.items.length > 0,
    reviewsDue: queue.learning.length + queue.overdue.length + queue.due.length,
    lastAppOpenAt: appActivity,
    lastChatAt: chatActivity?.created_at ?? undefined,
    notificationsSentToday: logs.filter((entry) => entry.data.source === 'japango-auto' && entry.status !== 'cancelled' && entry.status !== 'failed').length,
    lastNotificationAt: logs.find((entry) => entry.data.source === 'japango-auto' && entry.status !== 'cancelled' && entry.status !== 'failed')?.scheduledAt,
    currentScenario: Boolean(scenario),
    recentMistakes: mistakes.length,
    currentLearningTargets: targets,
  };
}

export async function getHomeworkNotificationProgress(date = localDateKey()): Promise<{ completed: number; total: number }> {
  const homework = await getDailyHomework(date);
  return { completed: homework?.completedItemIds.length ?? 0, total: homework?.items.length ?? 0 };
}
