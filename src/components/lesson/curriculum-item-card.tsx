import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/common/card';
import { StatusBadge } from '@/components/common/status-badge';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { CurriculumWithMastery } from '@/types/learning';

function formatType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function CurriculumItemCard({ item }: { item: CurriculumWithMastery }) {
  return (
    <Card accessibilityLabel={`${item.title}, ${formatType(item.type)}, ${item.mastery.status}`}>
      <View style={styles.topRow}>
        <ThemedText type="smallBold" themeColor="primary">{formatType(item.type)} · {item.level}</ThemedText>
        <StatusBadge status={item.mastery.status} />
      </View>
      <ThemedText type="japanese">{item.title}</ThemedText>
      {item.reading && item.reading !== item.title ? (
        <ThemedText themeColor="textSecondary">{item.reading}</ThemedText>
      ) : null}
      {item.meaning ? <ThemedText type="smallBold">{item.meaning}</ThemedText> : null}
      {item.explanation ? <ThemedText themeColor="textSecondary">{item.explanation}</ThemedText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
});
