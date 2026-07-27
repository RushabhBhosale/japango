import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function LoadingState({ label = 'Preparing your learning space…' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <ActivityIndicator color={theme.primary} size="large" />
      <ThemedText themeColor="textSecondary" style={styles.label}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  label: { textAlign: 'center' },
});
