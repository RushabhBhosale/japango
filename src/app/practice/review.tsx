import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getPracticeDashboard } from '@/services/database/google-practice-repository';
import type { PracticeDashboard } from '@/types/google-practice';

function SectionRule({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.ruled, { borderColor: theme.border }]}>{children}</View>;
}

export default function PracticeReviewScreen() {
  const theme = useTheme();
  const [dashboard, setDashboard] = useState<PracticeDashboard>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try { setDashboard(await getPracticeDashboard()); } catch { setError('Conversation insights could not be opened.'); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!dashboard && !error) return <ScreenContainer scroll={false}><LoadingState label="Gathering conversation insights…" /></ScreenContainer>;

  return (
    <ScreenContainer>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to ChatGPT Practice" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && { backgroundColor: theme.backgroundSelected }]}>
        <Ionicons name="arrow-back" size={20} color={theme.primary} />
        <ThemedText type="smallBold" style={{ color: theme.primary }}>ChatGPT Practice</ThemedText>
      </Pressable>
      <View style={styles.header}>
        <ThemedText type="metadata" style={{ color: theme.primary }}>From your conversations</ThemedText>
        <ThemedText type="title">What your practice is showing</ThemedText>
        <ThemedText themeColor="textSecondary">Corrections become useful evidence only when patterns repeat. One-off mistakes stay in context without defining your ability.</ThemedText>
      </View>

      {error || !dashboard ? (
        <EmptyState title="Insights are unavailable" message={error ?? 'Try again from ChatGPT Practice.'} symbol="!" />
      ) : dashboard.sessionCount === 0 ? (
        <EmptyState title="No conversations imported yet" message="Sync your selected Practice Log to build this review." symbol="話" />
      ) : (
        <>
          <Card variant="accent">
            <ThemedText type="metadata" style={{ color: theme.primary }}>Improvement over time</ThemedText>
            <ThemedText type="display">{dashboard.improvingSkillCount}</ThemedText>
            <ThemedText themeColor="textSecondary">areas now have repeated successful-use evidence.</ThemedText>
          </Card>

          <View style={styles.section}>
            <SectionHeading title="Recent mistakes" detail="Correction history" />
            <SectionRule>
              {dashboard.recentMistakes.slice(0, 8).map((mistake, index) => (
                <View key={mistake.id} style={[styles.entry, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
                  <View style={styles.entryMeta}>
                    <ThemedText type="metadata" style={{ color: theme.primary }}>{mistake.category}</ThemedText>
                    {mistake.frequency > 1 ? <ThemedText type="metadata" themeColor="textSecondary">Seen {mistake.frequency}×</ThemedText> : null}
                  </View>
                  <ThemedText type="japanese">{mistake.original}</ThemedText>
                  <View style={[styles.correction, { backgroundColor: theme.primarySoft }]}>
                    <Ionicons name="arrow-forward" size={17} color={theme.primary} />
                    <ThemedText type="japanese" style={[styles.correctionText, { color: theme.primary }]}>{mistake.corrected}</ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">{mistake.explanation}</ThemedText>
                </View>
              ))}
            </SectionRule>
          </View>

          <View style={styles.section}>
            <SectionHeading title="Recurring weaknesses" detail="Repeated evidence only" />
            <SectionRule>
              {dashboard.recurringWeaknesses.length ? dashboard.recurringWeaknesses.map((skill, index) => (
                <View key={`${skill.type}:${skill.key}`} style={[styles.skill, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
                  <View style={styles.skillHeading}>
                    <View style={styles.skillCopy}>
                      <ThemedText type="smallBold">{skill.key}</ThemedText>
                      <ThemedText type="metadata" themeColor="textSecondary">{skill.type} · {skill.mistakes} corrections</ThemedText>
                    </View>
                    <ThemedText type="smallBold" style={{ color: theme.primary }}>{Math.round(skill.mastery * 100)}%</ThemedText>
                  </View>
                  <ProgressBar value={skill.mastery * 100} accessibilityLabel={`${skill.key} mastery ${Math.round(skill.mastery * 100)} percent`} />
                </View>
              )) : <ThemedText themeColor="textSecondary" style={styles.emptyLine}>No repeated weaknesses yet.</ThemedText>}
            </SectionRule>
          </View>

          <View style={styles.section}>
            <SectionHeading title="Words discovered" detail="From real conversation" />
            <SectionRule>
              {dashboard.learnedVocabulary.length ? dashboard.learnedVocabulary.map((word, index) => (
                <View key={`${word.word}:${word.reading}`} style={[styles.wordRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
                  <View style={styles.wordJapanese}>
                    <ThemedText type="cardTitle">{word.word}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.primary }}>{word.reading}</ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.wordMeaning}>{word.meaning}</ThemedText>
                </View>
              )) : <ThemedText themeColor="textSecondary" style={styles.emptyLine}>No new words have been identified yet.</ThemedText>}
            </SectionRule>
          </View>

          <View style={styles.section}>
            <SectionHeading title="Grammar needing review" />
            <View style={styles.reviewList}>
              {dashboard.suggestedReview.length ? dashboard.suggestedReview.map((suggestion) => (
                <View key={suggestion} style={styles.reviewItem}>
                  <View style={[styles.reviewDot, { backgroundColor: theme.primary }]} />
                  <ThemedText style={styles.reviewText}>{suggestion}</ThemedText>
                </View>
              )) : <ThemedText themeColor="textSecondary">No focused review suggestions yet.</ThemedText>}
            </View>
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: Radius.small, flexDirection: 'row', gap: Spacing.two, minHeight: 44, paddingHorizontal: Spacing.two },
  header: { gap: Spacing.two },
  section: { gap: Spacing.three },
  ruled: { borderBottomWidth: 1, borderTopWidth: 1 },
  entry: { gap: Spacing.two, paddingVertical: Spacing.three },
  entryMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minWidth: 0 },
  correction: { alignItems: 'center', borderRadius: Radius.small, flexDirection: 'row', gap: Spacing.two, padding: Spacing.twoHalf },
  correctionText: { flex: 1, minWidth: 0 },
  skill: { gap: Spacing.two, paddingVertical: Spacing.three },
  skillHeading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, minWidth: 0 },
  skillCopy: { flex: 1, gap: Spacing.one, minWidth: 0 },
  wordRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, minWidth: 0, paddingVertical: Spacing.three },
  wordJapanese: { flex: 1, gap: Spacing.one, minWidth: 0 },
  wordMeaning: { flex: 1, minWidth: 0, textAlign: 'right' },
  reviewList: { gap: Spacing.three },
  reviewItem: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.three, minWidth: 0 },
  reviewDot: { borderRadius: Radius.pill, height: 7, marginTop: 9, width: 7 },
  reviewText: { flex: 1, minWidth: 0 },
  emptyLine: { paddingVertical: Spacing.three },
});
