import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { getLearningContentInstallationState, prepareAllLearningContent, subscribeToLearningContentInstallation, type LearningContentInstallationState } from '@/services/database/database';
import { useAppStore } from '@/store/app-store';

function preparationLabel(state: LearningContentInstallationState): string {
  if (state.status === 'installing_curriculum') return 'Adding all lessons and practice to this device…';
  if (state.status === 'preparing_reviews') return 'Creating your personal review schedule…';
  if (state.status === 'preparing_course') return 'Preparing the complete course map…';
  return 'Getting JapanGo ready for offline study…';
}

export default function EntryScreen() {
  const status = useAppStore((state) => state.initializationStatus);
  const profile = useAppStore((state) => state.profile);
  const errorMessage = useAppStore((state) => state.errorMessage);
  const bootstrap = useAppStore((state) => state.bootstrap);
  const [contentInstallation, setContentInstallation] = useState<LearningContentInstallationState>(getLearningContentInstallationState);
  const [preparing, setPreparing] = useState(false);

  useEffect(() => subscribeToLearningContentInstallation(setContentInstallation), []);

  const prepareAll = async () => {
    setPreparing(true);
    try {
      await prepareAllLearningContent();
    } catch {
      // The installation service exposes a clear retry state to this screen.
    } finally {
      setPreparing(false);
    }
  };

  if (status === 'idle' || status === 'loading') {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState />
      </ScreenContainer>
    );
  }

  if (status === 'error' || !profile) {
    return (
      <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'center' }}>
        <EmptyState
          title="We couldn't open JapanGo"
          message={errorMessage ?? 'Your learning data is still on this device.'}
          symbol="!"
        />
        <AppButton label="Try again" onPress={() => void bootstrap()} />
      </ScreenContainer>
    );
  }

  if (!profile.onboardingCompleted) return <Redirect href="/onboarding" />;
  if (!profile.assessmentCompleted) return <Redirect href="/assessment" />;
  if (contentInstallation.status !== 'ready') {
    const isWorking = preparing || ['scheduled', 'installing_curriculum', 'preparing_reviews', 'preparing_course'].includes(contentInstallation.status);
    if (isWorking) return <ScreenContainer scroll={false}><LoadingState label={preparationLabel(contentInstallation)} /></ScreenContainer>;
    return (
      <ScreenContainer scroll={false} contentStyle={{ justifyContent: 'center' }}>
        <Card accessibilityLabel="Prepare all JapanGo lessons for offline study">
          <ThemedText type="title">Prepare JapanGo once</ThemedText>
          <ThemedText themeColor="textSecondary">Install all lessons, quizzes, notebooks, and review cards to this device now. After this one-time step, lesson screens will not pause to prepare course data.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Everything is included with the app; no extra download or account is required.</ThemedText>
          {contentInstallation.status === 'error' ? <ThemedText type="small" themeColor="error">Preparation did not finish. Your existing progress is safe; try again.</ThemedText> : null}
          <AppButton label="Prepare all lessons" loading={preparing} onPress={() => void prepareAll()} />
        </Card>
      </ScreenContainer>
    );
  }
  return <Redirect href="/(tabs)" />;
}
