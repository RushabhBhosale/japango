import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getUnitReviewQuestions, submitUnitReview } from '@/services/database/course-repository';
import type { CourseCheckpointResult, CourseQuestion } from '@/types/course';

export default function UnitReviewScreen() {
  const { unitId } = useLocalSearchParams<{ unitId?: string }>();
  const [questions, setQuestions] = useState<CourseQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | undefined>>({});
  const [result, setResult] = useState<CourseCheckpointResult>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const load = useCallback(async () => { setError(false); try { setQuestions(unitId ? await getUnitReviewQuestions(unitId) : []); } catch { setError(true); } finally { setLoading(false); } }, [unitId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const submit = async () => { if (!unitId) return; setSaving(true); try { setResult(await submitUnitReview(unitId, answers)); } catch { setError(true); } finally { setSaving(false); } };
  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Preparing unit review…" /></ScreenContainer>;
  if (error || !questions.length) return <ScreenContainer><EmptyState title="Unit review unavailable" message="Attempt each lesson in this unit first, then return here for a cumulative review." symbol="!" /><AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn' as Href)} /></ScreenContainer>;
  return <ScreenContainer><PageHeader eyebrow="Cumulative review" title="Unit review" subtitle="This uses only content already introduced in the unit." />
    {questions.map((question, index) => <Card key={question.id} style={styles.question}><ThemedText type="smallBold">{index + 1}. {question.prompt}</ThemedText>{question.options.map((option) => <AppButton key={option.id} label={option.label} variant={answers[question.id] === option.id ? 'primary' : 'secondary'} onPress={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))} />)}</Card>)}
    {result ? <Card><ThemedText type="heading">{result.score}% · {result.classification.replaceAll('_', ' ')}</ThemedText><ThemedText themeColor="textSecondary">{result.weakItemIds.length ? `Your weak items were saved to the usual review systems.` : 'No weak items were identified in this attempt.'}</ThemedText><AppButton label="Back to course" onPress={() => router.replace('/(tabs)/learn' as Href)} /></Card> : <AppButton label={`Finish unit review (${Object.keys(answers).length}/${questions.length})`} loading={saving} disabled={Object.keys(answers).length !== questions.length} onPress={() => void submit()} />}
  </ScreenContainer>;
}

const styles = StyleSheet.create({ question: { gap: Spacing.two } });
