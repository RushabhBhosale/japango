import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { CurriculumItemCard } from '@/components/lesson/curriculum-item-card';
import { getSuggestedCurriculum } from '@/services/database/progress-repository';
import { searchAllCurriculum } from '@/services/database/content-learning-repository';
import type { CurriculumSearchResult } from '@/types/content-learning';
import type { CurriculumWithMastery } from '@/types/learning';
import { useTheme } from '@/hooks/use-theme';

export default function LearnScreen() {
  const theme = useTheme();
  const [items, setItems] = useState<CurriculumWithMastery[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CurriculumSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setItems(await getSuggestedCurriculum());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) return;
    let active = true;
    const timeout = setTimeout(() => {
      void searchAllCurriculum(query).then((results) => {
        if (active) setSearchResults(results);
      }).catch(() => {
        if (active) setSearchResults([]);
      });
    }, 160);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [searchQuery]);

  const visibleSearchResults = searchQuery.trim() ? searchResults : [];

  const openItem = (item: CurriculumWithMastery) => {
    const route = routeFor(item.type, item.id);
    router.push(route as Href);
  };
  const openSearchResult = (item: CurriculumSearchResult) => router.push(routeFor(item.type, item.id) as Href);

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Choosing today’s items…" /></ScreenContainer>;

  return (
    <ScreenContainer>
      <PageHeader eyebrow="Your study queue" title="Learn" subtitle="A calm mix of weak, due, and new release-ready material." />
      <AppButton label="Practice & mock exams" variant="secondary" onPress={() => router.push('/exams' as Href)} />
      <TextInput
        accessibilityLabel="Search all installed curriculum by Japanese, reading, or meaning"
        autoCapitalize="none"
        onChangeText={setSearchQuery}
        placeholder="Search all curriculum"
        placeholderTextColor={theme.textSecondary}
        style={[styles.search, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
        value={searchQuery}
      />
      {error ? (
        <>
          <EmptyState title="Items could not be loaded" message="Your curriculum is still saved locally." symbol="!" />
          <AppButton label="Try again" onPress={() => void load()} />
        </>
      ) : items.length === 0 ? (
        <EmptyState title="Your queue is clear" message="Come back after your next review is due." />
      ) : (
        <>
          {searchQuery.trim() ? (
            <>
              <SectionHeading title="Curriculum search" detail={`${visibleSearchResults.length} matches`} />
              {visibleSearchResults.map((item) => <CurriculumItemCard item={{ id: item.id, type: item.type === 'sentence' ? 'reading' : item.type, level: item.level ?? 'N5', title: item.title, meaning: item.subtitle, tags: [], mastery: { userId: '', itemId: item.id, masteryScore: 0, confidenceScore: 0, correctCount: 0, incorrectCount: 0, averageResponseTimeMs: 0, reviewIntervalDays: 0, status: 'new' } }} key={`${item.type}-${item.id}`} onPress={() => openSearchResult(item)} />)}
            </>
          ) : (
            <>
              <SectionHeading title="Suggested next" detail={`${items.length} items`} />
              {items.map((item) => <CurriculumItemCard item={item} key={item.id} onPress={() => openItem(item)} />)}
            </>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

function routeFor(type: CurriculumWithMastery['type'] | CurriculumSearchResult['type'], id: string): string {
  const encoded = encodeURIComponent(id);
  if (type === 'vocabulary') return `/vocabulary/${encoded}`;
  if (type === 'grammar') return `/grammar/${encoded}`;
  if (type === 'kanji') return `/kanji/${encoded}`;
  if (type === 'reading') return `/reading/${encoded}`;
  if (type === 'listening') return `/listening/${encoded}`;
  return `/sentence/${encoded}`;
}

const styles = StyleSheet.create({
  search: { minHeight: 50, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, fontSize: 16 },
});
