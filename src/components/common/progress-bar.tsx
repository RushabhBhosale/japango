import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ProgressBarProps {
  value: number;
  accessibilityLabel?: string;
}

export function ProgressBar({ value, accessibilityLabel = 'Progress' }: ProgressBarProps) {
  const theme = useTheme();
  const safeValue = Math.min(100, Math.max(0, value));
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(safeValue) }}
      style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
      <View style={[styles.fill, { width: `${safeValue}%`, backgroundColor: theme.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 9, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
});
