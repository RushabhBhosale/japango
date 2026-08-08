import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { QuestionOption } from '@/components/quiz/question-option';
import { Radius, Spacing } from '@/constants/theme';
import { v3AssessmentQuestions } from '@/features/lesson-v3/assessment';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

export default function AssessmentScreen() {
  const theme = useTheme();
  const v3Learner = useAppStore((state) => state.v3Learner);
  const answerAssessment = useAppStore((state) => state.answerV3Assessment);
  const finishAssessment = useAppStore((state) => state.finishV3Assessment);
  const initialIndex = Math.min(v3Learner?.assessmentIndex ?? 0, v3AssessmentQuestions.length - 1);
  const [index, setIndex] = useState(initialIndex);
  const [selectedOptionId, setSelectedOptionId] = useState<string>();
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const question = v3AssessmentQuestions[index];

  const confirm = async () => {
    if (!selectedOptionId || confirmed) return;
    setSaving(true);
    setError(undefined);
    try {
      await answerAssessment({
        questionId: question.id,
        selectedOptionId,
        correct: selectedOptionId === question.correctOptionId,
      });
      setConfirmed(true);
    } catch {
      setError('That answer could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (!confirmed) return;
    if (index === v3AssessmentQuestions.length - 1) {
      setSaving(true);
      try {
        await finishAssessment();
        router.replace('/assessment/result');
      } catch {
        setError('Your answers are saved. The result could not be opened yet.');
      } finally {
        setSaving(false);
      }
      return;
    }
    setIndex((current) => current + 1);
    setSelectedOptionId(undefined);
    setConfirmed(false);
    setError(undefined);
  };

  const correct = selectedOptionId === question.correctOptionId;
  const progress = ((index + (confirmed ? 1 : 0)) / v3AssessmentQuestions.length) * 100;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <ThemedText type="smallBold">A quick starting check</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">About 3 minutes · {index + 1} of {v3AssessmentQuestions.length}</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">Not an exam</ThemedText>
      </View>
      <ProgressBar value={progress} accessibilityLabel="Starting check progress" />

      <Card style={styles.questionCard}>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>{question.label}</ThemedText>
        {question.passage ? (
          <View style={[styles.passage, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="japanese" style={styles.passageText}>{question.passage}</ThemedText>
          </View>
        ) : null}
        <ThemedText type="heading">{question.prompt}</ThemedText>
      </Card>

      <View accessibilityRole="radiogroup" style={styles.options}>
        {question.options.map((option) => {
          const selected = option.id === selectedOptionId;
          const correctness = confirmed
            ? option.id === question.correctOptionId
              ? 'correct'
              : selected
                ? 'incorrect'
                : undefined
            : undefined;
          return (
            <QuestionOption
              key={option.id}
              label={option.label}
              selected={selected}
              correctness={correctness}
              disabled={confirmed}
              onPress={() => setSelectedOptionId(option.id)}
            />
          );
        })}
      </View>

      {confirmed ? (
        <Card style={{ backgroundColor: correct ? theme.successSoft : theme.errorSoft }}>
          <ThemedText type="heading" style={{ color: correct ? theme.success : theme.error }}>
            {correct ? 'Got it' : 'Good to know'}
          </ThemedText>
          <ThemedText>{question.explanation}</ThemedText>
        </Card>
      ) : null}

      {error ? <ThemedText style={{ color: theme.error }} accessibilityLiveRegion="polite">{error}</ThemedText> : null}
      <AppButton
        label={confirmed ? (index === v3AssessmentQuestions.length - 1 ? 'See my starting point' : 'Next') : 'Check answer'}
        disabled={!selectedOptionId}
        loading={saving}
        onPress={() => confirmed ? void next() : void confirm()}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        Your result adjusts furigana, hints, and how much English Episode 1 shows.
      </ThemedText>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  headerCopy: { flex: 1 },
  questionCard: { marginTop: Spacing.two },
  passage: { borderRadius: Radius.medium, padding: Spacing.three },
  passageText: { fontSize: 21, lineHeight: 34 },
  options: { gap: Spacing.two },
  note: { textAlign: 'center' },
});
