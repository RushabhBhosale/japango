import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { LoadingState } from '@/components/common/loading-state';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { QuestionOption } from '@/components/quiz/question-option';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

export default function AssessmentScreen() {
  const theme = useTheme();
  const questions = useAppStore((state) => state.assessmentQuestions);
  const attempts = useAppStore((state) => state.assessmentAttempts);
  const index = useAppStore((state) => state.assessmentIndex);
  const loading = useAppStore((state) => state.assessmentLoading);
  const loadAssessment = useAppStore((state) => state.loadAssessment);
  const answerAssessment = useAppStore((state) => state.answerAssessment);
  const goToAssessmentIndex = useAppStore((state) => state.goToAssessmentIndex);
  const finishAssessment = useAppStore((state) => state.finishAssessment);
  const [pendingSelections, setPendingSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const questionStartedAt = useRef(0);

  const question = questions[index];
  const currentAttempt = useMemo(
    () => attempts.find((attempt) => attempt.questionId === question?.id),
    [attempts, question?.id],
  );
  const selectedOptionId = currentAttempt?.selectedAnswer ?? (question ? pendingSelections[question.id] : undefined);

  useEffect(() => {
    if (questions.length === 0) void loadAssessment();
  }, [loadAssessment, questions.length]);

  useEffect(() => {
    questionStartedAt.current = Date.now();
  }, [question?.id]);

  if (loading || questions.length === 0) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState label="Loading your skill check…" />
      </ScreenContainer>
    );
  }

  if (!question) {
    return (
      <ScreenContainer contentStyle={styles.centered}>
        <ThemedText type="subtitle">Your answers are saved.</ThemedText>
        <AppButton label="View your result" onPress={() => router.replace('/assessment/result')} />
      </ScreenContainer>
    );
  }

  const handleConfirm = async () => {
    if (!selectedOptionId || currentAttempt) return;
    setSaving(true);
    setError(undefined);
    try {
      await answerAssessment(question, selectedOptionId, Date.now() - questionStartedAt.current);
    } catch {
      setError('That answer could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    if (!currentAttempt) return;
    setSaving(true);
    setError(undefined);
    try {
      const nextIndex = index + 1;
      if (nextIndex === questions.length) {
        await finishAssessment();
        router.replace('/assessment/result');
        return;
      }
      await goToAssessmentIndex(nextIndex);
    } catch {
      setError('Your progress is saved, but the next question could not be opened.');
    } finally {
      setSaving(false);
    }
  };

  const answerIsCorrect = currentAttempt?.correct ?? false;
  const progress = ((index + (currentAttempt ? 1 : 0)) / questions.length) * 100;

  return (
    <ScreenContainer>
      <View style={styles.topRow}>
        <View style={styles.progressText}>
          <ThemedText type="smallBold">Initial skill check</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Question {index + 1} of {questions.length}
          </ThemedText>
        </View>
        <AppButton label="Save & leave" variant="quiet" onPress={() => router.replace('/(tabs)')} />
      </View>
      <ProgressBar value={progress} accessibilityLabel="Assessment progress" />

      <Card style={styles.questionCard}>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          {question.type === 'choose-reading'
            ? 'CHOOSE THE READING'
            : question.type === 'fill-blank'
              ? 'COMPLETE THE SENTENCE'
              : question.type === 'short-reading'
                ? 'SHORT READING'
                : 'CHOOSE ONE'}
        </ThemedText>
        {question.type === 'short-reading' ? (
          <View style={[styles.passage, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="japanese">{question.passage}</ThemedText>
          </View>
        ) : null}
        <ThemedText type="heading">{question.prompt}</ThemedText>
      </Card>

      <View accessibilityRole="radiogroup" style={styles.options}>
        {question.options.map((option) => {
          const isSelected = option.id === selectedOptionId;
          const correctness = currentAttempt
            ? option.id === question.correctOptionId
              ? 'correct'
              : isSelected
                ? 'incorrect'
                : undefined
            : undefined;
          return (
            <QuestionOption
              key={option.id}
              label={option.label}
              selected={isSelected}
              correctness={correctness}
              disabled={Boolean(currentAttempt)}
              onPress={() => setPendingSelections((current) => ({ ...current, [question.id]: option.id }))}
            />
          );
        })}
      </View>

      {currentAttempt ? (
        <Card
          style={{ backgroundColor: answerIsCorrect ? theme.successSoft : theme.errorSoft }}
          accessibilityLabel={answerIsCorrect ? 'Correct answer' : 'Incorrect answer'}>
          <ThemedText type="heading" style={{ color: answerIsCorrect ? theme.success : theme.error }}>
            {answerIsCorrect ? 'Correct' : 'Not quite'}
          </ThemedText>
          <ThemedText>{question.explanation}</ThemedText>
        </Card>
      ) : null}

      {error ? <ThemedText style={{ color: theme.error }} accessibilityLiveRegion="polite">{error}</ThemedText> : null}
      {currentAttempt ? (
        <AppButton
          label={index === questions.length - 1 ? 'See my result' : 'Next question'}
          loading={saving}
          onPress={() => void handleNext()}
        />
      ) : (
        <AppButton
          label="Confirm answer"
          disabled={!selectedOptionId}
          loading={saving}
          onPress={() => void handleConfirm()}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  progressText: { flex: 1, gap: 2 },
  questionCard: { marginTop: Spacing.two },
  passage: { borderRadius: Radius.medium, padding: Spacing.three },
  options: { gap: Spacing.two },
});
