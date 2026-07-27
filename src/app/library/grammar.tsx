import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';

import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/common/card';
import { ContentMasteryBadge } from '@/components/common/content-mastery-badge';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getStudyLibraryItems } from '@/services/database/study-library-repository';
import type { StudyLibraryFilter, StudyLibraryItem } from '@/types/study-library';

const filters: readonly { id: StudyLibraryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'N5', label: 'N5' },
  { id: 'N4', label: 'N4' },
  { id: 'studied', label: 'Studied' },
  { id: 'not-studied', label: 'Not studied' },
  { id: 'weak', label: 'Weak' },
  { id: 'mastered', label: 'Mastered' },
  { id: 'bookmarked', label: 'Bookmarked' },
  { id: 'recently', label: 'Recent' },
];

function GrammarRow({ item }: { item: StudyLibraryItem }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open grammar ${item.title}`}
      onPress={() => router.push(`/grammar/${encodeURIComponent(item.id)}` as Href)}
      style={({ pressed }) => pressed && styles.pressed}>
      <Card>
        <View style={styles.rowHeader}>
          <ThemedText type="smallBold" themeColor="primary">{item.level} grammar</ThemedText>
          <ContentMasteryBadge assessment={item.contentMastery} />
        </View>
        <ThemedText type="japanese">{item.title}</ThemedText>
        {item.meaning ? <ThemedText type="smallBold">{item.meaning}</ThemedText> : null}
        <ThemedText type="small" themeColor="textSecondary">
          {item.bookmarked ? 'Bookmarked' : 'Not bookmarked'}{item.quizScore === undefined ? '' : ` · Quiz score: ${item.quizScore}%`}
        </ThemedText>
      </Card>
    </Pressable>
  );
}

export default function GrammarNotebookScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState<StudyLibraryFilter>('all');
  const [items, setItems] = useState<StudyLibraryItem[]>();
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setItems(await getStudyLibraryItems('grammar', filter));
    } catch {
      setFailed(true);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!items && !failed) return <ScreenContainer scroll={false}><LoadingState label="Opening grammar notebook…" /></ScreenContainer>;
  return (
    <ScreenContainer>
      <PageHeader eyebrow="Canonical N5 and N4 curriculum" title="Grammar Notebook" subtitle="Browse every available pattern, then practise a single topic when you are ready." />
      <View accessibilityRole="tablist" style={styles.filters}>
        {filters.map((option) => (
          <Pressable
            key={option.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === option.id }}
            onPress={() => setFilter(option.id)}
            style={({ pressed }) => [
              styles.filter,
              { borderColor: filter === option.id ? theme.primary : theme.border, backgroundColor: filter === option.id ? theme.primarySoft : theme.surface },
              pressed && { opacity: 0.76 },
            ]}>
            <ThemedText type="smallBold" style={{ color: filter === option.id ? theme.primary : theme.text }}>{option.label}</ThemedText>
          </Pressable>
        ))}
      </View>
      {failed ? <EmptyState title="Grammar could not be loaded" message="Your downloaded curriculum is still on this device. Try again to reload the notebook." symbol="!" /> : null}
      {items?.length ? items.map((item) => <GrammarRow key={item.id} item={item} />) : !failed ? <EmptyState title="No grammar matches this filter" message="Choose another level or progress filter." /> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  filter: { minHeight: 44, borderWidth: 1, borderRadius: 999, justifyContent: 'center', paddingHorizontal: 12 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  pressed: { opacity: 0.76 },
});
