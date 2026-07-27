import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

interface SectionHeadingProps {
  title: string;
  detail?: string;
}

export function SectionHeading({ title, detail }: SectionHeadingProps) {
  return (
    <View style={styles.row}>
      <ThemedText type="heading" style={styles.title}>
        {title}
      </ThemedText>
      {detail ? (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  title: { flexShrink: 1 },
});
