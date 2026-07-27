import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getStudySessionResult } from '@/services/database/vocabulary-repository';
import type { StudySessionResult } from '@/types/study';

export default function SessionResultsScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const [result, setResult] = useState<StudySessionResult>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setResult(sessionId ? await getStudySessionResult(sessionId) : undefined);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Calculating your result…" /></ScreenContainer>;
  if (!result) {
    return (
      <ScreenContainer contentStyle={styles.centered}>
        <EmptyState title="Result unavailable" message="Your saved attempts remain on this device." symbol="!" />
        <AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn')} />
      </ScreenContainer>
    );
  }
  return (
    <ScreenContainer contentStyle={styles.content}>
      <ThemedText type="smallBold" themeColor="primary">SESSION COMPLETE</ThemedText>
      <ThemedText type="title">Nice focused work.</ThemedText>
      <Card>
        <View style={styles.scoreRow}>
          <ThemedText style={styles.score}>{result.percentage}%</ThemedText>
          <ThemedText type="heading">{result.correctCount} / {result.totalQuestions}</ThemedText>
        </View>
        <ProgressBar value={result.percentage} accessibilityLabel="Vocabulary session score" />
        <ThemedText themeColor="textSecondary">Your answers updated the local review schedule immediately.</ThemedText>
      </Card>
      <AppButton label="Continue learning" onPress={() => router.replace('/(tabs)/learn')} />
      <AppButton label="View progress" variant="secondary" onPress={() => router.replace('/(tabs)/progress')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center' },
  content: { justifyContent: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  score: { fontSize: 52, lineHeight: 60, fontWeight: '800' },
});
