import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from '../themed-text';

export function TypingIndicator() {
  const theme = useTheme();
  return (
    <View accessibilityLiveRegion="polite" accessibilityLabel="Yui is typing" style={styles.row}>
      <View style={[styles.bubble, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ActivityIndicator color={theme.primary} size="small" />
        <ThemedText type="small" themeColor="textSecondary">ゆい is typing…</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'flex-start', paddingHorizontal: Spacing.three, paddingTop: Spacing.two, width: '100%' },
  bubble: { alignItems: 'center', borderBottomLeftRadius: Radius.small, borderRadius: Radius.medium, borderWidth: 1, flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.twoHalf, paddingVertical: Spacing.two },
});
