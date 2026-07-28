import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { QuestionOption } from '@/components/quiz/question-option';
import { AiTeacherCard } from '@/components/lesson/ai-teacher-card';
import { JapaneseText } from '@/components/lesson/japanese-text';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { advanceContentSession, answerContentSessionQuestion, getContentSession } from '@/services/database/content-learning-repository';
import type { ContentStudySession } from '@/types/content-learning';

export default function ContentPracticeScreen() {
  const theme = useTheme(); const { sessionId } = useLocalSearchParams<{ sessionId?: string }>();
  const [session, setSession] = useState<ContentStudySession>(); const [loading, setLoading] = useState(true); const [failed, setFailed] = useState(false); const [selection, setSelection] = useState<{ questionId: string; optionId: string }>(); const [saving, setSaving] = useState(false); const startedAt = useRef<number | undefined>(undefined); const startedQuestion = useRef<string | undefined>(undefined);
  const load = useCallback(async () => { try { setSession(sessionId ? await getContentSession(sessionId) : undefined); } catch { setFailed(true); } finally { setLoading(false); } }, [sessionId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const question = session?.questions[session.currentIndex]; const attempt = question ? session?.attempts.find((item) => item.questionId === question.id) : undefined;
  const confirm = async () => { const optionId = selection && selection.questionId === question?.id ? selection.optionId : undefined; if (!session || !question || !optionId) return; setSaving(true); try { setSession(await answerContentSessionQuestion(session.id, optionId, Date.now() - (startedQuestion.current === question.id ? startedAt.current ?? Date.now() : Date.now()))); } catch { setFailed(true); } finally { setSaving(false); } };
  const next = async () => { if (!session) return; setSaving(true); try { const updated = await advanceContentSession(session.id); if (updated.status === 'completed') { router.replace(`/practice/results?sessionId=${encodeURIComponent(updated.id)}` as Href); return; } setSelection(undefined); setSession(updated); } catch { setFailed(true); } finally { setSaving(false); } };
  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening practice…" /></ScreenContainer>;
  if (!session || !question || failed) return <ScreenContainer contentStyle={styles.centered}><EmptyState title="Practice session unavailable" message="Any saved answers remain on this device." symbol="!" /><AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn')} /></ScreenContainer>;
  const selected = selection && selection.questionId === question.id ? selection.optionId : undefined; const resolved = attempt?.selectedAnswer ?? selected; const progress = ((session.currentIndex + (attempt ? 1 : 0)) / session.questions.length) * 100;
  return <ScreenContainer>
    <View style={styles.topRow}><View><ThemedText type="smallBold">{session.type} practice</ThemedText><ThemedText type="small" themeColor="textSecondary">Question {session.currentIndex + 1} of {session.questions.length}</ThemedText></View><AppButton label="Save & leave" variant="quiet" onPress={() => router.back()} /></View>
    <ProgressBar value={progress} accessibilityLabel="Lesson practice progress" /><Card><ThemedText type="smallBold" themeColor="primary">{question.presentation.replaceAll('-', ' ').toUpperCase()}</ThemedText><JapaneseText type="heading">{question.prompt}</JapaneseText></Card>
    <View accessibilityRole="radiogroup" style={styles.options}>{question.options.map((option) => <QuestionOption key={option.id} label={option.label} selected={option.id === resolved} correctness={attempt ? option.id === question.correctOptionId ? 'correct' : option.id === resolved ? 'incorrect' : undefined : undefined} disabled={Boolean(attempt)} onPress={() => { if (startedQuestion.current !== question.id) { startedQuestion.current = question.id; startedAt.current = Date.now(); } setSelection({ questionId: question.id, optionId: option.id }); }} />)}</View>
    {attempt ? <Card style={{ backgroundColor: attempt.correct ? theme.successSoft : theme.errorSoft }}><ThemedText type="heading">{attempt.correct ? 'Correct' : 'Not quite'}</ThemedText><JapaneseText>{question.explanation ?? 'The correct answer is highlighted above.'}</JapaneseText></Card> : null}
    {attempt && !attempt.correct ? <AiTeacherCard feature="explain_mistake" label="Explain my mistake" context={{ learnerLevel: question.level, item: { id: question.itemId, type: question.domain, title: question.prompt }, question: { prompt: question.prompt, userAnswer: attempt.selectedAnswer, correctAnswer: question.correctOptionId, canonicalExplanation: question.explanation } }} /> : null}
    <AppButton label={attempt ? session.currentIndex === session.questions.length - 1 ? 'See results' : 'Next question' : 'Confirm answer'} disabled={!attempt && !selected} loading={saving} onPress={() => void (attempt ? next() : confirm())} />
  </ScreenContainer>;
}
const styles = StyleSheet.create({ centered: { justifyContent: 'center' }, topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two }, options: { gap: Spacing.two } });
