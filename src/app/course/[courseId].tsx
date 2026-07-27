import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getCourseHome, getLessonBrowsingEnabled, setAllowLessonBrowsing } from '@/services/database/course-repository';
import type { CourseHomeData } from '@/types/course';

export default function CourseMapScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const [data, setData] = useState<CourseHomeData>();
  const [error, setError] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try { const [course, enabled] = await Promise.all([getCourseHome(courseId), getLessonBrowsingEnabled()]); setData(course); setBrowsing(enabled); } catch { setError(true); }
  }, [courseId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (!data && !error) return <ScreenContainer scroll={false}><LoadingState label="Loading course map…" /></ScreenContainer>;
  if (error || !data) return <ScreenContainer><EmptyState title="Course unavailable" message="Please return to Learn and try again." symbol="!" /><AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn' as Href)} /></ScreenContainer>;
  const toggleBrowsing = async () => { const next = !browsing; await setAllowLessonBrowsing(next); setBrowsing(next); await load(); };
  return <ScreenContainer>
    <PageHeader eyebrow="Course map" title={data.course.title} subtitle={data.course.description} />
    <Card><ThemedText type="heading">{data.totalProgress}% complete</ThemedText><ProgressBar value={data.totalProgress} accessibilityLabel="Course progress" /><ThemedText type="small" themeColor="textSecondary">{data.estimatedRemainingMinutes} minutes remain in this course plan.</ThemedText><AppButton label={browsing ? 'Use ordered lesson unlocking' : 'Allow lesson browsing'} variant="secondary" onPress={() => void toggleBrowsing()} /></Card>
    {data.units.map((unit) => <Card key={unit.id} style={styles.unit}><ThemedText type="smallBold">UNIT {unit.order}</ThemedText><ThemedText type="heading">{unit.title}</ThemedText><ThemedText themeColor="textSecondary">{unit.goal}</ThemedText>{unit.lessons.map((lesson) => <View key={lesson.id} style={styles.lesson}><View style={{ flex: 1 }}><ThemedText>{lesson.kind === 'workshop' ? 'Workshop' : 'Lesson'} {lesson.number} — {lesson.title}</ThemedText><ThemedText type="small" themeColor="textSecondary">{lesson.communicationGoal} · {lesson.estimatedMinutes} min · {lesson.vocabularyIds.length} words · {lesson.patternObjectives.length} patterns · {lesson.kanjiIds.length} kanji · {lesson.progress.state.replaceAll('_', ' ')}{lesson.progress.latestCheckpointScore !== undefined ? ` · checkpoint ${lesson.progress.latestCheckpointScore}%` : ''}</ThemedText></View><AppButton variant="secondary" disabled={lesson.progress.state === 'locked'} label={lesson.progress.state === 'locked' ? 'Locked' : lesson.progress.state === 'in_progress' ? 'Resume' : 'Open'} onPress={() => router.push(`/course/lesson/${encodeURIComponent(lesson.id)}` as Href)} /></View>)}{unit.reviewAvailable ? <AppButton label={unit.reviewCompleted ? 'Retake unit review' : 'Start unit review'} variant="secondary" onPress={() => router.push(`/course/unit/${encodeURIComponent(unit.id)}` as Href)} /> : <ThemedText type="small" themeColor="textSecondary">Unit review unlocks after every lesson is attempted.</ThemedText>}</Card>)}
  </ScreenContainer>;
}

const styles = StyleSheet.create({ unit: { gap: Spacing.two }, lesson: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' } });
