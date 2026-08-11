import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { LoadingState } from '@/components/common/loading-state';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { InteractiveJapaneseText } from '@/components/lesson/japanese-text';
import { ThemedText } from '@/components/themed-text';
import { Radius, ReadingContentWidth, Spacing } from '@/constants/theme';
import { v3Episodes } from '@/features/lesson-v3/episodes';
import { getUnitTest } from '@/features/unit-tests/unit-test-catalog';
import { createUnitTestAttempt, scoreUnitTest } from '@/features/unit-tests/unit-test-session';
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
    void getUnitTestAttempt(test.id)
      .then((saved) => { if (active) setAttempt(saved ?? createUnitTestAttempt(test.id)); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [test]);
  useEffect(() => { if (attempt) void saveUnitTestAttempt(attempt); }, [attempt]);

  if (!test) return <ScreenContainer><InteractiveJapaneseText>この 確認テストを 開くことが できません。</InteractiveJapaneseText></ScreenContainer>;
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
  const progressValue = ((attempt.questionIndex + 1) / test.questions.length) * 100;

  return (
    <ScreenContainer maxWidth={ReadingContentWidth} includeBottomSafeArea contentStyle={styles.screen}>
      <View style={styles.topRow}>
        <View style={styles.topCopy}>
          <ThemedText type="metadata" style={{ color: theme.primary }}>Unit check · Episodes 1–3</ThemedText>
          <InteractiveJapaneseText type="section">確認テスト</InteractiveJapaneseText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">{attempt.questionIndex + 1} / {test.questions.length}</ThemedText>
      </View>
      <ProgressBar value={progressValue} accessibilityLabel={`Question ${attempt.questionIndex + 1} of ${test.questions.length}`} />

      <View style={styles.question}>
        <ThemedText type="metadata" themeColor="textSecondary">Question {attempt.questionIndex + 1}</ThemedText>
        {question.passage ? (
          <View style={[styles.passage, { borderColor: theme.border }]}>
            <InteractiveJapaneseText type="japaneseReading">{question.passage}</InteractiveJapaneseText>
          </View>
        ) : null}
        {question.listeningSpeech ? (
          <AppButton label="音声を 再生" variant="secondary" onPress={() => void speakJapanese(question.listeningSpeech!)} />
        ) : null}
        <InteractiveJapaneseText type="section">{question.prompt}</InteractiveJapaneseText>
      </View>

      <View accessibilityRole="radiogroup" style={styles.choices}>
        {question.choices.map((choice, index) => (
          <Pressable
            key={choice.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: answer === choice.id }}
            onPress={() => update({ answers: { ...attempt.answers, [question.id]: choice.id } })}
            style={[styles.choice, { backgroundColor: answer === choice.id ? theme.primarySoft : theme.surface, borderColor: answer === choice.id ? theme.primary : theme.border }]}
          >
            <View style={[styles.choiceNumber, { borderColor: answer === choice.id ? theme.primary : theme.border }]}>
              <ThemedText type="smallBold" style={{ color: theme.primary }}>{index + 1}</ThemedText>
            </View>
            <InteractiveJapaneseText style={styles.choiceText}>{choice.text}</InteractiveJapaneseText>
          </Pressable>
        ))}
      </View>

      <View style={styles.actions}>
        <AppButton label="前へ" variant="secondary" disabled={attempt.questionIndex === 0} onPress={() => update({ questionIndex: attempt.questionIndex - 1 })} style={styles.button} />
        <AppButton label={attempt.questionIndex === test.questions.length - 1 ? '提出する' : '次へ'} disabled={!answer} onPress={attempt.questionIndex === test.questions.length - 1 ? () => void submit() : () => update({ questionIndex: attempt.questionIndex + 1 })} style={styles.button} />
      </View>
    </ScreenContainer>
  );
}

function UnitTestResults({ attempt, onRetry }: { attempt: UnitTestAttempt; onRetry: () => void }) {
  const theme = useTheme();
  const test = getUnitTest(attempt.unitTestId)!;
  const result = scoreUnitTest(test, attempt);
  const missed = test.questions.filter((question) => attempt.answers[question.id] !== question.correctChoiceId);

  return (
    <ScreenContainer maxWidth={ReadingContentWidth} includeBottomSafeArea contentStyle={styles.screen}>
      <View style={[styles.resultHero, { borderColor: theme.primary }]}>
        <ThemedText type="metadata" style={{ color: theme.primary }}>Unit test result</ThemedText>
        <ThemedText type="display">{result.percentage}%</ThemedText>
        <ThemedText type="section">{result.status}</ThemedText>
        <ThemedText themeColor="textSecondary">{result.correct} of {result.total} correct</ThemedText>
      </View>
      <View style={[styles.scoreList, { borderColor: theme.border }]}>
        {[...result.byDomain.entries()].map(([domain, score], index) => (
          <View key={domain} style={[styles.scoreRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
            <ThemedText style={styles.domain}>{domain}</ThemedText>
            <ThemedText type="smallBold">{score.correct} / {score.total}</ThemedText>
          </View>
        ))}
      </View>
      {missed.length ? (
        <>
          <ThemedText type="section">Review</ThemedText>
          <View style={[styles.reviewList, { borderColor: theme.border }]}>
            {missed.map((question, index) => {
              const episodeId = test.episodeIds.find((id) => {
                const episode = v3Episodes[id];
                return episode?.curriculumGrammarIds.some((item) => question.linkedEpisodeItemIds.includes(item))
                  || episode?.learningObjectives.some((item) => question.linkedEpisodeItemIds.includes(item.id));
              });
              return (
                <View key={question.id} style={[styles.reviewItem, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
                  <InteractiveJapaneseText type="cardTitle">{question.prompt}</InteractiveJapaneseText>
                  <InteractiveJapaneseText>Correct answer: {question.choices.find((choice) => choice.id === question.correctChoiceId)?.text}</InteractiveJapaneseText>
                  <InteractiveJapaneseText themeColor="textSecondary">{question.explanation}</InteractiveJapaneseText>
                  {episodeId ? <AppButton label={`Review Episode ${v3Episodes[episodeId]!.episodeNumber}`} variant="secondary" onPress={() => router.replace(`/episode/${episodeId}`)} /> : null}
                </View>
              );
            })}
          </View>
        </>
      ) : null}
      <AppButton label="Retry unit test" onPress={onRetry} />
      <AppButton label="Back to home" variant="secondary" onPress={() => router.replace('/(tabs)')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { gap: Spacing.four },
  topRow: { alignItems: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, justifyContent: 'space-between' },
  topCopy: { flex: 1, gap: Spacing.one, minWidth: 190 },
  question: { gap: Spacing.three, minWidth: 0 },
  passage: { borderBottomWidth: 1, borderTopWidth: 1, minWidth: 0, paddingVertical: Spacing.four },
  choices: { gap: Spacing.two },
  choice: { alignItems: 'flex-start', borderRadius: Radius.medium, borderWidth: 1, flexDirection: 'row', gap: Spacing.twoHalf, minHeight: 60, minWidth: 0, padding: Spacing.three },
  choiceNumber: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, flexShrink: 0, height: 28, justifyContent: 'center', width: 28 },
  choiceText: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  button: { flexBasis: 140, flexGrow: 1 },
  resultHero: { borderLeftWidth: 5, gap: Spacing.two, paddingLeft: Spacing.four, paddingVertical: Spacing.two },
  scoreList: { borderBottomWidth: 1, borderTopWidth: 1 },
  scoreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'space-between', paddingVertical: Spacing.three },
  domain: { textTransform: 'capitalize' },
  reviewList: { borderBottomWidth: 1, borderTopWidth: 1 },
  reviewItem: { gap: Spacing.two, minWidth: 0, paddingVertical: Spacing.four },
});
