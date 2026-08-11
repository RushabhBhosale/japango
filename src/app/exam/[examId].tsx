import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { LoadingState } from '@/components/common/loading-state';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { InteractiveJapaneseText } from '@/components/lesson/japanese-text';
import { ThemedText } from '@/components/themed-text';
import { Radius, ReadingContentWidth, Spacing } from '@/constants/theme';
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

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

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

  if (!exam) return <ScreenContainer><InteractiveJapaneseText>この 模擬試験を 開くことが できません。</InteractiveJapaneseText><AppButton label="模擬試験へ 戻る" onPress={() => router.replace('/(tabs)/exams')} /></ScreenContainer>;
  if (!loaded || !attempt) return <ScreenContainer scroll={false}><LoadingState label="模擬試験を 準備しています…" /></ScreenContainer>;
  if (attempt.completedAt) return <ExamResults examId={exam.id} attempt={attempt} />;

  const placement = placements[attempt.questionIndex];
  const question = placement ? getMockExamQuestion(placement.questionId) : undefined;
  if (!placement || !question) return <ScreenContainer><InteractiveJapaneseText>問題を 読み込むことが できません。</InteractiveJapaneseText></ScreenContainer>;
  const section = exam.sections.find((value) => value.id === placement.sectionId);
  const reading = placement.parentType === 'reading-passage' ? getMockExamReading(placement.parentId ?? '') : undefined;
  const listening = placement.parentType === 'listening-activity' ? getMockExamListening(placement.parentId ?? '') : undefined;
  const remaining = Math.max(0, timeLimitSeconds - attempt.elapsedSeconds);
  const selected = attempt.selectedAnswers[question.id];
  const update = (patch: Partial<MockExamAttempt>) => setAttempt((current) => current ? { ...current, ...patch } : current);
  const choose = (choiceId: string) => update({ selectedAnswers: { ...attempt.selectedAnswers, [question.id]: choiceId } });
  const submit = () => Alert.alert('提出しますか', '答えと説明は、このあと結果画面で確認できます。', [
    { text: '続ける', style: 'cancel' },
    { text: '提出する', onPress: () => update({ completedAt: new Date().toISOString(), paused: true }) },
  ]);
  const progressValue = ((attempt.questionIndex + 1) / placements.length) * 100;

  return (
    <ScreenContainer maxWidth={ReadingContentWidth} includeBottomSafeArea contentStyle={styles.screen}>
      <View style={styles.topRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={attempt.paused ? 'Resume mock exam' : 'Pause mock exam'} onPress={() => update({ paused: !attempt.paused })} style={[styles.iconButton, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Ionicons name={attempt.paused ? 'play-outline' : 'pause-outline'} color={theme.primary} size={22} />
        </Pressable>
        <View style={styles.timer}>
          <ThemedText type="metadata" themeColor="textSecondary">{exam.level} mock exam</ThemedText>
          <ThemedText type="heading">{exam.timing.totalMinutes ? clock(remaining) : clock(attempt.elapsedSeconds)}</ThemedText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Submit mock exam" onPress={submit} style={[styles.submitButton, { borderColor: theme.border }]}>
          <InteractiveJapaneseText type="smallBold" style={{ color: theme.primary }}>提出</InteractiveJapaneseText>
        </Pressable>
      </View>
      <View style={styles.examProgress}>
        <ThemedText type="small" themeColor="textSecondary">Question {attempt.questionIndex + 1} of {placements.length}</ThemedText>
        <ProgressBar value={progressValue} accessibilityLabel={`Question ${attempt.questionIndex + 1} of ${placements.length}`} />
      </View>

      <View style={[styles.instruction, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText type="metadata" style={{ color: theme.primary }}>{section?.title ?? 'JLPT mock exam'}</ThemedText>
        <InteractiveJapaneseText type="small" themeColor="textSecondary">{sectionInstruction[question.domain]}</InteractiveJapaneseText>
      </View>

      {reading ? (
        <View style={[styles.passage, { borderColor: theme.border }]}>
          <InteractiveJapaneseText type="cardTitle">{reading.title}</InteractiveJapaneseText>
          <InteractiveJapaneseText type="japaneseReading">{reading.japanese}</InteractiveJapaneseText>
        </View>
      ) : null}

      {listening ? (
        <View style={[styles.listening, { borderColor: theme.border }]}>
          <InteractiveJapaneseText type="cardTitle">{listening.title}</InteractiveJapaneseText>
          <AppButton label="音声を 再生" variant="secondary" onPress={() => {
            setAudioError(false);
            void speakJapanese(listening.speechText).catch(() => setAudioError(true));
          }} />
          {audioError ? <InteractiveJapaneseText type="small" themeColor="textSecondary">日本語の音声を再生できませんでした。端末の日本語音声を確認してください。</InteractiveJapaneseText> : null}
        </View>
      ) : null}

      <View style={styles.question}>
        <ThemedText type="metadata" themeColor="textSecondary">Question {placement.position}</ThemedText>
        <InteractiveJapaneseText type="section">{question.prompt}</InteractiveJapaneseText>
      </View>

      <View accessibilityRole="radiogroup" style={styles.choices}>
        {question.choices.map((choice, index) => (
          <Pressable
            key={choice.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === choice.id }}
            onPress={() => choose(choice.id)}
            style={[styles.choice, { borderColor: selected === choice.id ? theme.primary : theme.border, backgroundColor: selected === choice.id ? theme.primarySoft : theme.surface }]}
          >
            <View style={[styles.choiceNumber, { borderColor: selected === choice.id ? theme.primary : theme.border }]}>
              <ThemedText type="smallBold" style={{ color: theme.primary }}>{index + 1}</ThemedText>
            </View>
            <InteractiveJapaneseText style={styles.choiceText}>{choice.text}</InteractiveJapaneseText>
          </Pressable>
        ))}
      </View>

      <View style={styles.navigation}>
        <AppButton label="前へ" variant="secondary" disabled={attempt.questionIndex === 0} onPress={() => update({ questionIndex: attempt.questionIndex - 1 })} style={styles.navButton} />
        <AppButton label={attempt.questionIndex === placements.length - 1 ? '提出する' : '次へ'} disabled={!selected} onPress={attempt.questionIndex === placements.length - 1 ? submit : () => update({ questionIndex: attempt.questionIndex + 1 })} style={styles.navButton} />
      </View>
    </ScreenContainer>
  );
}

function ExamResults({ examId, attempt }: { examId: string; attempt: MockExamAttempt }) {
  const theme = useTheme();
  const exam = getMockExam(examId)!;
  const result = scoreMockExam(attempt);
  const placements = [...exam.placements].sort((a, b) => a.position - b.position);
  return (
    <ScreenContainer maxWidth={ReadingContentWidth} includeBottomSafeArea contentStyle={styles.screen}>
      <View style={[styles.resultHero, { borderColor: theme.primary }]}>
        <ThemedText type="metadata" style={{ color: theme.primary }}>Exam result</ThemedText>
        <ThemedText type="display">{result.percentage}%</ThemedText>
        <ThemedText type="heading">{result.correct} of {result.total} correct</ThemedText>
        <ThemedText themeColor="textSecondary">{clock(attempt.elapsedSeconds)} · {result.unanswered} unanswered</ThemedText>
      </View>
      <View style={[styles.resultList, { borderColor: theme.border }]}>
        {result.sections.map((section, index) => (
          <View key={section.title} style={[styles.resultRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
            <ThemedText>{section.title}</ThemedText>
            <ThemedText type="smallBold">{section.correct} / {section.total}</ThemedText>
          </View>
        ))}
      </View>
      <ThemedText type="section">Answers and review</ThemedText>
      <View style={[styles.reviewList, { borderColor: theme.border }]}>
        {placements.map((placement, index) => {
          const question = getMockExamQuestion(placement.questionId)!;
          const answer = attempt.selectedAnswers[question.id];
          const correct = answer === question.correctOptionId;
          return (
            <View key={question.id} style={[styles.reviewItem, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
              <ThemedText type="metadata" style={{ color: correct ? theme.success : theme.error }}>Question {placement.position} · {correct ? 'Correct' : 'Review'}</ThemedText>
              <InteractiveJapaneseText type="cardTitle">{question.prompt}</InteractiveJapaneseText>
              <ThemedText themeColor="textSecondary">Your answer: {question.choices.find((choice) => choice.id === answer)?.text ?? '—'}</ThemedText>
              <ThemedText>Correct answer: {question.choices.find((choice) => choice.id === question.correctOptionId)?.text}</ThemedText>
              {question.explanation ? <InteractiveJapaneseText themeColor="textSecondary">{question.explanation}</InteractiveJapaneseText> : null}
              <ThemedText type="small" themeColor="textSecondary">Related JapanGo content: {question.linkedItemIds.join(', ') || 'Available in your course'}</ThemedText>
            </View>
          );
        })}
      </View>
      <AppButton label="Back to mock exams" onPress={() => router.replace('/(tabs)/exams')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.four },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', minWidth: 0 },
  iconButton: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  timer: { alignItems: 'center', flex: 1, minWidth: 0 },
  submitButton: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: Spacing.three },
  examProgress: { gap: Spacing.two },
  instruction: { borderRadius: Radius.medium, borderWidth: 1, gap: Spacing.two, padding: Spacing.three },
  passage: { borderBottomWidth: 1, borderTopWidth: 1, gap: Spacing.three, minWidth: 0, paddingVertical: Spacing.four },
  listening: { borderBottomWidth: 1, borderTopWidth: 1, gap: Spacing.three, paddingVertical: Spacing.three },
  question: { gap: Spacing.two, minWidth: 0 },
  choices: { gap: Spacing.two },
  choice: { alignItems: 'flex-start', borderRadius: Radius.medium, borderWidth: 1, flexDirection: 'row', gap: Spacing.twoHalf, minHeight: 60, minWidth: 0, padding: Spacing.three },
  choiceNumber: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, flexShrink: 0, height: 28, justifyContent: 'center', width: 28 },
  choiceText: { flex: 1, minWidth: 0 },
  navigation: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  navButton: { flexBasis: 140, flexGrow: 1 },
  resultHero: { borderLeftWidth: 5, gap: Spacing.two, paddingLeft: Spacing.four, paddingVertical: Spacing.two },
  resultList: { borderBottomWidth: 1, borderTopWidth: 1 },
  resultRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'space-between', paddingVertical: Spacing.three },
  reviewList: { borderBottomWidth: 1, borderTopWidth: 1 },
  reviewItem: { gap: Spacing.two, minWidth: 0, paddingVertical: Spacing.four },
});
