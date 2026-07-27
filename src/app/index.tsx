import { Redirect } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { ScreenContainer } from '@/components/common/screen-container';
import { useAppStore } from '@/store/app-store';

export default function EntryScreen() {
  const status = useAppStore((state) => state.initializationStatus);
  const profile = useAppStore((state) => state.profile);
  const errorMessage = useAppStore((state) => state.errorMessage);
  const bootstrap = useAppStore((state) => state.bootstrap);

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
  return <Redirect href="/(tabs)" />;
}
