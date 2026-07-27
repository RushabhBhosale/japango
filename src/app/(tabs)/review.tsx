import { useCallback, useState } from 'react';
import { router, useFocusEffect, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { CurriculumItemCard } from '@/components/lesson/curriculum-item-card';
import { getReviewCurriculum } from '@/services/database/progress-repository';
import { startReviewSession } from '@/services/database/vocabulary-repository';
import type { CurriculumWithMastery } from '@/types/learning';

export default function ReviewScreen() {
  const [items, setItems] = useState<CurriculumWithMastery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string>();

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
  const openItem = (item: CurriculumWithMastery) => {
    const route = item.type === 'vocabulary'
      ? `/vocabulary/${encodeURIComponent(item.id)}`
      : `/curriculum/${encodeURIComponent(item.id)}`;
    router.push(route as Href);
  };
  const startSession = async (mode: 'all' | 'weak') => {
    setSessionMessage(undefined);
    setStarting(true);
    try {
      const session = await startReviewSession(mode);
      router.push(`/review/session?sessionId=${encodeURIComponent(session.id)}` as Href);
    } catch (startError) {
      setSessionMessage(startError instanceof Error ? startError.message : 'A review session could not be started.');
    } finally {
      setStarting(false);
    }
  };

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
          <SectionHeading title="Start a review" />
          <AppButton label="Review due vocabulary" loading={starting} onPress={() => void startSession('all')} />
          {weakItems.length ? <AppButton label="Resume relearning vocabulary" variant="secondary" loading={starting} onPress={() => void startSession('weak')} /> : null}
          {sessionMessage ? <EmptyState title="Review not started" message={sessionMessage} symbol="!" /> : null}
          {dueItems.length ? (
            <>
              <SectionHeading title="Due now" detail={`${dueItems.length} items`} />
              {dueItems.map((item) => <CurriculumItemCard item={item} key={item.id} onPress={() => openItem(item)} />)}
            </>
          ) : null}
          {weakItems.length ? (
            <>
              <SectionHeading title="Relearning" detail={`${weakItems.length} items`} />
              {weakItems.map((item) => <CurriculumItemCard item={item} key={item.id} onPress={() => openItem(item)} />)}
            </>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}
