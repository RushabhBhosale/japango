import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { CurriculumItemCard } from '@/components/lesson/curriculum-item-card';
import { getSuggestedCurriculum } from '@/services/database/progress-repository';
import type { CurriculumWithMastery } from '@/types/learning';

export default function LearnScreen() {
  const [items, setItems] = useState<CurriculumWithMastery[]>([]);
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

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Choosing today’s items…" /></ScreenContainer>;

  return (
    <ScreenContainer>
      <PageHeader eyebrow="Your study queue" title="Learn" subtitle="A calm mix of weak, due, and new N5 material." />
      {error ? (
        <>
          <EmptyState title="Items could not be loaded" message="Your curriculum is still saved locally." symbol="!" />
          <AppButton label="Try again" onPress={() => void load()} />
        </>
      ) : items.length === 0 ? (
        <EmptyState title="Your queue is clear" message="Come back after your next review is due." />
      ) : (
        <>
          <SectionHeading title="Suggested next" detail={`${items.length} items`} />
          {items.map((item) => <CurriculumItemCard item={item} key={item.id} />)}
        </>
      )}
    </ScreenContainer>
  );
}
