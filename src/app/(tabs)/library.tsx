import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { StatusBadge } from '@/components/common/status-badge';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getStudyLibraryHomeData, searchStudyLibrary } from '@/services/database/study-library-repository';
import type { StudyLibraryContentType, StudyLibraryHomeData, StudyLibraryItem } from '@/types/study-library';

const notebookCards: readonly {
  type: StudyLibraryContentType;
  title: string;
  description: string;
  route: string;
}[] = [
  { type: 'grammar', title: 'Grammar Notebook', description: 'Read canonical explanations and focus on one pattern at a time.', route: '/library/grammar' },
  { type: 'vocabulary', title: 'Vocabulary Notebook', description: 'Browse Japanese words, readings, meanings, and example usage.', route: '/library/vocabulary' },
  { type: 'kanji', title: 'Kanji Notebook', description: 'Explore readings, vocabulary connections, and study progress.', route: '/library/kanji' },
];

function routeForItem(item: StudyLibraryItem): Href {
  return `/${item.type}/${encodeURIComponent(item.id)}` as Href;
}

function routeForHistoryItem(item: StudyLibraryHomeData['recentlyViewed'][number]): Href {
  return `/${item.type}/${encodeURIComponent(item.itemId)}` as Href;
}

function itemLabel(item: StudyLibraryItem): string {
  return [item.title, item.reading !== item.title ? item.reading : undefined, item.meaning]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}

export default function StudyLibraryScreen() {
  const theme = useTheme();
  const [homeData, setHomeData] = useState<StudyLibraryHomeData>();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StudyLibraryItem[]>([]);
  const [searchTypes, setSearchTypes] = useState<StudyLibraryContentType[]>([]);
  const [searchLevel, setSearchLevel] = useState<'all' | 'N5' | 'N4'>('all');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setHomeData(await getStudyLibraryHomeData());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      return;
    }
    let active = true;
    const timeout = setTimeout(() => {
      void searchStudyLibrary(normalized, { types: searchTypes, level: searchLevel }).then((results) => {
        if (active) setSearchResults(results);
      }).catch(() => {
        if (active) setSearchResults([]);
      });
    }, 160);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query, searchLevel, searchTypes]);

  if (loading) {
    return <ScreenContainer scroll={false}><LoadingState label="Opening your Study Library…" /></ScreenContainer>;
  }

  if (failed || !homeData) {
    return (
      <ScreenContainer contentStyle={styles.centered}>
        <EmptyState title="Study Library is unavailable" message="Your downloaded curriculum and progress remain on this device." symbol="!" />
        <AppButton label="Try again" onPress={() => void load()} />
      </ScreenContainer>
    );
  }

  const summaries = new Map(homeData.summaries.map((summary) => [summary.type, summary]));
  const isSearching = Boolean(query.trim());
  const searchGroups = notebookCards.map((notebook) => ({
    ...notebook,
    items: searchResults.filter((item) => item.type === notebook.type),
  }));
  const toggleSearchType = (type: StudyLibraryContentType) => {
    setSearchTypes((current) => current.includes(type)
      ? current.filter((candidate) => candidate !== type)
      : [...current, type]);
  };
  return (
    <ScreenContainer keyboardAware>
      <PageHeader eyebrow="Browse your curriculum" title="Study Library" subtitle="Choose a topic, learn at your pace, and practise exactly what you need." />
      <TextInput
        accessibilityLabel="Search grammar, vocabulary, and kanji"
        autoCapitalize="none"
        onChangeText={setQuery}
        placeholder="Search grammar, words, or kanji"
        placeholderTextColor={theme.textSecondary}
        style={[styles.search, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
        value={query}
      />

      {isSearching ? (
        <>
          <SectionHeading title="Study content" detail={`${searchResults.length} matches`} />
          <View accessibilityRole="tablist" style={styles.searchFilters}>
            {notebookCards.map((notebook) => {
              const selected = searchTypes.length === 0 || searchTypes.includes(notebook.type);
              return <Pressable key={notebook.type} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => toggleSearchType(notebook.type)} style={({ pressed }) => [styles.searchFilter, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface }, pressed && styles.pressed]}><ThemedText type="smallBold">{notebook.type}</ThemedText></Pressable>;
            })}
            {(['all', 'N5', 'N4'] as const).map((level) => <Pressable key={level} accessibilityRole="tab" accessibilityState={{ selected: searchLevel === level }} onPress={() => setSearchLevel(level)} style={({ pressed }) => [styles.searchFilter, { borderColor: searchLevel === level ? theme.primary : theme.border, backgroundColor: searchLevel === level ? theme.primarySoft : theme.surface }, pressed && styles.pressed]}><ThemedText type="smallBold">{level === 'all' ? 'All levels' : level}</ThemedText></Pressable>)}
          </View>
          {searchResults.length ? searchGroups.map((group) => group.items.length ? (
            <View key={group.type} style={styles.searchGroup}>
              <SectionHeading title={group.title} detail={`${group.items.length} matches`} />
              {group.items.map((item) => (
                <Card key={item.id} accessibilityLabel={`${item.type} ${itemLabel(item)}`}>
                  <View style={styles.itemHeader}>
                    <ThemedText type="smallBold" themeColor="primary">{item.level} {item.type}</ThemedText>
                    <StatusBadge status={item.mastery.status} />
                  </View>
                  <ThemedText type="heading">{item.title}</ThemedText>
                  {item.reading && item.reading !== item.title ? <ThemedText type="japanese">{item.reading}</ThemedText> : null}
                  {item.meaning ? <ThemedText themeColor="textSecondary">{item.meaning}</ThemedText> : null}
                  <AppButton label="Open" variant="secondary" onPress={() => router.push(routeForItem(item))} />
                </Card>
              ))}
            </View>
          ) : null) : <EmptyState title="No study content found" message="Try a Japanese spelling, reading, or English meaning." />}
        </>
      ) : (
        <>
          <SectionHeading title="Your notebooks" />
          {notebookCards.map((card) => {
            const summary = summaries.get(card.type);
            return (
              <Card key={card.type} accessibilityLabel={card.title}>
                <ThemedText type="heading">{card.title}</ThemedText>
                <ThemedText themeColor="textSecondary">{card.description}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {summary?.totalCount ?? 0} items · {summary?.studiedCount ?? 0} studied · {summary?.masteredCount ?? 0} mastered · {summary?.bookmarkedCount ?? 0} bookmarked
                </ThemedText>
                <AppButton label={`Browse ${card.type}`} variant="secondary" onPress={() => router.push(card.route as Href)} />
              </Card>
            );
          })}
          <Card accessibilityLabel="Kanji Flashcards">
            <ThemedText type="heading">Kanji Flashcards</ThemedText>
            <ThemedText themeColor="textSecondary">Use recall ratings to keep the existing local FSRS schedule accurate.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{summaries.get('kanji')?.totalCount ?? 0} available kanji · N5 and N4</ThemedText>
            <AppButton label="Open flashcards" variant="secondary" onPress={() => router.push('/library/flashcards' as Href)} />
          </Card>
          {homeData.latestFlashcardSession ? <Card><ThemedText type="smallBold">Latest flashcard session</ThemedText><ThemedText themeColor="textSecondary">{homeData.latestFlashcardSession.itemCount} kanji · {homeData.latestFlashcardSession.status.replaceAll('-', ' ')}</ThemedText><AppButton label={homeData.latestFlashcardSession.status === 'in-progress' ? 'Resume flashcards' : 'Open flashcards'} variant="quiet" onPress={() => router.push('/library/flashcards' as Href)} /></Card> : null}

          {homeData.resumableSession ? (
            <>
              <SectionHeading title="Continue learning" />
              <Card>
                <ThemedText type="heading">A saved practice session is ready</ThemedText>
                <ThemedText themeColor="textSecondary">Pick up where you left off. Your completed answers are already saved locally.</ThemedText>
                <AppButton
                  label="Resume practice"
                  onPress={() => router.push(
                    homeData.resumableSession?.kind === 'vocabulary-practice'
                      ? `/vocabulary/session?sessionId=${encodeURIComponent(homeData.resumableSession.sessionId)}` as Href
                      : `/practice/${encodeURIComponent(homeData.resumableSession?.sessionId ?? '')}` as Href,
                  )}
                />
              </Card>
            </>
          ) : null}

          {homeData.recentlyViewed.length ? (
            <>
              <SectionHeading title="Recently viewed" />
              {homeData.recentlyViewed.map((item) => (
                <AppButton
                  key={item.id}
                  label={[item.title, item.meaning].filter(Boolean).join(' · ')}
                  variant="quiet"
                  onPress={() => router.push(routeForHistoryItem(item))}
                />
              ))}
            </>
          ) : null}

          {homeData.bookmarkedItems.length ? (
            <>
              <SectionHeading title="Bookmarked content" />
              {homeData.bookmarkedItems.map((item) => (
                <AppButton key={item.id} label={itemLabel(item)} variant="quiet" onPress={() => router.push(routeForItem(item))} />
              ))}
            </>
          ) : null}

          {homeData.weakItems.length ? (
            <>
              <SectionHeading title="Topics needing attention" />
              {homeData.weakItems.map((item) => (
                <Card key={item.id}>
                  <View style={styles.itemHeader}>
                    <ThemedText type="heading">{item.title}</ThemedText>
                    <StatusBadge status={item.mastery.status} />
                  </View>
                  <ThemedText themeColor="textSecondary">{item.meaning}</ThemedText>
                  <AppButton label="Open topic" variant="quiet" onPress={() => router.push(routeForItem(item))} />
                </Card>
              ))}
            </>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center' },
  search: { minHeight: 50, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, fontSize: 16 },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  searchFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  searchFilter: { minHeight: 44, borderWidth: 1, borderRadius: 999, justifyContent: 'center', paddingHorizontal: 12 },
  searchGroup: { gap: Spacing.two },
  pressed: { opacity: 0.76 },
});
