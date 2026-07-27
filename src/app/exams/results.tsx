import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getPracticeResult } from '@/services/database/exam-repository';
import type { PracticeResult } from '@/types/exam';

export default function ExamResultsScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId?: string }>(); const [result, setResult] = useState<PracticeResult>(); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setResult(sessionId ? await getPracticeResult(sessionId) : undefined); } finally { setLoading(false); } }, [sessionId]); useFocusEffect(useCallback(() => { void load(); }, [load]));
  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Calculating your result…" /></ScreenContainer>;
  if (!result) return <ScreenContainer contentStyle={styles.centered}><EmptyState title="Result unavailable" message="Your saved exam remains on this device." symbol="!" /><AppButton label="Back to practice" onPress={() => router.replace('/exams' as Href)} /></ScreenContainer>;
  const answers = new Map(result.session.answers.map((answer) => [answer.questionId, answer]));
  return <ScreenContainer><ThemedText type="smallBold" themeColor="primary">{result.session.selection.kind === 'practice' ? 'PRACTICE COMPLETE' : 'MOCK EXAM COMPLETE'}</ThemedText><ThemedText type="title">{result.percentage}%</ThemedText><Card><View style={styles.scoreRow}><ThemedText type="heading">{result.correctCount} correct</ThemedText><ThemedText type="heading">{result.incorrectCount} incorrect</ThemedText></View><ProgressBar value={result.percentage} accessibilityLabel="Overall score" /><ThemedText themeColor="textSecondary">{Math.floor(result.timeTakenSeconds / 60)}m {result.timeTakenSeconds % 60}s · {result.unansweredCount} unanswered</ThemedText></Card>
    <SectionHeading title="Section scores" />{result.sectionScores.map((section) => <Card key={section.key}><View style={styles.scoreRow}><ThemedText type="smallBold">{section.key[0].toUpperCase() + section.key.slice(1)}</ThemedText><ThemedText type="smallBold">{section.percentage}% · {section.correct}/{section.total}</ThemedText></View><ProgressBar value={section.percentage} accessibilityLabel={`${section.key} score`} /></Card>)}
    <SectionHeading title="Review every question" />{result.session.questions.map((question, index) => { const answer = answers.get(question.id); return <Card key={question.id}><ThemedText type="smallBold">{index + 1}. {question.domain}</ThemedText><ThemedText>{question.prompt}</ThemedText><ThemedText themeColor={answer?.correct ? 'success' : 'error'}>{answer?.correct ? 'Correct' : `Your answer: ${question.options.find((option) => option.id === answer?.selectedOptionId)?.label ?? 'Unanswered'}`}</ThemedText><ThemedText type="smallBold">Correct: {question.options.find((option) => option.id === question.correctOptionId)?.label}</ThemedText>{question.explanation ? <ThemedText themeColor="textSecondary">{question.explanation}</ThemedText> : null}<AppButton label="Open lesson" variant="quiet" onPress={() => router.push(`/${question.domain}/${encodeURIComponent(question.itemId)}` as Href)} /></Card>; })}
    {result.recommendedItemIds.length ? <><SectionHeading title="Recommended lessons" detail={`${result.recommendedItemIds.length} to revisit`} /><AppButton label="Open mistake notebook" variant="secondary" onPress={() => router.push('/exams/mistakes' as Href)} /></> : null}<AppButton label="Practice again" onPress={() => router.replace('/exams' as Href)} /><AppButton label="Exam history" variant="quiet" onPress={() => router.push('/exams/history' as Href)} /></ScreenContainer>;
}
const styles = StyleSheet.create({ centered: { justifyContent: 'center' }, scoreRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two } });
