import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { StatusBadge } from '@/components/common/status-badge';
import { ThemedText } from '@/components/themed-text';
import { getCanonicalCurriculumItemById } from '@/services/database/vocabulary-repository';
import type { CurriculumWithMastery } from '@/types/learning';

export default function CurriculumDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [item, setItem] = useState<CurriculumWithMastery>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setItem(id ? await getCanonicalCurriculumItemById(id) : undefined);
    } finally {
      setLoading(false);
    }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening curriculum item…" /></ScreenContainer>;
  if (!item) {
    return (
      <ScreenContainer>
        <EmptyState title="Curriculum item unavailable" message="This item is not in the current release curriculum." symbol="!" />
        <AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn')} />
      </ScreenContainer>
    );
  }
  if (item.type === 'grammar') {
    router.replace(`/grammar/${encodeURIComponent(item.id)}` as Href);
    return null;
  }
  if (item.type === 'kanji') {
    router.replace(`/kanji/${encodeURIComponent(item.id)}` as Href);
    return null;
  }
  if (item.type === 'reading') {
    router.replace(`/reading/${encodeURIComponent(item.id)}` as Href);
    return null;
  }
  if (item.type === 'listening') {
    router.replace(`/listening/${encodeURIComponent(item.id)}` as Href);
    return null;
  }
  return (
    <ScreenContainer>
      <PageHeader eyebrow={`${item.level} ${item.type}`} title={item.title} subtitle={item.meaning ?? ''} />
      <Card>
        <StatusBadge status={item.mastery.status} />
        {item.reading && item.reading !== item.title ? <ThemedText type="japanese">{item.reading}</ThemedText> : null}
        {item.explanation ? <ThemedText themeColor="textSecondary">{item.explanation}</ThemedText> : null}
        <ThemedText type="small" themeColor="textSecondary">A dedicated practice session for this content type is not available yet. Its current local learning status is shown here.</ThemedText>
      </Card>
    </ScreenContainer>
  );
}
