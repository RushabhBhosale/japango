import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { DEFAULT_DAILY_TARGET, buildNotificationTimes, selectNotificationTypes } from '@/features/notifications/scheduler';
import { getActiveYuiScenario, getRecentChatMistakes, getYuiChatContext, saveIncomingYuiMessage } from '@/services/database/ai-chat-repository';
import { getOrCreateDailyHomework, localDateKey } from '@/services/database/daily-homework-repository';
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
import { getLearnerProfile } from '@/services/database/profile-repository';
import type {
  JapanGoNotificationData,
  NotificationDiagnostics,
  NotificationLogEntry,
  NotificationPermissionStatus,
  NotificationPreferences,
  NotificationType,
} from '@/types/notifications';
import { AI_CHAT_CONVERSATION_ID } from '@/types/ai-chat';
import { createLocalId } from '@/utils/id';

const automaticSource = 'japango-auto';
const testSource = 'japango-test';

interface NotificationContent {
  title: string;
  body: string;
  data: JapanGoNotificationData;
}

function apiUrl(path: string): string | undefined {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/u, '');
  return base ? `${base}${path}` : undefined;
}

function parseNotificationData(value: unknown): JapanGoNotificationData | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const supportedTypes = new Set<NotificationType>([
    'daily_homework', 'due_review', 'micro_vocabulary', 'micro_kanji', 'grammar_tip',
    'mistake_review', 'ai_chat', 'scenario_continuation', 'progress',
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
    chatId: optionalString('chatId'),
    messageId: optionalString('messageId'),
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
  await Notifications.setNotificationChannelAsync('learning', {
    name: 'Japanese learning',
    importance: Notifications.AndroidImportance.DEFAULT,
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
  const needsPermission = next.enabled && (next.aiChat || next.dailyHomework || next.reviews || next.learningTips);
  const permission = needsPermission ? await requestJapanGoNotificationPermission() : await getJapanGoNotificationPermission();
  const preferences = needsPermission && permission !== 'granted'
    ? { ...next, enabled: false }
    : next;
  await setNotificationPreferences(preferences);
  if (preferences.enabled && permission === 'granted') void scheduleDailyJapanGoNotifications();
  return { preferences, permission };
}

function typeEnabled(type: NotificationType, preferences: NotificationPreferences): boolean {
  if (!preferences.enabled) return false;
  if (type === 'ai_chat' || type === 'scenario_continuation') return preferences.aiChat;
  if (type === 'daily_homework') return preferences.dailyHomework;
  if (type === 'due_review') return preferences.reviews;
  return preferences.learningTips;
}

async function buildYuiMessage(type: Extract<NotificationType, 'ai_chat' | 'scenario_continuation'>): Promise<{ id: string; content: string; createdAt: string }> {
  const [context, scenario, profile] = await Promise.all([getYuiChatContext(), getActiveYuiScenario(), getLearnerProfile()]);
  const fallback = type === 'scenario_continuation'
    ? 'そういえば、昨日の話の続き、どうなった？'
    : '今何してる？少し話せたらうれしいな。';
  const url = apiUrl('/api/ai-chat/proactive-message');
  let content = fallback;
  if (url) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          learnerLevel: profile.learnerLevel === 'Ready to begin N4 gradually' ? 'N4' : 'N5',
          conversation: { summary: context.summary, recentMessages: context.recentMessages.map(({ role, content: message }) => ({ role, content: message })) },
          learningTargets: context.learningTargets,
          scenario: scenario ? { title: scenario.title, setting: scenario.setting, goal: scenario.goal } : undefined,
        }),
      });
      const body = await response.json() as { success?: boolean; data?: { message?: unknown } };
      if (response.ok && body.success && typeof body.data?.message === 'string' && body.data.message.trim()) {
        content = body.data.message.trim().slice(0, 280);
      }
    } catch {
      // A private backend is optional. The persisted local fallback keeps the
      // exact notification text and conversation in sync when it is offline.
    }
  }
  const message = { id: createLocalId('chat-proactive'), content, createdAt: new Date().toISOString() };
  await saveIncomingYuiMessage(message);
  return message;
}

async function contentFor(type: NotificationType, source: JapanGoNotificationData['source']): Promise<NotificationContent | undefined> {
  const date = localDateKey();
  const homework = await getOrCreateDailyHomework(date);
  const base = { source, date } as const;
  if (type === 'ai_chat' || type === 'scenario_continuation') {
    const message = source === testSource && type === 'ai_chat'
      ? { id: createLocalId('chat-proactive-test'), content: '今何してる？', createdAt: new Date().toISOString() }
      : await buildYuiMessage(type);
    if (source === testSource && type === 'ai_chat') await saveIncomingYuiMessage(message);
    return { title: 'ゆい', body: message.content, data: { ...base, type, chatId: AI_CHAT_CONVERSATION_ID, messageId: message.id } };
  }
  if (type === 'daily_homework') {
    const vocabulary = homework.items.filter((item) => item.type === 'vocabulary').length;
    const kanji = homework.items.filter((item) => item.type === 'kanji').length;
    return { title: '今日の宿題ができました。', body: `${vocabulary}単語 + ${kanji}漢字を勉強しよう。`, data: { ...base, type } };
  }
  if (type === 'due_review') {
    const item = homework.items.find((entry) => entry.source === 'due-review') ?? homework.items[0];
    if (!item) return undefined;
    return { title: '復習の時間', body: `${item.title}${item.reading ? `（${item.reading}）` : ''}をもう一度見よう。`, data: { ...base, type, itemId: item.itemId, itemType: item.type } };
  }
  if (type === 'micro_vocabulary' || type === 'micro_kanji' || type === 'grammar_tip') {
    const targetType = type === 'micro_vocabulary' ? 'vocabulary' : type === 'micro_kanji' ? 'kanji' : 'grammar';
    const item = homework.items.find((entry) => entry.type === targetType);
    if (!item) return undefined;
    if (type === 'micro_vocabulary') return { title: '覚えてる？', body: `${item.title}${item.reading ? `（${item.reading}）` : ''}\nWhat does it mean?`, data: { ...base, type, itemId: item.itemId, itemType: item.type } };
    if (type === 'micro_kanji') return { title: '今日の漢字', body: `${item.title}${item.reading ? `（${item.reading}）` : ''}で使います。`, data: { ...base, type, itemId: item.itemId, itemType: item.type } };
    return { title: '会話で見かけた文法', body: `${item.title}\n今日は一文の中で探してみよう。`, data: { ...base, type, itemId: item.itemId, itemType: item.type } };
  }
  if (type === 'mistake_review') {
    const [mistake] = await getRecentChatMistakes(1);
    if (!mistake) return undefined;
    return { title: '昨日の会話から', body: `${mistake.original} → ${mistake.corrected}`, data: { ...base, type, chatId: AI_CHAT_CONVERSATION_ID } };
  }
  return { title: '今日の日本語', body: '少しずつ、昨日より自然な日本語に近づいてるよ。', data: { ...base, type: 'progress' } };
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

async function scheduleContent(content: NotificationContent, at: Date): Promise<NotificationLogEntry> {
  let notificationId: string | undefined;
  try {
    notificationId = await Notifications.scheduleNotificationAsync({
      content: { title: content.title, body: content.body, sound: 'default', data: content.data as unknown as Record<string, unknown> },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
    return createNotificationLog({ notificationId, type: content.data.type, title: content.title, body: content.body, data: content.data, status: 'scheduled', scheduledAt: at.toISOString() });
  } catch (error) {
    return createNotificationLog({
      notificationId,
      type: content.data.type,
      title: content.title,
      body: content.body,
      data: content.data,
      status: 'failed',
      scheduledAt: at.toISOString(),
      errorMessage: error instanceof Error ? error.message : 'Notification could not be scheduled.',
    });
  }
}

/** Rebuilds today’s local schedule from live homework, review, and chat state. */
export async function scheduleDailyJapanGoNotifications(): Promise<NotificationLogEntry[]> {
  if (Platform.OS === 'web') return [];
  const [preferences, permission] = await Promise.all([getNotificationPreferences(), getJapanGoNotificationPermission()]);
  if (!preferences.enabled || permission !== 'granted') return [];
  await configureNativeNotifications();
  await cancelAutomaticPlatformNotifications();
  const state = await getNotificationSchedulerState();
  const types = selectNotificationTypes(state, preferences.frequency).filter((type) => typeEnabled(type, preferences));
  const times = buildNotificationTimes({
    now: new Date(),
    count: types.length,
    activeHours: preferences.activeHours,
    lastNotificationAt: state.lastNotificationAt,
    lastAppOpenAt: state.lastAppOpenAt,
  });
  const entries: NotificationLogEntry[] = [];
  for (const [index, at] of times.entries()) {
    const type = types[index];
    if (!type) continue;
    const content = await contentFor(type, automaticSource);
    if (content) entries.push(await scheduleContent(content, at));
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
  return scheduleContent(content, new Date(Date.now() + delay * 1_000));
}

export async function clearScheduledJapanGoNotifications(): Promise<void> {
  await cancelAutomaticPlatformNotifications();
}

export async function getScheduledJapanGoNotifications(): Promise<NotificationLogEntry[]> {
  return getNotificationLogs({ date: localDateKey(), status: 'scheduled', limit: 20 });
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
    if (data) input.onOpen(data);
    Notifications.clearLastNotificationResponse();
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
