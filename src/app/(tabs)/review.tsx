import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { CurriculumItemCard } from '@/components/lesson/curriculum-item-card';
import { getReviewCurriculum } from '@/services/database/progress-repository';
import type { CurriculumWithMastery } from '@/types/learning';

export default function ReviewScreen() {
  const [items, setItems] = useState<CurriculumWithMastery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setItems(await getReviewCurriculum());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Checking your review schedule…" /></ScreenContainer>;

  const weakItems = items.filter((item) => item.mastery.status === 'weak');
  const dueItems = items.filter((item) => item.mastery.status !== 'weak');

  return (
    <ScreenContainer>
      <PageHeader eyebrow="Spaced practice" title="Review" subtitle="Revisit what needs attention, without cramming." />
      {error ? (
        <>
          <EmptyState title="Reviews could not be loaded" message="Your schedule is still saved on this device." symbol="!" />
          <AppButton label="Try again" onPress={() => void load()} />
        </>
      ) : items.length === 0 ? (
        <EmptyState title="Nothing is due right now" message="You’re caught up. New review items will appear as their dates arrive." symbol="済" />
      ) : (
        <>
          {dueItems.length ? (
            <>
              <SectionHeading title="Due now" detail={`${dueItems.length} items`} />
              {dueItems.map((item) => <CurriculumItemCard item={item} key={item.id} />)}
            </>
          ) : null}
          {weakItems.length ? (
            <>
              <SectionHeading title="Needs focus" detail={`${weakItems.length} items`} />
              {weakItems.map((item) => <CurriculumItemCard item={item} key={item.id} />)}
            </>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}
