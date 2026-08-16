import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

import { BackgroundContentIndicator } from '@/components/common/background-content-indicator';
import { useResolvedColorScheme, useTheme } from '@/hooks/use-theme';
import { saveIncomingYuiMessage } from '@/services/database/ai-chat-repository';
import { getLearningContentInstallationState, subscribeToLearningContentInstallation, type LearningContentInstallationState } from '@/services/database/database';
import { getNotificationPreferences } from '@/services/database/notification-repository';
import { subscribeToDailyRollover } from '@/services/daily-rollover';
import { registerYuiPushNotifications, subscribeToYuiPushNotifications } from '@/services/notifications/ai-chat-notifications';
import { recordJapanGoAppOpen, scheduleDailyJapanGoNotifications, subscribeToJapanGoNotifications } from '@/services/notifications/notification-engine';
import { useAppStore } from '@/store/app-store';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const colorScheme = useResolvedColorScheme();
  const colors = useTheme();
  const bootstrap = useAppStore((state) => state.bootstrap);
  const initializationStatus = useAppStore((state) => state.initializationStatus);
  const profileId = useAppStore((state) => state.profile?.id);
  const [contentInstallation, setContentInstallation] = useState<LearningContentInstallationState>(getLearningContentInstallationState);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => subscribeToLearningContentInstallation(setContentInstallation), []);

  useEffect(() => {
    if (initializationStatus !== 'ready') return;
    const refreshDailySchedule = () => {
      void recordJapanGoAppOpen().then(() => scheduleDailyJapanGoNotifications()).catch(() => undefined);
    };
    refreshDailySchedule();
    return subscribeToDailyRollover(refreshDailySchedule);
  }, [initializationStatus]);

  useEffect(() => {
    if (initializationStatus !== 'ready') return;
    return subscribeToJapanGoNotifications({
      onOpen: (data) => {
        if (data.type === 'ai_chat' || data.type === 'scenario_continuation' || data.type === 'mistake_review') {
          router.push('/(tabs)/chats' as Href);
          return;
        }
        router.push(`/homework${data.itemId ? `?itemId=${encodeURIComponent(data.itemId)}` : ''}` as Href);
      },
    });
  }, [initializationStatus, router]);

  useEffect(() => {
    if (initializationStatus !== 'ready' || !profileId) return;
    void getNotificationPreferences()
      .then((preferences) => {
        if (preferences.enabled && preferences.aiChat) void registerYuiPushNotifications(profileId).catch(() => undefined);
      })
      .catch(() => undefined);
    return subscribeToYuiPushNotifications({
      onMessage: saveIncomingYuiMessage,
      onOpen: () => router.push('/(tabs)/chats' as Href),
    });
  }, [initializationStatus, profileId, router]);

  useEffect(() => {
    // Native splash screens are intentionally short-lived. Long-running local
    // content upgrades use the app's own loading and error UI instead of
    // leaving a learner with an indistinguishable frozen launch screen.
    void SplashScreen.hideAsync();
  }, []);

  const baseTheme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="episode/[episodeId]" />
        <Stack.Screen name="exam/[examId]" />
        <Stack.Screen name="unit-test/[unitTestId]" />
        <Stack.Screen name="daily-reading/[readingId]" />
        <Stack.Screen name="ai/chat-review" />
        <Stack.Screen name="homework" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <BackgroundContentIndicator state={contentInstallation} />
    </ThemeProvider>
  );
}
