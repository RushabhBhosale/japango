import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { DailyReadingQuestionView } from '@/components/daily-reading/daily-reading-question';
import { DailyVocabularyReview } from '@/components/daily-reading/daily-vocabulary-review';
import { InteractiveJapaneseText } from '@/components/lesson/japanese-text';
import { ThemedText } from '@/components/themed-text';
import { Radius, ReadingContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  answerDailyReadingQuestion,
  getDailyReadingById,
  getDailyReadingStreak,
  markDailyReadingOpened,
  saveDailyReadingVocabulary,
  trackDailyReadingVocabularyTap,
} from '@/services/database/daily-reading-repository';
import { getFuriganaPreference, type JapaneseTextItem } from '@/services/database/japanese-text-repository';
import type { DailyReading, DailyReadingProgress } from '@/types/daily-reading';

export default function DailyReadingScreen() {
  const theme = useTheme();
  const { readingId } = useLocalSearchParams<{ readingId: string }>();
  const [reading, setReading] = useState<DailyReading>();
  const [progress, setProgress] = useState<DailyReadingProgress>();
  const [furigana, setFurigana] = useState(false);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>();

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const loaded = await getDailyReadingById(readingId);
        if (!loaded) throw new Error('This saved reading is no longer available.');
        const [opened, preference, currentStreak] = await Promise.all([
          markDailyReadingOpened(loaded),
          getFuriganaPreference(),
          getDailyReadingStreak(loaded.date),
        ]);
        if (!active) return;
        setReading(loaded);
        setProgress(opened);
        setFurigana(preference === 'always');
        setStreak(currentStreak);
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'This reading could not be opened.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [readingId]);

  const vocabularyItems = useMemo<JapaneseTextItem[]>(() => reading?.targetVocabulary.map((item) => ({
    id: item.sourceItemId,
    type: 'vocabulary',
    title: item.word,
    reading: item.reading,
    meaning: item.meaning,
  })) ?? [], [reading]);
  const passageParagraphs = useMemo(() => {
    if (!reading) return [];
    const paragraphs = reading.content.split(/\n+/u);
    const readings = reading.contentReading.split(/\n+/u);
    if (paragraphs.length !== readings.length) return [{ text: reading.content, reading: reading.contentReading }];
    return paragraphs.map((text, index) => ({ text, reading: readings[index]! }));
  }, [reading]);

  const trackTap = useCallback((item: JapaneseTextItem) => {
    if (!reading || !reading.targetVocabulary.some((target) => target.sourceItemId === item.id)) return;
    void trackDailyReadingVocabularyTap(reading, item.id).catch(() => undefined);
  }, [reading]);

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening today’s reading…" /></ScreenContainer>;
  if (!reading || !progress) {
    return <ScreenContainer scroll={false}><EmptyState title="Reading unavailable" message={errorMessage ?? 'This saved reading could not be opened.'} /><AppButton label="Go back" onPress={() => router.back()} /></ScreenContainer>;
  }

  const answered = progress.answers.length;
  const progressValue = (answered / reading.questions.length) * 100;
  const correct = progress.answers.filter((answer) => answer.correct).length;

  return (
    <ScreenContainer maxWidth={ReadingContentWidth} includeBottomSafeArea>
      <View style={styles.navigation}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={[styles.iconButton, { borderColor: theme.border }]}>
          <Ionicons name="arrow-back" size={22} color={theme.text} />
        </Pressable>
        <View style={styles.navigationTitle}>
          <InteractiveJapaneseText type="heading" contextualReading="きょうのどっかい">今日の読解</InteractiveJapaneseText>
          <ThemedText type="small" themeColor="textSecondary">Today’s Reading</ThemedText>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: furigana }}
          accessibilityLabel="Show furigana"
          onPress={() => setFurigana((shown) => !shown)}
          style={[styles.furiganaButton, { borderColor: furigana ? theme.primary : theme.border, backgroundColor: furigana ? theme.primarySoft : theme.surface }]}
        >
          <InteractiveJapaneseText type="smallBold" style={{ color: furigana ? theme.primary : theme.textSecondary }}>ふりがな</InteractiveJapaneseText>
        </Pressable>
      </View>

      <View style={styles.progressBlock}>
        <View style={styles.progressLabels}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>{reading.level} · {reading.type.replaceAll('-', ' ')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{answered}/{reading.questions.length} answered</ThemedText>
        </View>
        <ProgressBar value={progressValue} accessibilityLabel={`${answered} of ${reading.questions.length} questions answered`} />
      </View>

      <View style={styles.reading}>
        <View style={[styles.readingHeader, { borderBottomColor: theme.border }]}>
          <ThemedText type="metadata" style={{ color: theme.primary }}>Today’s passage</ThemedText>
          <InteractiveJapaneseText type="title" contextualReading={reading.titleReading} furiganaOverride={furigana} additionalItems={vocabularyItems} onItemPress={trackTap}>{reading.title}</InteractiveJapaneseText>
        </View>
        <View style={styles.passage} accessibilityLabel="Japanese reading passage">
          {passageParagraphs.map((paragraph, index) => (
            <InteractiveJapaneseText
              key={`${index}-${paragraph.text.slice(0, 12)}`}
              type="japaneseReading"
              style={styles.passageText}
              furiganaOverride={furigana}
              contextualReading={paragraph.reading}
              additionalItems={vocabularyItems}
              onItemPress={trackTap}
            >{paragraph.text}</InteractiveJapaneseText>
          ))}
        </View>
        {reading.targetGrammar.length ? (
          <View style={[styles.grammarRow, { borderColor: theme.border }]}> 
            <ThemedText type="smallBold" themeColor="textSecondary">GRAMMAR IN THIS READING</ThemedText>
            {reading.targetGrammar.map((grammar) => (
              <View key={grammar.sourceItemId} style={styles.grammarItem}>
                <InteractiveJapaneseText type="heading" contextualReading={grammar.reading} furiganaOverride={furigana}>{grammar.pattern}</InteractiveJapaneseText>
                <ThemedText type="small" themeColor="textSecondary">{grammar.meaning}</ThemedText>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.questions}>
        <SectionHeading title="Comprehension" detail={`${reading.questions.length} questions`} />
        {reading.questions.map((question, index) => (
          <DailyReadingQuestionView
            key={question.id}
            number={index + 1}
            question={question}
            answer={progress.answers.find((answer) => answer.questionId === question.id)}
            furigana={furigana}
            vocabularyItems={vocabularyItems}
            onVocabularyPress={trackTap}
            onSubmit={async (selectedAnswer) => {
              const updated = await answerDailyReadingQuestion(reading, question.id, selectedAnswer);
              setProgress(updated);
              if (updated.completedAt) setStreak(await getDailyReadingStreak(reading.date));
            }}
          />
        ))}
      </View>

      {progress.completedAt ? (
        <>
          <Card variant="quiet" style={[styles.completionCard, { borderColor: theme.success, backgroundColor: theme.successSoft }]}> 
            <Ionicons name="checkmark-circle" size={34} color={theme.success} />
            <View style={styles.completionCopy}>
              <ThemedText type="subtitle" style={{ color: theme.success }}>Completed today</ThemedText>
              <View style={styles.scoreRow}>
                <ThemedText style={{ color: theme.success }}>{correct}/{reading.questions.length} correct</ThemedText>
                <Ionicons name="flame-outline" size={18} color={theme.success} />
                <ThemedText style={{ color: theme.success }}>{streak}</ThemedText>
                <InteractiveJapaneseText contextualReading="にちれんぞく" style={{ color: theme.success }}>日連続</InteractiveJapaneseText>
              </View>
            </View>
          </Card>
          <DailyVocabularyReview
            vocabulary={reading.targetVocabulary}
            savedIds={progress.savedVocabularyIds}
            furigana={furigana}
            vocabularyItems={vocabularyItems}
            onVocabularyPress={trackTap}
            onSave={(id) => {
              void saveDailyReadingVocabulary(reading, id)
                .then(setProgress)
                .catch((error) => setErrorMessage(error instanceof Error ? error.message : 'This word could not be saved.'));
            }}
          />
          {errorMessage ? <ThemedText style={{ color: theme.error }}>{errorMessage}</ThemedText> : null}
        </>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  navigation: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, minHeight: 52, minWidth: 0 },
  navigationTitle: { flex: 1, minWidth: 0 },
  iconButton: { width: 44, height: 44, borderWidth: 1, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  furiganaButton: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 44, minWidth: 78, paddingHorizontal: 10 },
  progressBlock: { gap: Spacing.two },
  progressLabels: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.two },
  reading: { gap: Spacing.four, minWidth: 0 },
  readingHeader: { borderBottomWidth: 1, gap: Spacing.two, paddingBottom: Spacing.four },
  passage: { gap: Spacing.four, minWidth: 0, paddingHorizontal: Spacing.one, paddingVertical: Spacing.three },
  passageText: { maxWidth: '100%', minWidth: 0 },
  grammarRow: { borderBottomWidth: 1, borderTopWidth: 1, gap: Spacing.twoHalf, paddingVertical: Spacing.three },
  grammarItem: { gap: Spacing.one },
  questions: { gap: Spacing.five },
  completionCard: { alignItems: 'center', borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  completionCopy: { flex: 1, minWidth: 0 },
  scoreRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
