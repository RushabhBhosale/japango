import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { listPublishedLessonsV2 } from '@/services/api/lessons-v2-client';
import { cacheLessonsV2, getCachedLessonsV2 } from '@/services/database/lessons-v2-repository';
import type { LessonV2Version } from '@/types/lessons-v2';

export default function LessonsV2IndexScreen() {
  const [lessons, setLessons] = useState<LessonV2Version[]>();
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const published = await listPublishedLessonsV2();
      await cacheLessonsV2(published);
      setLessons(published);
      setOffline(false);
    } catch {
      setLessons(await getCachedLessonsV2());
      setOffline(true);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!lessons) return <ScreenContainer scroll={false}><LoadingState label="Opening Lessons V2…" /></ScreenContainer>;
  return <ScreenContainer>
    <PageHeader eyebrow="Lessons V2" title="Lessons" subtitle={offline ? 'Showing saved lessons. Connect to refresh published content.' : 'Versioned lessons built from reviewed Japanese sources.'} />
    {!lessons.length ? <EmptyState title="No published V2 lessons" message="Lesson drafts remain private until explicitly validated and published." /> : null}
    {lessons.map((lesson) => <Card key={lesson.id}><View style={{ gap: 8 }}>
      <ThemedText type="smallBold">JLPT {lesson.level} · {lesson.estimatedMinutes} min</ThemedText>
      <ThemedText type="heading">{lesson.title}</ThemedText>
      <ThemedText themeColor="textSecondary">{lesson.objectives.join(' · ')}</ThemedText>
      <AppButton label="Open lesson" onPress={() => router.push(`/lessons-v2/${encodeURIComponent(lesson.lessonId)}` as Href)} />
    </View></Card>)}
  </ScreenContainer>;
}
