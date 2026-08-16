import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export interface YuiPushMessage {
  id: string;
  content: string;
  createdAt: string;
}

interface NotificationPayload {
  chatId?: unknown;
  messageId?: unknown;
  message?: unknown;
  createdAt?: unknown;
}

function apiUrl(path: string): string | undefined {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/u, '');
  return base ? `${base}${path}` : undefined;
}

function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function projectId(): string | undefined {
  const fromEas = Constants.easConfig?.projectId;
  if (fromEas) return fromEas;
  const fromEnvironment = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  if (fromEnvironment) return fromEnvironment;
  const extra = Constants.expoConfig?.extra;
  const eas = extra && typeof extra === 'object' ? (extra as { eas?: { projectId?: unknown } }).eas : undefined;
  return typeof eas?.projectId === 'string' && eas.projectId.trim() ? eas.projectId : undefined;
}

function parseYuiPushMessage(payload: unknown): YuiPushMessage | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const value = payload as NotificationPayload;
  if (value.chatId !== 'yui-main' || typeof value.messageId !== 'string' || typeof value.message !== 'string' || typeof value.createdAt !== 'string') {
    return undefined;
  }
  const content = value.message.trim();
  if (!content || content.length > 900 || !Number.isFinite(Date.parse(value.createdAt))) return undefined;
  return { id: value.messageId, content, createdAt: value.createdAt };
}

async function post(path: string, body: unknown): Promise<void> {
  const url = apiUrl(path);
  if (!url) return;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json() as { success?: boolean };
  if (!response.ok || !result.success) throw new Error('AI chat notification service request failed.');
}

export async function registerYuiPushNotifications(localUserId: string): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice || !apiUrl('/api/ai-chat/devices/register')) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('daily-learning', {
      name: 'Japanese learning',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180],
      lightColor: '#505777',
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (!current.granted) return;

  const id = projectId();
  if (!id) return;
  const token = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await post('/api/ai-chat/devices/register', {
    localUserId,
    expoPushToken: token.data,
    timeZone: currentTimeZone(),
  });
}

export function subscribeToYuiPushNotifications(input: {
  onMessage: (message: YuiPushMessage) => Promise<void>;
  onOpen: () => void;
}): () => void {
  if (Platform.OS === 'web') return () => undefined;

  const receive = (payload: unknown) => {
    const message = parseYuiPushMessage(payload);
    if (message) void input.onMessage(message);
  };
  const open = (payload: unknown) => {
    const message = parseYuiPushMessage(payload);
    if (!message) return;
    void input.onMessage(message).finally(input.onOpen);
  };
  const receivedSubscription = Notifications.addNotificationReceivedListener((notification) => receive(notification.request.content.data));
  const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => open(response.notification.request.content.data));
  const initialResponse = Notifications.getLastNotificationResponse();
  if (initialResponse) {
    open(initialResponse.notification.request.content.data);
    Notifications.clearLastNotificationResponse();
  }

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}
