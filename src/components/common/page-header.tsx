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
        <ThemedText type="smallBold" themeColor="primary">{eyebrow.toUpperCase()}</ThemedText>
      ) : null}
      <ThemedText type="title">{title}</ThemedText>
      {subtitle ? <ThemedText themeColor="textSecondary">{subtitle}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.one, paddingBottom: Spacing.one },
});
