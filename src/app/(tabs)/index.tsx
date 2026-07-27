import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

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
import { useAppStore } from '@/store/app-store';
import type { ProgressSummary } from '@/types/learning';

export default function HomeScreen() {
  const theme = useTheme();
  const profile = useAppStore((state) => state.profile);
  const [summary, setSummary] = useState<ProgressSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      setSummary(await getProgressSummary());
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
            <ThemedText type="subtitle">
              {assessed ? (summary.weakCount ? 'Strengthen a weak area' : 'Build your N5 rhythm') : 'Find your starting point'}
            </ThemedText>
          </View>
          <View style={[styles.minutes, { backgroundColor: theme.surface }]}>
            <ThemedText type="heading" style={{ color: theme.primary }}>{assessed ? profile.dailyGoalMinutes : 10}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">min</ThemedText>
          </View>
        </View>
        <ThemedText themeColor="textSecondary">
          {assessed
            ? `${summary.weakCount} weak and ${summary.dueCount} due items will shape your next session.`
            : 'A short 20-question check will create your first local learning plan.'}
        </ThemedText>
        <AppButton
          label={actionLabel}
          onPress={() => router.push(assessed ? '/(tabs)/learn' : '/assessment')}
        />
      </Card>

      <View style={styles.stats}>
        <Card style={styles.statCard}>
          <ThemedText style={[styles.statValue, { color: theme.warning }]}>{summary.dueCount}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Due reviews</ThemedText>
        </Card>
        <Card style={styles.statCard}>
          <ThemedText style={[styles.statValue, { color: theme.error }]}>{summary.weakCount}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Weak items</ThemedText>
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
        <ThemedText themeColor="textSecondary">Your plan favours weak and overdue N5 items while keeping practice manageable.</ThemedText>
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
  statCard: { flex: 1, minWidth: 0, padding: 12 },
  statValue: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  progressLabel: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
});
