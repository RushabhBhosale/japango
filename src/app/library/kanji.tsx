import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { ContentMasteryBadge } from '@/components/common/content-mastery-badge';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getKanjiNotebookItems } from '@/services/database/content-learning-repository';
import type { KanjiNotebookFilter, KanjiNotebookItem } from '@/types/content-learning';

const filters: readonly { id: KanjiNotebookFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'N5', label: 'N5' },
  { id: 'N4', label: 'N4' },
  { id: 'studied', label: 'Studied' },
  { id: 'not-studied', label: 'Not studied' },
  { id: 'weak', label: 'Weak' },
  { id: 'mastered', label: 'Mastered' },
  { id: 'bookmarked', label: 'Bookmarked' },
  { id: 'due', label: 'Due' },
  { id: 'recently', label: 'Recent' },
];

function KanjiRow({ item }: { item: KanjiNotebookItem }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open kanji ${item.title}`} onPress={() => router.push(`/kanji/${encodeURIComponent(item.id)}` as Href)} style={({ pressed }) => pressed && styles.pressed}>
      <Card>
        <View style={styles.rowHeader}>
          <ThemedText type="smallBold" themeColor="primary">{item.level} kanji{item.strokeCount ? ` · ${item.strokeCount} strokes` : ''}</ThemedText>
          <ContentMasteryBadge assessment={item.contentMastery} />
        </View>
        <ThemedText type="japanese">{item.title}</ThemedText>
        <ThemedText type="smallBold">{item.meanings.join(' · ')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">On: {item.onReadings.join(' · ') || '—'} · Kun: {item.kunReadings.join(' · ') || '—'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{item.bookmarked ? 'Bookmarked' : 'Not bookmarked'}{item.dueForReview ? ' · Due for review' : ''}{item.quizScore === undefined ? '' : ` · Quiz score: ${item.quizScore}%`}</ThemedText>
      </Card>
    </Pressable>
  );
}

export default function KanjiNotebookScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState<KanjiNotebookFilter>('all');
  const [items, setItems] = useState<KanjiNotebookItem[]>();
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setItems(await getKanjiNotebookItems(filter));
    } catch {
      setFailed(true);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!items && !failed) return <ScreenContainer scroll={false}><LoadingState label="Opening kanji notebook…" /></ScreenContainer>;
  return (
    <ScreenContainer>
      <PageHeader eyebrow="N5 and N4 characters" title="Kanji Notebook" subtitle="Browse every available kanji, then use recall-based flashcards or a focused quiz." />
      <View accessibilityRole="tablist" style={styles.filters}>
        {filters.map((option) => (
          <Pressable key={option.id} accessibilityRole="tab" accessibilityState={{ selected: filter === option.id }} onPress={() => setFilter(option.id)} style={({ pressed }) => [styles.filter, { borderColor: filter === option.id ? theme.primary : theme.border, backgroundColor: filter === option.id ? theme.primarySoft : theme.surface }, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={{ color: filter === option.id ? theme.primary : theme.text }}>{option.label}</ThemedText>
          </Pressable>
        ))}
      </View>
      <AppButton label="Open kanji flashcards" onPress={() => router.push(`/library/flashcards?set=${encodeURIComponent(filter === 'N5' || filter === 'N4' || filter === 'weak' || filter === 'due' || filter === 'bookmarked' ? filter : 'all')}` as Href)} />
      {failed ? <EmptyState title="Kanji could not be loaded" message="Your downloaded curriculum is still on this device. Try another filter or reopen the notebook." symbol="!" /> : null}
      {items?.length ? items.map((item) => <KanjiRow key={item.id} item={item} />) : !failed ? <EmptyState title="No kanji matches this filter" message="Choose another level or progress filter." /> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  filter: { minHeight: 44, borderWidth: 1, borderRadius: 999, justifyContent: 'center', paddingHorizontal: 12 },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  pressed: { opacity: 0.76 },
});
