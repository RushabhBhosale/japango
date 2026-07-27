import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface EmptyStateProps {
  title: string;
  message: string;
  symbol?: string;
}

export function EmptyState({ title, message, symbol = '休' }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
      <ThemedText style={[styles.symbol, { color: theme.primary }]}>{symbol}</ThemedText>
      <ThemedText type="heading" style={styles.center}>{title}</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.center}>{message}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: Radius.large, padding: Spacing.four, gap: Spacing.two, alignItems: 'center' },
  symbol: { fontSize: 32, fontWeight: '700' },
  center: { textAlign: 'center' },
});
