import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

import { BackgroundContentIndicator } from '@/components/common/background-content-indicator';
import { useResolvedColorScheme, useTheme } from '@/hooks/use-theme';
import { getLearningContentInstallationState, subscribeToLearningContentInstallation, type LearningContentInstallationState } from '@/services/database/database';
import { useAppStore } from '@/store/app-store';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useResolvedColorScheme();
  const colors = useTheme();
  const bootstrap = useAppStore((state) => state.bootstrap);
  const [contentInstallation, setContentInstallation] = useState<LearningContentInstallationState>(getLearningContentInstallationState);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => subscribeToLearningContentInstallation(setContentInstallation), []);

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
        <Stack.Screen name="(tabs)" />
      </Stack>
      <BackgroundContentIndicator state={contentInstallation} />
    </ThemeProvider>
  );
}
