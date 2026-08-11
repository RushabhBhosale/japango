import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}

export function PageHeader({ eyebrow, title, subtitle }: PageHeaderProps) {
  return (
    <View style={styles.container}>
      {eyebrow ? (
        <ThemedText type="metadata" themeColor="primary">{eyebrow}</ThemedText>
      ) : null}
      <ThemedText type="display">{title}</ThemedText>
      {subtitle ? <ThemedText themeColor="textSecondary">{subtitle}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two, maxWidth: 640, minWidth: 0, paddingBottom: Spacing.one },
});
