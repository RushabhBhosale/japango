import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { LoadingState } from '@/components/common/loading-state';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { getMockExam, getMockExamListening, getMockExamQuestion, getMockExamReading } from '@/features/mock-exam/mock-exam-catalog';
import { createMockExamAttempt, scoreMockExam } from '@/features/mock-exam/mock-exam-session';
import { useTheme } from '@/hooks/use-theme';
import { getMockExamAttempt, saveMockExamAttempt } from '@/services/database/mock-exam-repository';
import { speakJapanese, stopJapaneseSpeech } from '@/services/speech/japanese-speech';
import type { MockExamAttempt, MockExamDomain } from '@/types/mock-exam';

const sectionInstruction: Record<MockExamDomain, string> = {
  vocabulary: '問題　ことばについて、いちばん いい ものを 一つ えらんでください。',
  kanji: '問題　下線の ことばは どう 読みますか。',
  grammar: '問題　（　）に 入る いちばん いい ものを 一つ えらんでください。',
  reading: '問題　文章を 読んで、しつもんに こたえてください。',
  listening: '問題　話を 聞いて、いちばん いい ものを 一つ えらんでください。',
};

function clock(seconds: number): string { return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`; }

export default function MockExamScreen() {
  const theme = useTheme();
  const { examId } = useLocalSearchParams<{ examId: string }>();
  const exam = getMockExam(examId);
  const placements = useMemo(() => exam ? [...exam.placements].sort((a, b) => a.position - b.position) : [], [exam]);
  const [attempt, setAttempt] = useState<MockExamAttempt>();
  const [loaded, setLoaded] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const timerIsActive = Boolean(attempt && !attempt.paused && !attempt.completedAt);
  const timeLimitSeconds = (exam?.timing.totalMinutes ?? 0) * 60;

  useEffect(() => {
    if (!exam) return;
    let active = true;
    void getMockExamAttempt(exam.id).then((saved) => {
      if (active) setAttempt(saved?.completedAt ? createMockExamAttempt(exam.id) : saved ?? createMockExamAttempt(exam.id));
    }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; void stopJapaneseSpeech(); };
  }, [exam]);

  useEffect(() => {
    if (!timerIsActive) return;
    const timer = setInterval(() => setAttempt((current) => {
      if (!current) return current;
      const elapsedSeconds = current.elapsedSeconds + 1;
      return timeLimitSeconds > 0 && elapsedSeconds >= timeLimitSeconds
        ? { ...current, elapsedSeconds, completedAt: new Date().toISOString(), paused: true }
        : { ...current, elapsedSeconds };
    }), 1000);
    return () => clearInterval(timer);
  }, [timeLimitSeconds, timerIsActive]);

  useEffect(() => { if (attempt) void saveMockExamAttempt(attempt); }, [attempt]);

  if (!exam) return <ScreenContainer><ThemedText>この 模擬試験を 開くことが できません。</ThemedText><AppButton label="模擬試験へ 戻る" onPress={() => router.replace('/(tabs)/exams')} /></ScreenContainer>;
  if (!loaded || !attempt) return <ScreenContainer scroll={false}><LoadingState label="模擬試験を 準備しています…" /></ScreenContainer>;
  if (attempt.completedAt) return <ExamResults examId={exam.id} attempt={attempt} />;

  const placement = placements[attempt.questionIndex];
  const question = placement ? getMockExamQuestion(placement.questionId) : undefined;
  if (!placement || !question) return <ScreenContainer><ThemedText>問題を 読み込むことが できません。</ThemedText></ScreenContainer>;
  const section = exam.sections.find((value) => value.id === placement.sectionId);
  const reading = placement.parentType === 'reading-passage' ? getMockExamReading(placement.parentId ?? '') : undefined;
  const listening = placement.parentType === 'listening-activity' ? getMockExamListening(placement.parentId ?? '') : undefined;
  const remaining = Math.max(0, (exam.timing.totalMinutes ?? 0) * 60 - attempt.elapsedSeconds);
  const selected = attempt.selectedAnswers[question.id];
  const update = (patch: Partial<MockExamAttempt>) => setAttempt((current) => current ? { ...current, ...patch } : current);
  const choose = (choiceId: string) => update({ selectedAnswers: { ...attempt.selectedAnswers, [question.id]: choiceId } });
  const submit = () => Alert.alert('提出しますか', '答えと説明は、このあと結果画面で確認できます。', [{ text: '続ける', style: 'cancel' }, { text: '提出する', onPress: () => update({ completedAt: new Date().toISOString(), paused: true }) }]);

  return (
    <ScreenContainer contentStyle={styles.screen}>
      <View style={styles.topRow}><Pressable accessibilityRole="button" accessibilityLabel="Pause mock exam" onPress={() => update({ paused: !attempt.paused })} style={[styles.iconButton, { borderColor: theme.border, backgroundColor: theme.surface }]}><Ionicons name={attempt.paused ? 'play-outline' : 'pause-outline'} color={theme.primary} size={22} /></Pressable><View style={styles.timer}><ThemedText type="smallBold">{exam.timing.totalMinutes ? clock(remaining) : clock(attempt.elapsedSeconds)}</ThemedText><ThemedText type="small" themeColor="textSecondary">{attempt.questionIndex + 1} / {placements.length}</ThemedText></View><Pressable accessibilityRole="button" accessibilityLabel="Submit mock exam" onPress={submit} style={[styles.submitButton, { borderColor: theme.border }]}><ThemedText type="smallBold" style={{ color: theme.primary }}>提出</ThemedText></Pressable></View>
      <Card><ThemedText type="smallBold" themeColor="primary">{section?.title ?? 'JLPT Mock Exam'}</ThemedText><ThemedText type="small" themeColor="textSecondary">{sectionInstruction[question.domain]}</ThemedText></Card>
      {reading ? <Card><ThemedText type="smallBold">{reading.title}</ThemedText><ThemedText type="japanese">{reading.japanese}</ThemedText></Card> : null}
      {listening ? <Card><ThemedText type="smallBold">{listening.title}</ThemedText><AppButton label="音声を 再生" variant="secondary" onPress={() => { setAudioError(false); void speakJapanese(listening.speechText).catch(() => setAudioError(true)); }} />{audioError ? <ThemedText type="small" themeColor="textSecondary">日本語の音声を再生できませんでした。端末の日本語音声を確認してください。</ThemedText> : null}</Card> : null}
      <View style={styles.question}><ThemedText type="smallBold" themeColor="textSecondary">問題 {placement.position}</ThemedText><ThemedText type="heading">{question.prompt}</ThemedText></View>
      <View style={styles.choices}>{question.choices.map((choice, index) => <Pressable key={choice.id} accessibilityRole="radio" accessibilityState={{ checked: selected === choice.id }} onPress={() => choose(choice.id)} style={[styles.choice, { borderColor: selected === choice.id ? theme.primary : theme.border, backgroundColor: selected === choice.id ? theme.primarySoft : theme.surface }]}><ThemedText type="smallBold" style={{ color: theme.primary }}>{index + 1}</ThemedText><ThemedText style={styles.choiceText}>{choice.text}</ThemedText></Pressable>)}</View>
      <View style={styles.navigation}><AppButton label="前へ" variant="secondary" disabled={attempt.questionIndex === 0} onPress={() => update({ questionIndex: attempt.questionIndex - 1 })} style={styles.navButton} /><AppButton label={attempt.questionIndex === placements.length - 1 ? '提出する' : '次へ'} disabled={!selected} onPress={attempt.questionIndex === placements.length - 1 ? submit : () => update({ questionIndex: attempt.questionIndex + 1 })} style={styles.navButton} /></View>
    </ScreenContainer>
  );
}

function ExamResults({ examId, attempt }: { examId: string; attempt: MockExamAttempt }) {
  const exam = getMockExam(examId)!;
  const result = scoreMockExam(attempt);
  const placements = [...exam.placements].sort((a, b) => a.position - b.position);
  return <ScreenContainer contentStyle={styles.screen}><Card><ThemedText type="smallBold" themeColor="primary">RESULT</ThemedText><ThemedText type="title">{result.percentage}%</ThemedText><ThemedText>{result.correct} / {result.total} correct</ThemedText><ThemedText themeColor="textSecondary">{clock(attempt.elapsedSeconds)} · {result.unanswered} unanswered</ThemedText></Card><Card>{result.sections.map((section) => <View key={section.title} style={styles.resultRow}><ThemedText>{section.title}</ThemedText><ThemedText type="smallBold">{section.correct} / {section.total}</ThemedText></View>)}</Card><ThemedText type="heading">Answers and review</ThemedText>{placements.map((placement) => { const question = getMockExamQuestion(placement.questionId)!; const answer = attempt.selectedAnswers[question.id]; const correct = answer === question.correctOptionId; return <Card key={question.id}><ThemedText type="smallBold" style={{ color: correct ? '#26745E' : '#B44C58' }}>問題 {placement.position} · {correct ? 'Correct' : 'Review'}</ThemedText><ThemedText>{question.prompt}</ThemedText><ThemedText themeColor="textSecondary">Your answer: {question.choices.find((choice) => choice.id === answer)?.text ?? '—'}</ThemedText><ThemedText>Correct answer: {question.choices.find((choice) => choice.id === question.correctOptionId)?.text}</ThemedText>{question.explanation ? <ThemedText themeColor="textSecondary">{question.explanation}</ThemedText> : null}<ThemedText type="small" themeColor="textSecondary">Related Japango content: {question.linkedItemIds.join(', ') || 'Available in your course'}</ThemedText></Card>; })}<AppButton label="Back to mock exams" onPress={() => router.replace('/(tabs)/exams')} /></ScreenContainer>;
}

const styles = StyleSheet.create({ screen: { gap: Spacing.three }, topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, iconButton: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, timer: { alignItems: 'center' }, submitButton: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, height: 44, justifyContent: 'center', paddingHorizontal: Spacing.three }, question: { gap: Spacing.two }, choices: { gap: Spacing.two }, choice: { alignItems: 'flex-start', borderRadius: Radius.medium, borderWidth: 1, flexDirection: 'row', gap: Spacing.two, minHeight: 58, padding: Spacing.three }, choiceText: { flex: 1 }, navigation: { flexDirection: 'row', gap: Spacing.two }, navButton: { flex: 1 }, resultRow: { flexDirection: 'row', justifyContent: 'space-between' } });
