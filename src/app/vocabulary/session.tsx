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
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  advanceStudySession,
  answerStudySessionQuestion,
  getStudySession,
} from '@/services/database/vocabulary-repository';
import type { StudySession } from '@/types/study';

function routeId(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}

export default function VocabularySessionScreen() {
  const theme = useTheme();
  const { sessionId: rawSessionId } = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const sessionId = routeId(rawSessionId);
  const [session, setSession] = useState<StudySession>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selection, setSelection] = useState<{ questionId: string; optionId: string }>();
  const [saving, setSaving] = useState(false);
  const questionStartedAt = useRef<number | undefined>(undefined);
  const questionStartedId = useRef<string | undefined>(undefined);

  const load = useCallback(async () => {
    if (!sessionId) {
      setError(true);
      setLoading(false);
      return;
    }
    setError(false);
    try {
      const current = await getStudySession(sessionId);
      if (!current) setError(true);
      setSession(current);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const question = session?.questions[session.currentIndex];
  const attempt = question ? session?.attempts.find((candidate) => candidate.questionId === question.id) : undefined;

  const confirm = async () => {
    const selectedOptionId = selection?.questionId === question?.id ? selection?.optionId : undefined;
    if (!session || !question || !selectedOptionId) return;
    setSaving(true);
    try {
      const responseStartedAt = questionStartedId.current === question.id
        ? questionStartedAt.current ?? Date.now()
        : Date.now();
      setSession(await answerStudySessionQuestion(session.id, selectedOptionId, Date.now() - responseStartedAt));
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const updated = await advanceStudySession(session.id);
      if (updated.status === 'completed') {
        router.replace(`/session/results?sessionId=${encodeURIComponent(updated.id)}` as Href);
        return;
      }
      setSession(updated);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening practice…" /></ScreenContainer>;
  if (error || !session || !question) {
    return (
      <ScreenContainer contentStyle={styles.centered}>
        <EmptyState title="Practice session unavailable" message="Your saved answers are still on this device." symbol="!" />
        <AppButton label="Back to Review" onPress={() => router.replace('/(tabs)/review')} />
      </ScreenContainer>
    );
  }

  const selectedOptionId = selection?.questionId === question.id ? selection.optionId : undefined;
  const resolvedSelection = attempt?.selectedAnswer ?? selectedOptionId;
  const correct = attempt?.correct ?? false;
  const progress = ((session.currentIndex + (attempt ? 1 : 0)) / session.questions.length) * 100;

  return (
    <ScreenContainer>
      <View style={styles.topRow}>
        <View>
          <ThemedText type="smallBold">{session.type === 'review' ? 'Vocabulary review' : 'Vocabulary practice'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Question {session.currentIndex + 1} of {session.questions.length}</ThemedText>
        </View>
        <AppButton label="Save & leave" variant="quiet" onPress={() => router.back()} />
      </View>
      <ProgressBar value={progress} accessibilityLabel="Vocabulary practice progress" />
      <Card>
        <ThemedText type="smallBold" themeColor="primary">{question.presentation.replaceAll('-', ' ').toUpperCase()}</ThemedText>
        <ThemedText type="heading">{question.prompt}</ThemedText>
      </Card>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {question.options.map((option) => {
          const selected = option.id === resolvedSelection;
          const correctness = attempt
            ? option.id === question.correctOptionId ? 'correct' : selected ? 'incorrect' : undefined
            : undefined;
          return (
            <QuestionOption
              key={option.id}
              label={option.label}
              selected={selected}
              correctness={correctness}
              disabled={Boolean(attempt)}
              onPress={() => {
                if (questionStartedId.current !== question.id) {
                  questionStartedId.current = question.id;
                  questionStartedAt.current = Date.now();
                }
                setSelection({ questionId: question.id, optionId: option.id });
              }}
            />
          );
        })}
      </View>
      {attempt ? (
        <Card style={{ backgroundColor: correct ? theme.successSoft : theme.errorSoft }}>
          <ThemedText type="heading">{correct ? 'Correct' : 'Not quite'}</ThemedText>
          <ThemedText>{question.explanation ?? 'The correct answer is highlighted above.'}</ThemedText>
        </Card>
      ) : null}
      {attempt ? (
        <AppButton
          label={session.currentIndex === session.questions.length - 1 ? 'See results' : 'Next question'}
          loading={saving}
          onPress={() => void next()}
        />
      ) : (
        <AppButton label="Confirm answer" disabled={!selectedOptionId} loading={saving} onPress={() => void confirm()} />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  options: { gap: Spacing.two },
});
