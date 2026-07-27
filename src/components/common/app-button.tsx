import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from '../themed-text';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel,
}: AppButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';
  const backgroundColor = isPrimary
    ? theme.primary
    : variant === 'secondary'
      ? theme.primarySoft
      : 'transparent';
  const textColor = isPrimary ? theme.onPrimary : theme.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, borderColor: isPrimary ? theme.primary : theme.border },
        variant === 'quiet' && styles.quiet,
        pressed && !disabled && { backgroundColor: isPrimary ? theme.primaryPressed : theme.backgroundSelected },
        (disabled || loading) && styles.disabled,
      ]}>
      <View style={styles.content}>
        {loading && <ActivityIndicator color={textColor} size="small" />}
        <ThemedText style={[styles.label, { color: textColor }]}>{label}</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: Radius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
  },
  quiet: { borderColor: 'transparent' },
  content: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  label: { fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.48 },
});
