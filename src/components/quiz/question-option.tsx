import { Pressable, StyleSheet, View } from 'react-native';

import { JapaneseText } from '@/components/lesson/japanese-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { JapaneseTextItem } from '@/services/database/japanese-text-repository';

interface QuestionOptionProps {
  label: string;
  selected: boolean;
  disabled?: boolean;
  correctness?: 'correct' | 'incorrect';
  furiganaOverride?: boolean;
  contextualReading?: string;
  additionalItems?: JapaneseTextItem[];
  onItemPress?: (item: JapaneseTextItem) => void;
  onPress: () => void;
}

export function QuestionOption({
  label,
  selected,
  disabled = false,
  correctness,
  furiganaOverride,
  contextualReading,
  additionalItems,
  onItemPress,
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
      <View style={styles.label}>
        <JapaneseText
          style={styles.optionLabel}
          furiganaOverride={furiganaOverride}
          contextualReading={contextualReading}
          additionalItems={additionalItems}
          onItemPress={onItemPress}
        >{label}</JapaneseText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: { alignItems: 'center', borderRadius: Radius.medium, borderWidth: 1.5, flexDirection: 'row', gap: Spacing.three, maxWidth: '100%', minHeight: 56, minWidth: 0, padding: 14, width: '100%' },
  indicator: { borderRadius: 10, borderWidth: 2, flexShrink: 0, height: 20, width: 20 },
  label: { flex: 1, minWidth: 0 },
  optionLabel: { flexShrink: 1, fontWeight: '600' },
});
