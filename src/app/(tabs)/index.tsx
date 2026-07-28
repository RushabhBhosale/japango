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
import { useTheme } from '@/hooks/use-theme';
import { getProgressSummary } from '@/services/database/progress-repository';
import { getExamAnalytics } from '@/services/database/exam-repository';
import { getContinueLearningLesson, getCourseHome } from '@/services/database/course-repository';
import { useAppStore } from '@/store/app-store';
import type { ProgressSummary } from '@/types/learning';
import type { ExamAnalytics } from '@/types/exam';
import type { CourseHomeData, CourseLessonSummary } from '@/types/course';

export default function HomeScreen() {
  const theme = useTheme();
  const profile = useAppStore((state) => state.profile);
  const [summary, setSummary] = useState<ProgressSummary>();
  const [examAnalytics, setExamAnalytics] = useState<ExamAnalytics>();
  const [courseHome, setCourseHome] = useState<CourseHomeData>();
  const [continuingLesson, setContinuingLesson] = useState<CourseLessonSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [progress, exams, continuing] = await Promise.all([getProgressSummary(), getExamAnalytics(), getContinueLearningLesson()]);
      setSummary(progress);
      setExamAnalytics(exams);
      setContinuingLesson(continuing);
      setCourseHome(await getCourseHome(continuing?.courseId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) {
    return <ScreenContainer scroll={false}><LoadingState label="Building today’s plan…" /></ScreenContainer>;
  }

  if (error || !profile || !summary) {
    return (
      <ScreenContainer contentStyle={styles.centered}>
        <EmptyState title="Today’s plan is unavailable" message="Your saved learning data is still on this device." symbol="!" />
        <AppButton label="Try again" onPress={() => void load()} />
      </ScreenContainer>
    );
  }

  const assessed = profile.assessmentCompleted;
  const focusText = profile.assessmentResult?.weakAreas.length
    ? profile.assessmentResult.weakAreas.map((area) => area.charAt(0).toUpperCase() + area.slice(1)).join(' · ')
    : 'Balanced N5 foundations';
  const actionLabel = assessed ? 'Continue studying' : 'Start the skill check';
  const courseLesson = continuingLesson ?? courseHome?.currentLesson;
  const courseMinutesRemaining = courseLesson
    ? Math.max(1, courseLesson.estimatedMinutes - Math.floor(courseLesson.progress.timeSpentSeconds / 60))
    : undefined;

  return (
    <ScreenContainer>
      <PageHeader
        eyebrow="こんにちは"
        title={`Welcome back, ${profile.displayName}.`}
        subtitle="One focused session is enough to make today count."
      />

      <Card style={[styles.planCard, { backgroundColor: theme.primarySoft, borderColor: theme.primary }]}>
        <View style={styles.planTop}>
          <View style={styles.planCopy}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>TODAY’S RECOMMENDATION</ThemedText>
            <ThemedText type="subtitle">{courseLesson ? `Continue Lesson ${courseLesson.number}` : assessed ? (summary.dueCount ? 'Complete today’s reviews' : 'Build your N5 rhythm') : 'Find your starting point'}</ThemedText>
          </View>
          <View style={[styles.minutes, { backgroundColor: theme.surface }]}>
            <ThemedText type="heading" style={{ color: theme.primary }}>{assessed ? profile.dailyGoalMinutes : 10}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">min</ThemedText>
          </View>
        </View>
        <ThemedText themeColor="textSecondary">
          {courseLesson
            ? `You are at: ${courseLesson.progress.currentSectionId ? 'a saved lesson section' : courseLesson.communicationGoal} · about ${courseMinutesRemaining} minutes remain.`
            : assessed
              ? `${summary.dueCount} reviews and ${summary.scheduler.newCards} new cards are ready. About ${summary.scheduler.estimatedStudyMinutes} minutes.`
              : 'A short 20-question check will create your first local learning plan.'}
        </ThemedText>
        <AppButton
          label={courseLesson ? continuingLesson ? 'Continue' : 'Start lesson' : actionLabel}
          onPress={() => router.push(courseLesson ? `/course/lesson/${encodeURIComponent(courseLesson.id)}` as Href : assessed ? '/(tabs)/learn' : '/assessment')}
        />
        {assessed ? <View style={styles.quickActions}><AppButton label="10-minute review" variant="secondary" onPress={() => router.push('/(tabs)/review' as Href)} /><AppButton label="Practise weak kanji" variant="secondary" onPress={() => router.push('/library/kanji' as Href)} /></View> : null}
      </Card>

      <View style={styles.stats}>
        <Card style={styles.statCard}>
          <ThemedText style={[styles.statValue, { color: theme.warning }]}>{summary.dueCount}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Due reviews</ThemedText>
        </Card>
        <Card style={styles.statCard}>
          <ThemedText style={[styles.statValue, { color: theme.error }]}>{summary.scheduler.learningCards}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Learning cards</ThemedText>
        </Card>
        <Card style={styles.statCard}>
          <ThemedText style={[styles.statValue, { color: theme.success }]}>{summary.statusCounts.mastered}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Mastered</ThemedText>
        </Card>
      </View>

      <SectionHeading title="Your learning level" />
      <Card>
        <ThemedText type="heading">{profile.learnerLevel ?? 'Assessment not completed'}</ThemedText>
        {assessed ? (
          <>
            <View style={styles.progressLabel}>
              <ThemedText type="small">Initial assessment</ThemedText>
              <ThemedText type="smallBold">{profile.assessmentScore}%</ThemedText>
            </View>
            <ProgressBar value={profile.assessmentScore ?? 0} accessibilityLabel="Initial assessment score" />
          </>
        ) : null}
      </Card>

      <SectionHeading title="What you’re improving" />
      <Card>
        <ThemedText type="heading">{focusText}</ThemedText>
        <ThemedText themeColor="textSecondary">{summary.scheduler.currentStreak}-day streak · {summary.scheduler.retention}% recent retention · {summary.scheduler.dueTomorrow} cards due tomorrow.</ThemedText>
      </Card>

      <SectionHeading title="Mock exam readiness" />
      <Card>
        <ThemedText type="heading">{examAnalytics?.completedMocks ? `${examAnalytics.readiness}% estimated readiness` : 'Take a first mock exam'}</ThemedText>
        <ThemedText themeColor="textSecondary">{examAnalytics?.completedMocks ? `${examAnalytics.completedMocks} completed mocks · best ${examAnalytics.highestMockScore ?? 0}%` : 'A short offline mock will establish an exam baseline.'}</ThemedText>
        <AppButton label="Practice & mock exams" variant="quiet" onPress={() => router.push('/exams' as Href)} />
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center' },
  planCard: { padding: Spacing.four, gap: Spacing.three },
  planTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  planCopy: { flex: 1, gap: Spacing.one },
  minutes: { width: 66, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: Spacing.two },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  statCard: { flex: 1, minWidth: 0, padding: 12 },
  statValue: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  progressLabel: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
});
