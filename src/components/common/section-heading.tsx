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
      <ThemedText type="section" style={styles.title}>
        {title}
      </ThemedText>
      {detail ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.detail}>
          {detail}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'space-between', minWidth: 0 },
  title: { flexGrow: 1, flexShrink: 1, minWidth: 160 },
  detail: { flexShrink: 1, textAlign: 'right' },
});
