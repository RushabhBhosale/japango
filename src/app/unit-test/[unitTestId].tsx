import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { LoadingState } from '@/components/common/loading-state';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { getUnitTest } from '@/features/unit-tests/unit-test-catalog';
import { createUnitTestAttempt, scoreUnitTest } from '@/features/unit-tests/unit-test-session';
import { v3Episodes } from '@/features/lesson-v3/episodes';
import { useTheme } from '@/hooks/use-theme';
import { getUnitTestAttempt, prioritizeUnitTestMistakes, saveUnitTestAttempt } from '@/services/database/unit-test-repository';
import { speakJapanese } from '@/services/speech/japanese-speech';
import type { UnitTestAttempt } from '@/types/unit-test';

export default function UnitTestScreen() {
  const theme = useTheme();
  const { unitTestId } = useLocalSearchParams<{ unitTestId: string }>();
  const test = getUnitTest(unitTestId);
  const [attempt, setAttempt] = useState<UnitTestAttempt>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!test) return;
    let active = true;
    void getUnitTestAttempt(test.id).then((saved) => { if (active) setAttempt(saved ?? createUnitTestAttempt(test.id)); }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [test]);
  useEffect(() => { if (attempt) void saveUnitTestAttempt(attempt); }, [attempt]);

  if (!test) return <ScreenContainer><ThemedText>この 確認テストを 開くことが できません。</ThemedText></ScreenContainer>;
  if (!loaded || !attempt) return <ScreenContainer scroll={false}><LoadingState label="確認テストを 準備しています…" /></ScreenContainer>;
  if (attempt.completedAt) return <UnitTestResults attempt={attempt} onRetry={() => setAttempt(createUnitTestAttempt(test.id))} />;
  const question = test.questions[attempt.questionIndex]!;
  const answer = attempt.answers[question.id];
  const update = (patch: Partial<UnitTestAttempt>) => setAttempt((current) => current ? { ...current, ...patch } : current);
  const submit = async () => {
    const completed = { ...attempt, completedAt: new Date().toISOString() };
    await saveUnitTestAttempt(completed);
    void prioritizeUnitTestMistakes(test, completed).catch(() => undefined);
    setAttempt(completed);
  };
  return <ScreenContainer contentStyle={styles.screen}>
    <View style={styles.topRow}><ThemedText type="smallBold" themeColor="primary">確認テスト・エピソード 1〜3</ThemedText><ThemedText type="small" themeColor="textSecondary">{attempt.questionIndex + 1} / {test.questions.length}</ThemedText></View>
    <Card><ThemedText type="smallBold" themeColor="textSecondary">問題 {attempt.questionIndex + 1}</ThemedText>{question.passage ? <ThemedText type="japanese">{question.passage}</ThemedText> : null}{question.listeningSpeech ? <AppButton label="音声を 再生" variant="secondary" onPress={() => void speakJapanese(question.listeningSpeech!)} /> : null}<ThemedText type="heading">{question.prompt}</ThemedText></Card>
    <View style={styles.choices}>{question.choices.map((choice, index) => <Pressable key={choice.id} accessibilityRole="radio" accessibilityState={{ checked: answer === choice.id }} onPress={() => update({ answers: { ...attempt.answers, [question.id]: choice.id } })} style={[styles.choice, { backgroundColor: answer === choice.id ? theme.primarySoft : theme.surface, borderColor: answer === choice.id ? theme.primary : theme.border }]}><ThemedText type="smallBold" style={{ color: theme.primary }}>{index + 1}</ThemedText><ThemedText style={styles.choiceText}>{choice.text}</ThemedText></Pressable>)}</View>
    <View style={styles.actions}><AppButton label="前へ" variant="secondary" disabled={attempt.questionIndex === 0} onPress={() => update({ questionIndex: attempt.questionIndex - 1 })} style={styles.button} /><AppButton label={attempt.questionIndex === test.questions.length - 1 ? '提出する' : '次へ'} disabled={!answer} onPress={attempt.questionIndex === test.questions.length - 1 ? () => void submit() : () => update({ questionIndex: attempt.questionIndex + 1 })} style={styles.button} /></View>
  </ScreenContainer>;
}

function UnitTestResults({ attempt, onRetry }: { attempt: UnitTestAttempt; onRetry: () => void }) {
  const test = getUnitTest(attempt.unitTestId)!;
  const result = scoreUnitTest(test, attempt);
  return <ScreenContainer contentStyle={styles.screen}><Card><ThemedText type="smallBold" themeColor="primary">UNIT TEST RESULT</ThemedText><ThemedText type="title">{result.percentage}%</ThemedText><ThemedText type="heading">{result.status}</ThemedText><ThemedText themeColor="textSecondary">{result.correct} / {result.total} correct</ThemedText></Card><Card>{[...result.byDomain.entries()].map(([domain, score]) => <View key={domain} style={styles.scoreRow}><ThemedText>{domain}</ThemedText><ThemedText type="smallBold">{score.correct} / {score.total}</ThemedText></View>)}</Card><ThemedText type="heading">Review</ThemedText>{test.questions.filter((question) => attempt.answers[question.id] !== question.correctChoiceId).map((question) => { const episodeId = test.episodeIds.find((id) => { const episode = v3Episodes[id]; return episode?.curriculumGrammarIds.some((item) => question.linkedEpisodeItemIds.includes(item)) || episode?.learningObjectives.some((item) => question.linkedEpisodeItemIds.includes(item.id)); }); return <Card key={question.id}><ThemedText type="smallBold">{question.prompt}</ThemedText><ThemedText>Correct answer: {question.choices.find((choice) => choice.id === question.correctChoiceId)?.text}</ThemedText><ThemedText themeColor="textSecondary">{question.explanation}</ThemedText>{episodeId ? <AppButton label={`Review Episode ${v3Episodes[episodeId]!.episodeNumber}`} variant="secondary" onPress={() => router.replace(`/episode/${episodeId}`)} /> : null}</Card>; })}<AppButton label="Retry unit test" onPress={onRetry} /><AppButton label="Back to home" variant="secondary" onPress={() => router.replace('/(tabs)')} /></ScreenContainer>;
}

const styles = StyleSheet.create({ screen: { gap: Spacing.three }, topRow: { flexDirection: 'row', justifyContent: 'space-between' }, choices: { gap: Spacing.two }, choice: { alignItems: 'flex-start', borderRadius: Radius.medium, borderWidth: 1, flexDirection: 'row', gap: Spacing.two, minHeight: 56, padding: Spacing.three }, choiceText: { flex: 1 }, actions: { flexDirection: 'row', gap: Spacing.two }, button: { flex: 1 }, scoreRow: { flexDirection: 'row', justifyContent: 'space-between' } });
