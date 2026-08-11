import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from '../themed-text';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel,
  style,
}: AppButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const backgroundColor = disabled
    ? theme.backgroundElement
    : isPrimary
      ? theme.primary
      : isDanger
        ? theme.errorSoft
      : variant === 'secondary'
        ? theme.primarySoft
        : 'transparent';
  const textColor = disabled ? theme.textSecondary : isPrimary ? theme.onPrimary : isDanger ? theme.error : theme.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, borderColor: disabled ? theme.border : isPrimary ? theme.primary : isDanger ? theme.error : theme.border },
        variant === 'quiet' && styles.quiet,
        pressed && !disabled && { backgroundColor: isPrimary ? theme.primaryPressed : isDanger ? theme.errorSoft : theme.backgroundSelected },
        (disabled || loading) && styles.disabled,
        style,
      ]}>
      <View style={styles.content}>
        {loading && <ActivityIndicator color={textColor} size="small" />}
        <ThemedText type="button" style={[styles.label, { color: textColor }]}>{label}</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: 'stretch',
    minHeight: 48,
    minWidth: 0,
    borderRadius: Radius.medium,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
  },
  quiet: { borderColor: 'transparent' },
  content: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'center', minWidth: 0, maxWidth: '100%' },
  label: { textAlign: 'center' },
  disabled: { opacity: 0.72 },
});
