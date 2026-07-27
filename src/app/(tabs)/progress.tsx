import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

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
import { getCourseLearningAnalytics } from '@/services/database/course-repository';
import { useAppStore } from '@/store/app-store';
import type { MasteryStatus, ProgressSummary } from '@/types/learning';
import type { ExamAnalytics } from '@/types/exam';
import type { CourseLessonAnalytics } from '@/types/course';

const statusLabels: Record<MasteryStatus, string> = {
  new: 'New',
  learning: 'Learning',
  weak: 'Needs focus',
  review: 'Due for review',
  mastered: 'Mastered',
};

export default function ProgressScreen() {
  const theme = useTheme();
  const profile = useAppStore((state) => state.profile);
  const [summary, setSummary] = useState<ProgressSummary>();
  const [examAnalytics, setExamAnalytics] = useState<ExamAnalytics>();
  const [courseAnalytics, setCourseAnalytics] = useState<CourseLessonAnalytics>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [progress, exams, course] = await Promise.all([getProgressSummary(), getExamAnalytics(), getCourseLearningAnalytics()]);
      setSummary(progress);
      setExamAnalytics(exams);
      setCourseAnalytics(course);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Reading your progress…" /></ScreenContainer>;
  if (error || !summary || !profile) {
    return (
      <ScreenContainer>
        <EmptyState title="Progress could not be loaded" message="Your attempts are still saved locally." symbol="!" />
        <AppButton label="Try again" onPress={() => void load()} />
      </ScreenContainer>
    );
  }

  const totalItems = Object.values(summary.statusCounts).reduce((sum, count) => sum + count, 0);
  const weakAreas = profile.assessmentResult?.weakAreas ?? [];

  return (
    <ScreenContainer>
      <PageHeader eyebrow="Your local record" title="Progress" subtitle="A practical view of what is becoming reliable." />

      <Card style={[styles.assessment, { backgroundColor: theme.primarySoft }]}>
        <View style={styles.assessmentTop}>
          <View style={styles.flex}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>INITIAL ASSESSMENT</ThemedText>
            <ThemedText type="heading">{profile.learnerLevel ?? 'Not completed'}</ThemedText>
          </View>
          <ThemedText style={[styles.score, { color: theme.primary }]}>{profile.assessmentScore ?? 0}%</ThemedText>
        </View>
        <ProgressBar value={profile.assessmentScore ?? 0} accessibilityLabel="Assessment score" />
      </Card>

      <SectionHeading title="Items by status" detail={`${totalItems} curriculum items`} />
      <Card>
        {(Object.keys(summary.statusCounts) as MasteryStatus[]).map((status) => {
          const count = summary.statusCounts[status];
          return (
            <View key={status} style={styles.statusRow}>
              <View style={styles.rowLabel}>
                <ThemedText type="smallBold">{statusLabels[status]}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{count}</ThemedText>
              </View>
              <ProgressBar value={totalItems ? (count / totalItems) * 100 : 0} accessibilityLabel={`${statusLabels[status]} items`} />
            </View>
          );
        })}
      </Card>

      <SectionHeading title="Mastered foundations" />
      <View style={styles.masteryCards}>
        {(['vocabulary', 'kanji', 'grammar'] as const).map((type) => (
          <Card key={type} style={styles.masteryCard}>
            <ThemedText style={[styles.masteryNumber, { color: theme.success }]}>{summary.masteredByType[type]}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </ThemedText>
          </Card>
        ))}
      </View>

      <SectionHeading title="Review system" detail={`${summary.scheduler.estimatedStudyMinutes} min queued`} />
      <Card>
        <View style={styles.reviewMetrics}>
          <View style={styles.reviewMetric}><ThemedText type="heading">{summary.scheduler.reviewsToday}</ThemedText><ThemedText type="small" themeColor="textSecondary">Today</ThemedText></View>
          <View style={styles.reviewMetric}><ThemedText type="heading">{summary.scheduler.averageAccuracy}%</ThemedText><ThemedText type="small" themeColor="textSecondary">Accuracy</ThemedText></View>
          <View style={styles.reviewMetric}><ThemedText type="heading">{summary.scheduler.retention}%</ThemedText><ThemedText type="small" themeColor="textSecondary">Retention</ThemedText></View>
        </View>
        <ThemedText themeColor="textSecondary">{summary.scheduler.currentStreak}-day current streak · {summary.scheduler.longestStreak}-day best · {summary.scheduler.matureCards} mature cards</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{summary.scheduler.reviewsThisWeek} reviews this week · {summary.scheduler.reviewsThisMonth} this month · {summary.scheduler.dueTomorrow} due tomorrow</ThemedText>
      </Card>

      <SectionHeading title="Mock exam trend" />
      <Card>
        <ThemedText type="heading">{examAnalytics?.completedMocks ? `${examAnalytics.averageMockScore ?? 0}% average mock score` : 'No mock exams yet'}</ThemedText>
        <ThemedText themeColor="textSecondary">{examAnalytics?.completedMocks ? `Best ${examAnalytics.highestMockScore ?? 0}% · ${examAnalytics.improvement === undefined ? 'first baseline' : `${examAnalytics.improvement >= 0 ? '+' : ''}${examAnalytics.improvement}% over time`} · strongest ${examAnalytics.strongestSection ?? '—'} · weakest ${examAnalytics.weakestSection ?? '—'}` : 'Mock-exam analytics will appear after your first completed exam.'}</ThemedText>
      </Card>

      <SectionHeading title="Course workbook skills" />
      <Card>
        <ThemedText type="heading">{courseAnalytics?.firstAttemptAccuracy === undefined ? 'No guided-course answers yet' : `${courseAnalytics.firstAttemptAccuracy}% first attempt · ${courseAnalytics.correctedAccuracy ?? 0}% after correction`}</ThemedText>
        <ThemedText themeColor="textSecondary">Transformations {courseAnalytics?.transformationAccuracy ?? '—'}% · conjugation {courseAnalytics?.conjugationAccuracy ?? '—'}% · reading {courseAnalytics?.readingAccuracy ?? '—'}% · listening {courseAnalytics?.listeningAccuracy ?? '—'}% · {courseAnalytics?.productionAttempts ?? 0} production attempts</ThemedText>
      </Card>

      <SectionHeading title="Weak areas" />
      <Card>
        <ThemedText type="heading">
          {weakAreas.length
            ? weakAreas.map((area) => area.charAt(0).toUpperCase() + area.slice(1)).join(' · ')
            : 'No major gaps identified'}
        </ThemedText>
        <ThemedText themeColor="textSecondary">
          {summary.weakCount} individual curriculum {summary.weakCount === 1 ? 'item needs' : 'items need'} focused practice.
        </ThemedText>
      </Card>

      <SectionHeading title="Recent attempts" />
      {summary.recentAttempts.length ? (
        <Card>
          {summary.recentAttempts.map((attempt, attemptIndex) => (
            <View
              key={attempt.id}
              style={[
                styles.attempt,
                attemptIndex < summary.recentAttempts.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 },
              ]}>
              <View style={styles.flex}>
                <ThemedText type="smallBold">{attempt.itemTitle ?? 'Curriculum item'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {attempt.mode.charAt(0).toUpperCase() + attempt.mode.slice(1)} · {Math.max(1, Math.round(attempt.responseTimeMs / 1000))}s
                </ThemedText>
              </View>
              <ThemedText type="smallBold" style={{ color: attempt.correct ? theme.success : theme.error }}>
                {attempt.correct ? 'Correct' : 'Review'}
              </ThemedText>
            </View>
          ))}
        </Card>
      ) : (
        <EmptyState title="No attempts yet" message="Your recent answers will appear here." />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  assessment: { padding: Spacing.four },
  assessmentTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
  score: { fontSize: 38, lineHeight: 46, fontWeight: '800' },
  statusRow: { gap: Spacing.one, paddingVertical: 3 },
  rowLabel: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  masteryCards: { flexDirection: 'row', gap: Spacing.two },
  masteryCard: { flex: 1, minWidth: 0, padding: 12 },
  masteryNumber: { fontSize: 30, lineHeight: 36, fontWeight: '800' },
  reviewMetrics: { flexDirection: 'row', gap: Spacing.two },
  reviewMetric: { flex: 1, minWidth: 0, gap: 2 },
  attempt: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
});
