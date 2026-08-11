import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MasteryStatus } from '@/types/learning';

const labels: Record<MasteryStatus, string> = {
  new: 'New',
  learning: 'Learning',
  weak: 'Needs focus',
  review: 'Due',
  mastered: 'Mastered',
};

export function StatusBadge({ status }: { status: MasteryStatus }) {
  const theme = useTheme();
  const isWarning = status === 'weak' || status === 'review';
  const backgroundColor = status === 'mastered' ? theme.successSoft : isWarning ? theme.warningSoft : theme.primarySoft;
  const color = status === 'mastered' ? theme.success : isWarning ? theme.warning : theme.primary;
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <ThemedText type="smallBold" style={{ color }}>{labels[status]}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: Radius.pill, flexShrink: 0, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 4 },
});
