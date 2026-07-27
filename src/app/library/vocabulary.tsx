import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import {
  getVocabularyNotebookItems,
  getVocabularyNotebookView,
  getVocabularyPartOfSpeechOptions,
  setVocabularyNotebookView,
  startVocabularyTopicQuiz,
} from '@/services/database/vocabulary-repository';
import type {
  VocabularyNotebookItem,
  VocabularyNotebookProgressFilter,
  VocabularyNotebookView,
} from '@/types/study';

const progressFilters: readonly { id: VocabularyNotebookProgressFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'studied', label: 'Studied' },
  { id: 'not-studied', label: 'Not studied' },
  { id: 'weak', label: 'Weak' },
  { id: 'mastered', label: 'Mastered' },
  { id: 'bookmarked', label: 'Bookmarked' },
  { id: 'due', label: 'Due' },
  { id: 'recently', label: 'Recent' },
];

const pageSize = 80;

function VocabularyRow({ item, view }: { item: VocabularyNotebookItem; view: VocabularyNotebookView }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open vocabulary ${item.title}`}
      onPress={() => router.push(`/vocabulary/${encodeURIComponent(item.id)}` as Href)}
      style={({ pressed }) => pressed && styles.pressed}>
      <Card style={view === 'compact' ? styles.compactCard : undefined}>
        <View style={styles.rowHeader}>
          <ThemedText type="smallBold" themeColor="primary">{item.level} · {item.partOfSpeech.join(' · ')}</ThemedText>
          <ContentMasteryBadge assessment={item.contentMastery} />
        </View>
        <ThemedText type="japanese">{item.title}</ThemedText>
        {item.reading && item.reading !== item.title ? <ThemedText themeColor="textSecondary">{item.reading}</ThemedText> : null}
        <ThemedText type={view === 'compact' ? 'small' : 'smallBold'}>{item.meaning}</ThemedText>
        {view === 'cards' ? <ThemedText type="small" themeColor="textSecondary">{item.bookmarked ? 'Bookmarked' : 'Not bookmarked'}{item.dueForReview ? ' · Due for review' : ''}{item.quizScore === undefined ? '' : ` · Quiz score: ${item.quizScore}%`}</ThemedText> : null}
      </Card>
    </Pressable>
  );
}

export default function VocabularyNotebookScreen() {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<'all' | 'N5' | 'N4'>('all');
  const [progress, setProgress] = useState<VocabularyNotebookProgressFilter>('all');
  const [partOfSpeech, setPartOfSpeech] = useState<string>();
  const [partOfSpeechOptions, setPartOfSpeechOptions] = useState<string[]>([]);
  const [items, setItems] = useState<VocabularyNotebookItem[]>();
  const [view, setView] = useState<VocabularyNotebookView>('cards');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [nextItems, options, savedView] = await Promise.all([
        getVocabularyNotebookItems({ query, level, progress, partOfSpeech, limit: pageSize, offset: 0 }),
        getVocabularyPartOfSpeechOptions(),
        getVocabularyNotebookView(),
      ]);
      setItems(nextItems);
      setHasMore(nextItems.length === pageSize);
      setPartOfSpeechOptions(options);
      setView(savedView);
    } catch {
      setFailed(true);
    }
  }, [level, partOfSpeech, progress, query]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    const timeout = setTimeout(() => { void load(); }, 180);
    return () => clearTimeout(timeout);
  }, [load]);

  const changeView = async (nextView: VocabularyNotebookView) => {
    setView(nextView);
    try {
      await setVocabularyNotebookView(nextView);
    } catch {
      setFailed(true);
    }
  };

  const startVisibleQuiz = async () => {
    if (!items?.length) return;
    setBusy(true);
    try {
      const session = await startVocabularyTopicQuiz(items.map((item) => item.id), 'quick');
      router.push(`/vocabulary/session?sessionId=${encodeURIComponent(session.id)}` as Href);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    if (!items?.length || !hasMore || busy) return;
    setBusy(true);
    try {
      const nextItems = await getVocabularyNotebookItems({
        query,
        level,
        progress,
        partOfSpeech,
        limit: pageSize,
        offset: items.length,
      });
      setItems((current) => [...(current ?? []), ...nextItems]);
      setHasMore(nextItems.length === pageSize);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (!items && !failed) return <ScreenContainer scroll={false}><LoadingState label="Opening vocabulary notebook…" /></ScreenContainer>;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <FlatList
        data={items ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <VocabularyRow item={item} view={view} />}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<View style={styles.listHeader}>
      <PageHeader eyebrow="1,700+ canonical words" title="Vocabulary Notebook" subtitle="Search by Japanese, reading, or meaning, then practise exactly the vocabulary in front of you." />
      <TextInput
        accessibilityLabel="Search vocabulary by Japanese, reading, or English meaning"
        autoCapitalize="none"
        onChangeText={setQuery}
        placeholder="Search Japanese, reading, or meaning"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
        value={query}
      />
      <View accessibilityRole="tablist" style={styles.filters}>
        {(['all', 'N5', 'N4'] as const).map((option) => (
          <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: level === option }} onPress={() => setLevel(option)} style={({ pressed }) => [styles.filter, { borderColor: level === option ? theme.primary : theme.border, backgroundColor: level === option ? theme.primarySoft : theme.surface }, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={{ color: level === option ? theme.primary : theme.text }}>{option === 'all' ? 'All levels' : option}</ThemedText>
          </Pressable>
        ))}
      </View>
      <View accessibilityRole="tablist" style={styles.filters}>
        {progressFilters.map((option) => (
          <Pressable key={option.id} accessibilityRole="tab" accessibilityState={{ selected: progress === option.id }} onPress={() => setProgress(option.id)} style={({ pressed }) => [styles.filter, { borderColor: progress === option.id ? theme.primary : theme.border, backgroundColor: progress === option.id ? theme.primarySoft : theme.surface }, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={{ color: progress === option.id ? theme.primary : theme.text }}>{option.label}</ThemedText>
          </Pressable>
        ))}
      </View>
      {partOfSpeechOptions.length ? (
        <>
          <ThemedText type="smallBold">Part of speech</ThemedText>
          <View style={styles.filters}>
            <Pressable accessibilityRole="button" onPress={() => setPartOfSpeech(undefined)} style={({ pressed }) => [styles.filter, { borderColor: !partOfSpeech ? theme.primary : theme.border, backgroundColor: !partOfSpeech ? theme.primarySoft : theme.surface }, pressed && styles.pressed]}><ThemedText type="smallBold">All</ThemedText></Pressable>
            {partOfSpeechOptions.filter((option) => ['noun', 'i-adjective', 'na-adjective', 'godan-verb', 'ichidan-verb', 'transitive-verb', 'intransitive-verb', 'adverb', 'particle', 'expression'].includes(option)).map((option) => (
              <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: partOfSpeech === option }} onPress={() => setPartOfSpeech(option)} style={({ pressed }) => [styles.filter, { borderColor: partOfSpeech === option ? theme.primary : theme.border, backgroundColor: partOfSpeech === option ? theme.primarySoft : theme.surface }, pressed && styles.pressed]}><ThemedText type="smallBold">{option.replaceAll('-', ' ')}</ThemedText></Pressable>
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.viewActions}>
        <AppButton label={view === 'cards' ? 'Using card view' : 'Use card view'} variant="quiet" onPress={() => void changeView('cards')} />
        <AppButton label={view === 'compact' ? 'Using compact view' : 'Use compact view'} variant="quiet" onPress={() => void changeView('compact')} />
      </View>
      {items?.length ? <AppButton label="Quick quiz visible words" loading={busy} onPress={() => void startVisibleQuiz()} /> : null}
      {failed ? <EmptyState title="Vocabulary could not be loaded" message="Your downloaded curriculum is still on this device. Try another filter or reopen the notebook." symbol="!" /> : null}
        </View>}
        ListEmptyComponent={!failed ? <EmptyState title="No vocabulary matches this filter" message="Try another level, progress state, or search term." /> : null}
        ListFooterComponent={hasMore ? <AppButton label="Load more vocabulary" variant="secondary" loading={busy} onPress={() => void loadMore()} /> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 50, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, fontSize: 16 },
  safeArea: { flex: 1 },
  listContent: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.five, gap: Spacing.three },
  listHeader: { gap: Spacing.three },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  filter: { minHeight: 44, borderWidth: 1, borderRadius: 999, justifyContent: 'center', paddingHorizontal: 12 },
  viewActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  compactCard: { paddingVertical: Spacing.two, gap: Spacing.one },
  pressed: { opacity: 0.76 },
});
