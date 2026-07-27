import { StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

function formatCategory(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function AssessmentResultScreen() {
  const theme = useTheme();
  const profile = useAppStore((state) => state.profile);
  const result = profile?.assessmentResult;

  if (!profile?.assessmentCompleted || !result) return <Redirect href="/assessment" />;

  return (
    <ScreenContainer>
      <View style={styles.hero}>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>YOUR STARTING POINT</ThemedText>
        <ThemedText type="title">A clear path forward.</ThemedText>
        <ThemedText themeColor="textSecondary">
          This is a starting snapshot, not a label. JapanGo will keep adapting as you practise.
        </ThemedText>
      </View>

      <Card style={[styles.scoreCard, { backgroundColor: theme.primarySoft }]}>
        <View style={styles.scoreRow}>
          <View>
            <ThemedText type="smallBold" themeColor="textSecondary">OVERALL SCORE</ThemedText>
            <ThemedText style={[styles.score, { color: theme.primary }]}>{result.overallScore}%</ThemedText>
          </View>
          <ThemedText type="heading" style={styles.level}>{result.learnerLevel}</ThemedText>
        </View>
        <ProgressBar value={result.overallScore} accessibilityLabel="Overall assessment score" />
        <ThemedText themeColor="textSecondary">
          {result.totalCorrect} of {result.totalQuestions} questions correct
        </ThemedText>
      </Card>

      <SectionHeading title="Skill breakdown" />
      <Card>
        {result.categoryScores.map((score) => (
          <View key={score.category} style={styles.category}>
            <View style={styles.categoryLabel}>
              <ThemedText type="smallBold">{formatCategory(score.category)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{score.correct}/{score.total} · {score.percentage}%</ThemedText>
            </View>
            <ProgressBar value={score.percentage} accessibilityLabel={`${score.category} score`} />
          </View>
        ))}
      </Card>

      <View style={styles.twoColumns}>
        <Card style={styles.column}>
          <ThemedText type="smallBold" style={{ color: theme.success }}>STRONG AREAS</ThemedText>
          <ThemedText>{result.strongAreas.length ? result.strongAreas.map(formatCategory).join(' · ') : 'Still emerging'}</ThemedText>
        </Card>
        <Card style={styles.column}>
          <ThemedText type="smallBold" style={{ color: theme.warning }}>FOCUS AREAS</ThemedText>
          <ThemedText>{result.weakAreas.length ? result.weakAreas.map(formatCategory).join(' · ') : 'No major gaps'}</ThemedText>
        </Card>
      </View>

      <Card style={{ borderColor: theme.primary }}>
        <ThemedText type="heading">Recommended path</ThemedText>
        <ThemedText>{result.recommendedPath}</ThemedText>
      </Card>

      <AppButton label="Go to my learning plan" onPress={() => router.replace('/(tabs)')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: { gap: Spacing.two },
  scoreCard: { padding: Spacing.four },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  score: { fontSize: 52, lineHeight: 60, fontWeight: '800' },
  level: { flex: 1, textAlign: 'right' },
  category: { gap: Spacing.one, paddingVertical: Spacing.one },
  categoryLabel: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  twoColumns: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  column: { flex: 1, minWidth: 150, borderRadius: Radius.medium },
});
