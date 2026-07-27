import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { acceptCoursePlacement, getContinueLearningLesson, getCourseHome, getPlacementRecommendationForLearner } from '@/services/database/course-repository';
import type { CourseHomeData, CoursePlacementRecommendation } from '@/types/course';
import { useTheme } from '@/hooks/use-theme';

const courseChoices = [
  { id: 'foundations', label: 'Foundations' },
  { id: 'jlpt-n5', label: 'JLPT N5' },
  { id: 'jlpt-n4', label: 'JLPT N4' },
] as const;

function stateLabel(state: string): string {
  return state.replaceAll('_', ' ');
}

export default function LearnScreen() {
  const theme = useTheme();
  const [data, setData] = useState<CourseHomeData>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [recommendation, setRecommendation] = useState<CoursePlacementRecommendation>();
  const [continuing, setContinuing] = useState<NonNullable<Awaited<ReturnType<typeof getContinueLearningLesson>>>>();

  const load = useCallback(async () => {
    setError(false);
    try {
      const [nextRecommendation, nextContinue] = await Promise.all([getPlacementRecommendationForLearner(), getContinueLearningLesson()]);
      setRecommendation(nextRecommendation);
      setContinuing(nextContinue);
      setData(await getCourseHome(nextContinue?.courseId ?? nextRecommendation.courseId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const selectCourse = async (courseId: typeof courseChoices[number]['id']) => {
    setLoading(true);
    try { setData(await getCourseHome(courseId)); } catch { setError(true); } finally { setLoading(false); }
  };

  const acceptPlacement = async () => {
    if (!recommendation) return;
    setLoading(true);
    try {
      await acceptCoursePlacement(recommendation);
      setData(await getCourseHome(recommendation.courseId));
    } catch { setError(true); } finally { setLoading(false); }
  };

  if (loading && !data) return <ScreenContainer scroll={false}><LoadingState label="Opening your course…" /></ScreenContainer>;
  if (error || !data) return <ScreenContainer><EmptyState title="Your course could not be opened" message="Your lessons and saved progress are still on this device." symbol="!" /><AppButton label="Try again" onPress={() => void load()} /></ScreenContainer>;

  const current = data.currentLesson;
  return (
    <ScreenContainer>
      <PageHeader eyebrow="Structured course" title="Learn" subtitle="A clear sequence, with notebooks and review always close by." />
      <View style={styles.choices}>
        {courseChoices.map((choice) => <AppButton key={choice.id} label={choice.label} variant={choice.id === data.course.id ? 'primary' : 'secondary'} onPress={() => void selectCourse(choice.id)} />)}
      </View>
      {recommendation ? <Card>
        <ThemedText type="smallBold">RECOMMENDED STARTING POINT</ThemedText>
        <ThemedText type="heading">{recommendation.courseId === 'foundations' ? 'Japanese Foundations' : recommendation.courseId === 'jlpt-n5' ? 'JLPT N5' : 'JLPT N4'} · {recommendation.lessonId.replaceAll('-', ' ')}</ThemedText>
        <ThemedText themeColor="textSecondary">{recommendation.reason} You can always choose another course above; earlier lessons stay available for review rather than being marked mastered.</ThemedText>
        <AppButton label="Use this starting point" variant="secondary" onPress={() => void acceptPlacement()} />
      </Card> : null}
      {continuing ? <Card>
        <ThemedText type="smallBold">CONTINUE LEARNING</ThemedText>
        <ThemedText type="heading">Lesson {continuing.number} — {continuing.title}</ThemedText>
        <ThemedText themeColor="textSecondary">Resume at the exact saved activity and interaction.</ThemedText>
        <AppButton label="Resume lesson" onPress={() => router.push(`/course/lesson/${encodeURIComponent(continuing.id)}` as Href)} />
      </Card> : null}
      <Card style={{ backgroundColor: theme.primarySoft }}>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>{data.course.title.toUpperCase()}</ThemedText>
        <ThemedText type="heading">{current ? `Next: Lesson ${current.number} — ${current.title}` : 'This course is complete'}</ThemedText>
        <ThemedText themeColor="textSecondary">{current?.communicationGoal ?? 'Choose another course or revisit a completed lesson whenever you like.'}</ThemedText>
        <ProgressBar value={data.totalProgress} accessibilityLabel={`${data.course.title} progress`} />
        <ThemedText type="small" themeColor="textSecondary">{data.totalProgress}% complete · about {data.estimatedRemainingMinutes} minutes remaining · {data.reviewDueCount} reviews due</ThemedText>
        {current ? <AppButton label={current.progress.state === 'in_progress' ? 'Continue lesson' : 'Start next lesson'} onPress={() => router.push(`/course/lesson/${encodeURIComponent(current.id)}` as Href)} /> : null}
      </Card>

      <View style={styles.row}>
        <AppButton label="View course map" variant="secondary" onPress={() => router.push(`/course/${data.course.id}` as Href)} />
        <AppButton label="Study Library" variant="secondary" onPress={() => router.push('/library' as Href)} />
      </View>

      <SectionHeading title="Course map" detail={`${data.units.length} units`} />
      {data.units.map((unit) => (
        <Card key={unit.id} style={styles.unit}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>UNIT {unit.order}</ThemedText>
          <ThemedText type="heading">{unit.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{unit.goal}</ThemedText>
          {unit.lessons.map((lesson) => (
            <View key={lesson.id} style={styles.lessonRow}>
              <View style={styles.lessonText}>
                <ThemedText type="smallBold">Lesson {lesson.number} · {lesson.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {stateLabel(lesson.progress.state)} · {lesson.estimatedMinutes} min
                  {lesson.activities.length ? ` · ${lesson.vocabularyIds.length} words · ${lesson.patternObjectives.length} patterns · ${lesson.kanjiIds.length} kanji` : ''}
                  {lesson.progress.latestCheckpointScore !== undefined ? ` · checkpoint ${lesson.progress.latestCheckpointScore}%` : ''}
                </ThemedText>
              </View>
              <AppButton label={lesson.progress.state === 'locked' ? 'Locked' : 'Open'} disabled={lesson.progress.state === 'locked'} variant="secondary" onPress={() => router.push(`/course/lesson/${encodeURIComponent(lesson.id)}` as Href)} />
            </View>
          ))}
          {unit.reviewAvailable ? <AppButton label={unit.reviewCompleted ? 'Retake unit review' : 'Start unit review'} variant="secondary" onPress={() => router.push(`/course/unit/${encodeURIComponent(unit.id)}` as Href)} /> : <ThemedText type="small" themeColor="textSecondary">Unit review unlocks after every lesson is attempted.</ThemedText>}
        </Card>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  unit: { gap: Spacing.two },
  lessonRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  lessonText: { flex: 1, gap: 2 },
});
