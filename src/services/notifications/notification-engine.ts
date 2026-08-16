import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { DEFAULT_DAILY_TARGET, buildNotificationTimes, selectNotificationTypes } from '@/features/notifications/scheduler';
import { getOrCreateDailyHomework, localDateKey } from '@/services/database/daily-homework-repository';
import { getPracticeNotificationInsight } from '@/services/database/google-practice-repository';
import {
  cancelNotificationLog,
  createNotificationLog,
  getHomeworkNotificationProgress,
  getLastNotificationAppActivity,
  getNotificationLogs,
  getNotificationPreferences,
  getNotificationSchedulerState,
  recordNotificationAppActivity,
  setNotificationPreferences,
  updateNotificationLog,
} from '@/services/database/notification-repository';
import type {
  JapanGoNotificationData,
  NotificationDiagnostics,
  NotificationLogEntry,
  NotificationPermissionStatus,
  NotificationPreferences,
  NotificationType,
} from '@/types/notifications';

const automaticSource = 'japango-auto';
const testSource = 'japango-test';
const learningChannelId = 'daily-learning';

interface NotificationContent {
  title: string;
  body: string;
  data: JapanGoNotificationData;
}

type NotificationTrigger = Parameters<typeof Notifications.scheduleNotificationAsync>[0]['trigger'];

function parseNotificationData(value: unknown): JapanGoNotificationData | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const supportedTypes = new Set<NotificationType>([
    'daily_homework', 'due_review', 'micro_vocabulary', 'micro_kanji', 'grammar_tip',
    'practice_review', 'progress',
  ]);
  const source = data.source;
  if (typeof data.type !== 'string' || !supportedTypes.has(data.type as NotificationType)
    || (source !== automaticSource && source !== testSource)) return undefined;
  const optionalString = (key: string) => typeof data[key] === 'string' ? data[key] : undefined;
  const itemType = optionalString('itemType');
  if (itemType && itemType !== 'vocabulary' && itemType !== 'kanji' && itemType !== 'grammar') return undefined;
  return {
    type: data.type as NotificationType,
    date: optionalString('date'),
    practiceKey: optionalString('practiceKey'),
    itemId: optionalString('itemId'),
    itemType: itemType as JapanGoNotificationData['itemType'],
    source,
  };
}

function permissionStatus(permission: Notifications.NotificationPermissionsStatus): NotificationPermissionStatus {
  if (permission.granted) return 'granted';
  return permission.canAskAgain ? 'undetermined' : 'denied';
}

async function configureNativeNotifications(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(learningChannelId, {
    name: 'Japanese learning',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180],
    lightColor: '#505777',
  });
}

export async function getJapanGoNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (Platform.OS === 'web') return 'unsupported';
  return permissionStatus(await Notifications.getPermissionsAsync());
}

/** Call only after the learner explicitly turns on a reminder preference. */
export async function requestJapanGoNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (Platform.OS === 'web') return 'unsupported';
  await configureNativeNotifications();
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted || !existing.canAskAgain) return permissionStatus(existing);
  return permissionStatus(await Notifications.requestPermissionsAsync());
}

export async function updateJapanGoNotificationPreferences(
  next: NotificationPreferences,
): Promise<{ preferences: NotificationPreferences; permission: NotificationPermissionStatus }> {
  const needsPermission = next.enabled && (next.practiceInsights || next.dailyHomework || next.reviews || next.learningTips);
  const permission = needsPermission ? await requestJapanGoNotificationPermission() : await getJapanGoNotificationPermission();
  const preferences = needsPermission && permission !== 'granted'
    ? { ...next, enabled: false }
    : next;
  await setNotificationPreferences(preferences);
  if (preferences.enabled && permission === 'granted') void scheduleDailyJapanGoNotifications();
  else await clearScheduledJapanGoNotifications();
  return { preferences, permission };
}

function typeEnabled(type: NotificationType, preferences: NotificationPreferences): boolean {
  if (!preferences.enabled) return false;
  if (type === 'practice_review') return preferences.practiceInsights;
  if (type === 'daily_homework') return preferences.dailyHomework;
  if (type === 'due_review') return preferences.reviews;
  return preferences.learningTips;
}

async function contentFor(type: NotificationType, source: JapanGoNotificationData['source']): Promise<NotificationContent | undefined> {
  const date = localDateKey();
  const homework = await getOrCreateDailyHomework(date);
  const base = { source, date } as const;
  if (type === 'daily_homework') {
    const vocabulary = homework.items.filter((item) => item.type === 'vocabulary').length;
    const kanji = homework.items.filter((item) => item.type === 'kanji').length;
    const starter = homework.items.find((item) => item.type === 'vocabulary' && item.meaning)
      ?? homework.items.find((item) => item.meaning);
    if (starter?.meaning) {
      const itemLabel = `${starter.title}${starter.reading ? ` (${starter.reading})` : ''}`;
      const kind = starter.type === 'kanji' ? 'kanji' : starter.type === 'grammar' ? 'grammar point' : 'word';
      return { title: `A useful ${kind} for today`, body: `This ${kind} means “${starter.meaning}”: ${itemLabel}`, data: { ...base, type, itemId: starter.itemId, itemType: starter.type } };
    }
    return { title: 'Today’s practice is ready', body: `${vocabulary} words and ${kanji} kanji · about ${homework.estimatedMinutes} minutes.`, data: { ...base, type } };
  }
  if (type === 'due_review') {
    const item = homework.items.find((entry) => entry.source === 'due-review') ?? homework.items[0];
    if (!item) return undefined;
    const itemLabel = `${item.title}${item.reading ? ` (${item.reading})` : ''}`;
    const kind = item.type === 'kanji' ? 'kanji' : item.type === 'grammar' ? 'grammar point' : 'word';
    const body = item.meaning
      ? `This ${kind} means “${item.meaning}”: ${itemLabel}`
      : `Review this ${kind}: ${itemLabel}`;
    return { title: 'Quick review', body, data: { ...base, type, itemId: item.itemId, itemType: item.type } };
  }
  if (type === 'micro_vocabulary' || type === 'micro_kanji' || type === 'grammar_tip') {
    const targetType = type === 'micro_vocabulary' ? 'vocabulary' : type === 'micro_kanji' ? 'kanji' : 'grammar';
    const item = homework.items.find((entry) => entry.type === targetType);
    if (!item) return undefined;
    const itemLabel = `${item.title}${item.reading ? ` (${item.reading})` : ''}`;
    if (type === 'micro_vocabulary') {
      const body = item.meaning ? `This word means “${item.meaning}”: ${itemLabel}` : `Learn this useful word: ${itemLabel}`;
      return { title: 'A useful Japanese word', body, data: { ...base, type, itemId: item.itemId, itemType: item.type } };
    }
    if (type === 'micro_kanji') {
      const body = item.meaning ? `This kanji means “${item.meaning}”: ${itemLabel}` : `Learn this useful kanji: ${itemLabel}`;
      return { title: 'A useful kanji', body, data: { ...base, type, itemId: item.itemId, itemType: item.type } };
    }
    return { title: 'One grammar idea', body: item.meaning ? `${item.meaning}. Tap to see an easy example.` : 'A short grammar example is ready. Tap to open it.', data: { ...base, type, itemId: item.itemId, itemType: item.type } };
  }
  if (type === 'practice_review') {
    const insight = await getPracticeNotificationInsight()
      ?? (source === testSource ? { key: 'past tense', mistakes: 3, lastPracticedAt: new Date().toISOString() } : undefined);
    if (!insight) return undefined;
    if (source === automaticSource) {
      const recent = await getNotificationLogs({ limit: 50 });
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1_000;
      if (recent.some((entry) => entry.type === 'practice_review'
        && entry.data.practiceKey === insight.key
        && Date.parse(entry.scheduledAt) >= cutoff)) return undefined;
    }
    return {
      title: 'From your conversations',
      body: `You’ve mixed up ${insight.key} a few times. Quick review?`,
      data: { ...base, type, practiceKey: insight.key },
    };
  }
  return { title: 'Small steps count', body: 'You are building your Japanese a little at a time. Keep going.', data: { ...base, type: 'progress' } };
}

async function cancelAutomaticPlatformNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.map(async (notification) => {
    const data = parseNotificationData(notification.content.data);
    if (data?.source !== automaticSource) return;
    await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    await cancelNotificationLog(notification.identifier);
  }));
}

function dateTrigger(at: Date): NotificationTrigger {
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: at,
    channelId: learningChannelId,
  };
}

function dailyTrigger(hour: number, minute: number): NotificationTrigger {
  if (Platform.OS === 'ios') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      hour,
      minute,
      repeats: true,
    };
  }
  return {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour,
    minute,
    channelId: learningChannelId,
  };
}

function nextDailyOccurrence(hour: number, minute: number, now = new Date()): Date {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

async function scheduleContent(
  content: NotificationContent,
  trigger: NotificationTrigger,
  scheduledAt: Date,
): Promise<NotificationLogEntry> {
  let notificationId: string | undefined;
  try {
    notificationId = await Notifications.scheduleNotificationAsync({
      content: { title: content.title, body: content.body, sound: 'default', data: content.data as unknown as Record<string, unknown> },
      trigger,
    });
    return createNotificationLog({ notificationId, type: content.data.type, title: content.title, body: content.body, data: content.data, status: 'scheduled', scheduledAt: scheduledAt.toISOString() });
  } catch (error) {
    return createNotificationLog({
      notificationId,
      type: content.data.type,
      title: content.title,
      body: content.body,
      data: content.data,
      status: 'failed',
      scheduledAt: scheduledAt.toISOString(),
      errorMessage: error instanceof Error ? error.message : 'Notification could not be scheduled.',
    });
  }
}

async function scheduleDailyHomeworkReminder(preferences: NotificationPreferences): Promise<NotificationLogEntry | undefined> {
  if (!preferences.dailyHomework) return undefined;
  const { start } = preferences.activeHours;
  const content: NotificationContent = {
    title: 'Today’s Japanese plan is ready',
    body: 'Your fresh daily reading and focused homework are waiting in JapanGo.',
    data: { type: 'daily_homework', source: automaticSource },
  };
  const scheduledAt = nextDailyOccurrence(start, 0);
  return scheduleContent(content, dailyTrigger(start, 0), scheduledAt);
}

/** Rebuilds today’s local schedule from live homework, review, and practice evidence. */
export async function scheduleDailyJapanGoNotifications(): Promise<NotificationLogEntry[]> {
  if (Platform.OS === 'web') return [];
  const [preferences, permission] = await Promise.all([getNotificationPreferences(), getJapanGoNotificationPermission()]);
  if (!preferences.enabled || permission !== 'granted') return [];
  await configureNativeNotifications();
  await cancelAutomaticPlatformNotifications();
  const state = await getNotificationSchedulerState();
  const entries: NotificationLogEntry[] = [];
  const dailyReminder = await scheduleDailyHomeworkReminder(preferences);
  if (dailyReminder) entries.push(dailyReminder);
  const dailyReminderIsToday = dailyReminder?.status === 'scheduled'
    && localDateKey(new Date(dailyReminder.scheduledAt)) === localDateKey();
  const types = selectNotificationTypes(state, preferences.frequency)
    .filter((type) => typeEnabled(type, preferences) && (type !== 'daily_homework' || !dailyReminderIsToday));
  const times = buildNotificationTimes({
    now: new Date(),
    count: types.length,
    activeHours: preferences.activeHours,
    lastNotificationAt: state.lastNotificationAt,
    lastAppOpenAt: state.lastAppOpenAt,
  });
  for (const [index, at] of times.entries()) {
    const type = types[index];
    if (!type) continue;
    const content = await contentFor(type, automaticSource);
    if (content) entries.push(await scheduleContent(content, dateTrigger(at), at));
  }
  return entries;
}

export async function sendJapanGoNotificationTest(input: { type: NotificationType; delaySeconds?: number }): Promise<NotificationLogEntry | undefined> {
  const permission = await requestJapanGoNotificationPermission();
  if (permission !== 'granted') return undefined;
  await configureNativeNotifications();
  const content = await contentFor(input.type, testSource);
  if (!content) return undefined;
  const delay = Math.max(1, input.delaySeconds ?? 1);
  const scheduledAt = new Date(Date.now() + delay * 1_000);
  return scheduleContent(content, dateTrigger(scheduledAt), scheduledAt);
}

export async function clearScheduledJapanGoNotifications(): Promise<void> {
  await cancelAutomaticPlatformNotifications();
}

export async function clearScheduledPracticeNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.map(async (notification) => {
    const data = parseNotificationData(notification.content.data);
    if (data?.type !== 'practice_review') return;
    await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    await cancelNotificationLog(notification.identifier);
  }));
}

export async function getScheduledJapanGoNotifications(): Promise<NotificationLogEntry[]> {
  const logs = await getNotificationLogs({ status: 'scheduled', limit: 30 });
  return logs.filter((entry) => entry.data.source === automaticSource).slice(0, 20);
}

export async function getJapanGoNotificationDiagnostics(): Promise<NotificationDiagnostics> {
  const [permission, state, scheduled, logs, todayLog, activity, homework] = await Promise.all([
    getJapanGoNotificationPermission(),
    getNotificationSchedulerState(),
    getScheduledJapanGoNotifications(),
    getNotificationLogs({ limit: 20 }),
    getNotificationLogs({ date: localDateKey(), limit: 20 }),
    getLastNotificationAppActivity(),
    getHomeworkNotificationProgress(),
  ]);
  return {
    permission,
    sentToday: state.notificationsSentToday,
    dailyTarget: DEFAULT_DAILY_TARGET,
    nextScheduled: scheduled.sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt)),
    todayLog,
    lastNotification: logs.find((entry) => entry.status !== 'cancelled') ?? undefined,
    lastAppActivity: activity,
    homework,
    reviewsDue: state.reviewsDue,
  };
}

export function subscribeToJapanGoNotifications(input: { onOpen: (data: JapanGoNotificationData) => void }): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const received = Notifications.addNotificationReceivedListener((notification) => {
    void updateNotificationLog(notification.request.identifier, 'delivered');
  });
  const opened = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = parseNotificationData(response.notification.request.content.data);
    void updateNotificationLog(response.notification.request.identifier, 'opened');
    if (data) input.onOpen(data);
  });
  const initial = Notifications.getLastNotificationResponse();
  if (initial) {
    const data = parseNotificationData(initial.notification.request.content.data);
    void updateNotificationLog(initial.notification.request.identifier, 'opened');
    if (data) {
      input.onOpen(data);
      Notifications.clearLastNotificationResponse();
    }
  }
  return () => { received.remove(); opened.remove(); };
}

export async function recordJapanGoAppOpen(): Promise<void> {
  await recordNotificationAppActivity();
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}
