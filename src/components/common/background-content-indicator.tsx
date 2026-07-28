import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LearningContentInstallationState } from '@/services/database/database';

import { ThemedText } from '../themed-text';

interface BackgroundContentIndicatorProps {
  state: LearningContentInstallationState;
}

function labelFor(state: LearningContentInstallationState): string | undefined {
  switch (state.status) {
    case 'scheduled':
      return 'Preparing offline lessons… You can keep using the app.';
    case 'installing_curriculum':
      return 'Adding offline lessons… You can keep studying.';
    case 'preparing_reviews':
      return 'Preparing your review schedule… You can keep studying.';
    case 'preparing_course':
      return 'Preparing your course… You can keep using the app.';
    case 'error':
      return state.errorMessage ?? 'Offline lessons will finish preparing after the next restart.';
    case 'idle':
    case 'ready':
      return undefined;
  }
}

/** A visible status, intentionally non-interactive so it can never block taps. */
export function BackgroundContentIndicator({ state }: BackgroundContentIndicatorProps) {
  const theme = useTheme();
  const label = labelFor(state);
  if (!label) return null;
  const failed = state.status === 'error';
  return (
    <View pointerEvents="none" style={styles.positioner} accessibilityLiveRegion="polite">
      <View style={[styles.indicator, { backgroundColor: failed ? theme.backgroundSelected : theme.surface, borderColor: failed ? theme.error : theme.border }]}>
        {!failed ? <ActivityIndicator color={theme.primary} size="small" /> : null}
        <ThemedText type="small" style={styles.label} themeColor={failed ? 'text' : 'textSecondary'}>{label}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: { bottom: Spacing.three, left: Spacing.three, position: 'absolute', right: Spacing.three, zIndex: 20 },
  indicator: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: 1, flexDirection: 'row', gap: Spacing.two, justifyContent: 'center', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  label: { flexShrink: 1, textAlign: 'center' },
});
