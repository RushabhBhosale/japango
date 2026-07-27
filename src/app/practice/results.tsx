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
import { getContentStudyResult } from '@/services/database/content-learning-repository';
import type { ContentStudyResult } from '@/types/content-learning';

export default function ContentResultsScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>(); const [result, setResult] = useState<ContentStudyResult>(); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setResult(sessionId ? await getContentStudyResult(sessionId) : undefined); } finally { setLoading(false); } }, [sessionId]); useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Calculating your result…" /></ScreenContainer>;
  if (!result) return <ScreenContainer contentStyle={styles.centered}><EmptyState title="Result unavailable" message="Your saved attempts remain on this device." symbol="!" /><AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn')} /></ScreenContainer>;
  return <ScreenContainer contentStyle={styles.centered}><ThemedText type="smallBold" themeColor="primary">SESSION COMPLETE</ThemedText><ThemedText type="title">Nice focused work.</ThemedText><Card><View style={styles.row}><ThemedText style={styles.score}>{result.percentage}%</ThemedText><ThemedText type="heading">{result.correctCount} / {result.totalQuestions}</ThemedText></View><ProgressBar value={result.percentage} accessibilityLabel="Lesson score" /><ThemedText themeColor="textSecondary">Your local progress has been updated.</ThemedText></Card><AppButton label="Continue learning" onPress={() => router.replace('/(tabs)/learn')} /><AppButton label="View progress" variant="secondary" onPress={() => router.replace('/(tabs)/progress')} /></ScreenContainer>;
}
const styles = StyleSheet.create({ centered: { justifyContent: 'center' }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three }, score: { fontSize: 52, lineHeight: 60, fontWeight: '800' } });
