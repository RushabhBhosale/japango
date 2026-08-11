import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/common/card';
import { StatusBadge } from '@/components/common/status-badge';
import { InteractiveJapaneseText } from '@/components/lesson/japanese-text';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { CurriculumWithMastery } from '@/types/learning';

function formatType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

interface CurriculumItemCardProps {
  item: CurriculumWithMastery;
  onPress?: () => void;
}

export function CurriculumItemCard({ item, onPress }: CurriculumItemCardProps) {
  const content = (
    <Card accessibilityLabel={`${item.title}, ${formatType(item.type)}, ${item.mastery.status}`}>
      <View style={styles.topRow}>
        <ThemedText type="smallBold" themeColor="primary">{formatType(item.type)} · {item.level}</ThemedText>
        <StatusBadge status={item.mastery.status} />
      </View>
      <InteractiveJapaneseText type="japanese">{item.title}</InteractiveJapaneseText>
      {item.reading && item.reading !== item.title ? (
        <InteractiveJapaneseText themeColor="textSecondary">{item.reading}</InteractiveJapaneseText>
      ) : null}
      {item.meaning ? <ThemedText type="smallBold">{item.meaning}</ThemedText> : null}
      {item.explanation ? <ThemedText themeColor="textSecondary">{item.explanation}</ThemedText> : null}
    </Card>
  );
  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}, ${formatType(item.type)}`}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'space-between', minWidth: 0 },
  pressed: { opacity: 0.76 },
});
