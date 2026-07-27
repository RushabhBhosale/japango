import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface QuestionOptionProps {
  label: string;
  selected: boolean;
  disabled?: boolean;
  correctness?: 'correct' | 'incorrect';
  onPress: () => void;
}

export function QuestionOption({
  label,
  selected,
  disabled = false,
  correctness,
  onPress,
}: QuestionOptionProps) {
  const theme = useTheme();
  const feedbackBackground = correctness === 'correct' ? theme.successSoft : theme.errorSoft;
  const feedbackBorder = correctness === 'correct' ? theme.success : theme.error;
  const borderColor = correctness ? feedbackBorder : selected ? theme.primary : theme.border;
  const backgroundColor = correctness ? feedbackBackground : selected ? theme.primarySoft : theme.surface;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        { borderColor, backgroundColor },
        pressed && !disabled && { backgroundColor: theme.backgroundSelected },
      ]}>
      <View style={[styles.indicator, { borderColor }, selected && { backgroundColor: borderColor }]} />
      <ThemedText style={styles.label}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: { minHeight: 52, borderWidth: 1.5, borderRadius: Radius.medium, padding: 14, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  indicator: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  label: { flex: 1, fontWeight: '600' },
});
