import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface CardProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  variant?: 'default' | 'quiet' | 'elevated' | 'accent';
}

export function Card({ children, style, accessibilityLabel, variant = 'default' }: CardProps) {
  const theme = useTheme();
  const backgroundColor = variant === 'quiet' ? theme.backgroundElement : variant === 'elevated' ? theme.surfaceElevated : theme.surface;
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.card,
        { backgroundColor, borderColor: variant === 'accent' ? theme.primary : theme.border },
        variant === 'accent' && styles.accent,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.large,
    borderWidth: 1,
    gap: Spacing.twoHalf,
    maxWidth: '100%',
    minWidth: 0,
    padding: Spacing.threeHalf,
    width: '100%',
  },
  accent: { borderLeftWidth: 5 },
});
