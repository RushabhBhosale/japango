import { useCallback, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { ScreenContainer } from '@/components/common/screen-container';
import { AiTeacherCard } from '@/components/lesson/ai-teacher-card';
import { JapaneseText } from '@/components/lesson/japanese-text';
import { JapaneseSpeechButton } from '@/components/lesson/japanese-speech-button';
import { LessonPhaseRail } from '@/components/lesson/lesson-phase-rail';
import { QuestionOption } from '@/components/quiz/question-option';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { courseSpeechText } from '@/features/course/course-speech';
import { useTheme } from '@/hooks/use-theme';
import { openGuidedCourseLesson, recordCourseActivityHint, submitCourseActivity } from '@/services/database/course-repository';
import type { CourseAnswerFeedback, CourseLessonActivitySummary, GuidedCourseLesson, LessonActivityExercise } from '@/types/course';

function routeId(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}

function exerciseLabel(exercise: LessonActivityExercise): string {
  if (exercise.responseKind === 'continue') return 'Continue';
  if (exercise.responseKind === 'production') return 'Save my sentence';
  if (exercise.category === 'reading') return 'Check reading';
  if (exercise.category === 'listening') return 'Check answer';
  return 'Check answer';
}

function notebookHref(exercise: LessonActivityExercise): Href | undefined {
  if (!exercise.itemId) return undefined;
  const encoded = encodeURIComponent(exercise.itemId);
  if (exercise.itemId.startsWith('n5-')) return `/curriculum/${encoded}` as Href;
  if (exercise.category === 'vocabulary') return `/vocabulary/${encoded}` as Href;
  if (exercise.category === 'kanji') return `/kanji/${encoded}` as Href;
  if (exercise.category === 'grammar' || exercise.category === 'conjugation') return `/grammar/${encoded}` as Href;
  if (exercise.category === 'reading') return `/reading/${encoded}` as Href;
  if (exercise.category === 'listening') return `/listening/${encoded}` as Href;
  return undefined;
}

function interactionTimestamp(): number { return Date.now(); }

function activityStyle(type: CourseLessonActivitySummary['type']) {
  if (type === 'dialogue' || type === 'story') return styles.dialogueSurface;
  if (type === 'reading' || type === 'timed_reading') return styles.readingSurface;
  if (type === 'listening' || type === 'dictation' || type === 'shadowing') return styles.listeningSurface;
  if (type === 'kanji_intro' || type === 'kanji_practice') return styles.kanjiSurface;
  if (type === 'grammar_explanation' || type === 'substitution_drill' || type === 'conjugation_drill' || type === 'sentence_transformation' || type === 'sentence_ordering') return styles.workbookSurface;
  return undefined;
}

function learnerFacingAnswer(exercise: LessonActivityExercise, answer: string | undefined): string | undefined {
  if (!answer || exercise.responseKind !== 'select') return answer;
  return exercise.options?.find((option) => option.id === answer)?.label ?? answer;
}

function FeedbackPanel({ feedback, exercise, onContinue }: { feedback: CourseAnswerFeedback; exercise: LessonActivityExercise; onContinue: () => void }) {
  const theme = useTheme();
  const positive = feedback.kind === 'correct';
  const learnerAnswer = learnerFacingAnswer(exercise, feedback.learnerAnswer);
  const acceptedAnswer = learnerFacingAnswer(exercise, feedback.acceptedAnswer);
  return (
    <View accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: positive ? theme.primary : theme.border, backgroundColor: positive ? theme.primarySoft : theme.backgroundSelected }]}>
      <ThemedText type="smallBold">{feedback.title}</ThemedText>
      {learnerAnswer ? <JapaneseText type="small" themeColor="textSecondary">Your answer: {learnerAnswer}</JapaneseText> : null}
      {acceptedAnswer ? <JapaneseText type="smallBold">Correct answer: {acceptedAnswer}</JapaneseText> : null}
      <JapaneseText type="small" themeColor="textSecondary">Rule: {feedback.explanation}</JapaneseText>
      {feedback.hint ? <JapaneseText type="small">Try this: {feedback.hint}</JapaneseText> : null}
      {feedback.canContinue ? <AppButton label="Continue after explanation" onPress={onContinue} /> : null}
    </View>
  );
}

export default function CourseLessonScreen() {
  const theme = useTheme();
  const { lessonId: rawLessonId } = useLocalSearchParams<{ lessonId?: string | string[] }>();
  const lessonId = routeId(rawLessonId);
  const [guided, setGuided] = useState<GuidedCourseLesson>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [response, setResponse] = useState('');
  const [feedback, setFeedback] = useState<CourseAnswerFeedback>();
  const [hintLevel, setHintLevel] = useState(0);
  const interactionStartedAt = useRef(0);

  const load = useCallback(async () => {
    if (!lessonId) { setError(true); setLoading(false); return; }
    setLoading(true);
    setError(false);
    try {
      const opened = await openGuidedCourseLesson(lessonId);
      if (!opened) throw new Error('Guided lesson unavailable');
      const next = opened.lesson;
      setGuided(next);
      setResponse('');
      setFeedback(undefined);
      setHintLevel(0);
      interactionStartedAt.current = interactionTimestamp();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [lessonId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const activeActivity = guided?.currentActivity;
  const activeExercise = activeActivity?.exercises[activeActivity.progress.currentInteractionIndex];

  const submit = async (selectedResponse?: string, continueAfterTeaching = false) => {
    if (!lessonId || !activeActivity || !activeExercise) return;
    const value = selectedResponse ?? response;
    if (!continueAfterTeaching && (activeExercise.responseKind === 'typed' || activeExercise.responseKind === 'production') && !value.trim()) {
      setFeedback({ kind: 'incorrect', title: 'Add your answer first', explanation: 'Type an answer so I can show a useful correction.', hintLevel: 0, canRetry: true, canContinue: false, scheduleForReview: false });
      return;
    }
    setResponse(value);
    setSaving(true);
    try {
      const result = await submitCourseActivity(lessonId, {
        activityId: activeActivity.id,
        response: value,
        responseTimeMs: Math.max(0, interactionTimestamp() - interactionStartedAt.current),
        hintLevel,
        continueAfterTeaching,
      });
      setGuided(result.lesson);
      if (!result.correct) {
        setFeedback(result.feedback);
        setHintLevel(result.feedback?.hintLevel ?? hintLevel);
      } else {
        setResponse('');
        setHintLevel(0);
        setFeedback(undefined);
        interactionStartedAt.current = interactionTimestamp();
      }
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const requestHint = async () => {
    if (!lessonId || !activeActivity || !activeExercise || saving) return;
    const nextLevel = Math.min(3, hintLevel + 1);
    setHintLevel(nextLevel);
    try { await recordCourseActivityHint(lessonId, activeActivity.id, nextLevel); } catch { /* Keep the local hint usable if analytics persistence is unavailable. */ }
    const hint = activeExercise.hints?.[nextLevel - 1]
      ?? (nextLevel === 1 ? 'Read the instruction and model once more.' : nextLevel === 2 ? 'Start with the first half of the answer.' : activeExercise.acceptedAnswers?.[0] ? `Answer: ${activeExercise.acceptedAnswers[0]}` : 'Use the model sentence above.');
    setFeedback({ kind: 'incorrect', title: nextLevel === 3 ? 'Here is the answer' : 'A helpful clue', explanation: nextLevel === 3 ? 'Read it once, then use the next example to practise the same skill.' : 'Use this support, then try the answer yourself.', hint, hintLevel: nextLevel, canRetry: true, canContinue: false, scheduleForReview: false });
  };

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening lesson…" /><AppButton label="Back to Learn" variant="quiet" onPress={() => router.replace('/(tabs)/learn' as Href)} /></ScreenContainer>;
  if (error || !guided) return <ScreenContainer><EmptyState title="Lesson unavailable" message="Your course data is still saved locally. Return to Learn and try again." symbol="!" /><AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn' as Href)} /></ScreenContainer>;
  const { lesson } = guided;
  if (lesson.progress.state === 'locked') return <ScreenContainer><EmptyState title={lesson.title} message="Complete the earlier lesson first, or enable lesson browsing when you want to look ahead." symbol="!" /><AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn' as Href)} /></ScreenContainer>;
  if (!activeActivity || !activeExercise) return <ScreenContainer><View style={styles.compactHeader}><ThemedText type="smallBold" themeColor="primary">LESSON {lesson.number}</ThemedText><ThemedText type="heading">{lesson.title}</ThemedText></View><Card><ThemedText type="heading">Lesson complete</ThemedText><ThemedText themeColor="textSecondary">You can now {lesson.objectives.join(', ')}. Your checkpoint, reading, listening, and review schedule are saved.</ThemedText><ThemedText type="smallBold">Next: return to Learn to open the next lesson or review a weak item.</ThemedText><AppButton label="Continue to Learn" onPress={() => router.replace('/(tabs)/learn' as Href)} /></Card></ScreenContainer>;

  const notebook = notebookHref(activeExercise);
  const usesTapChoices = activeExercise.responseKind === 'select' || Boolean(activeExercise.options?.length);
  const taskDirection = activeExercise.expectedResponse?.format
    ?? (usesTapChoices ? 'Choose one answer below.' : activeExercise.responseKind === 'continue' ? undefined : 'Enter your answer below.');
  const readingBlock = activeExercise.readingText ? (
    <View style={styles.readingBlock}>
      <JapaneseText type="japanese">{activeExercise.readingText}</JapaneseText>
      <JapaneseSpeechButton text={courseSpeechText(activeExercise.readingText)} label="Play passage" rate={0.72} />
    </View>
  ) : null;
  const readingQuestion = activeExercise.category === 'reading' && activeExercise.responseKind !== 'continue';
  return (
    <ScreenContainer keyboardAware>
      <View style={styles.compactHeader}>
        <AppButton label="Back to Learn" variant="quiet" onPress={() => router.replace('/(tabs)/learn' as Href)} accessibilityLabel="Leave lesson and return to Learn" />
        <ThemedText type="smallBold" themeColor="primary">LESSON {lesson.number}</ThemedText>
        <ThemedText type="heading">{lesson.title}</ThemedText>
        <LessonPhaseRail activities={guided.activities} activeActivityId={activeActivity.id} compact />
      </View>

      <View style={[styles.activitySurface, activityStyle(activeActivity.type), { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <View style={styles.promptBlock}>
          {readingQuestion ? readingBlock : null}
          <JapaneseText type="smallBold">{activeExercise.prompt}</JapaneseText>
          {!readingQuestion ? readingBlock : null}
          {activeExercise.listeningText ? <View style={styles.audioBlock}><ThemedText type="small" themeColor="textSecondary">Listen before revealing a transcript.</ThemedText><JapaneseSpeechButton text={courseSpeechText(activeExercise.listeningText)} label="Play audio" rate={0.76} /><JapaneseSpeechButton text={courseSpeechText(activeExercise.listeningText)} label="Play slowly" rate={0.64} /></View> : null}
        </View>
        {taskDirection ? <View style={[styles.taskDirection, { borderColor: theme.border, backgroundColor: theme.backgroundSelected }]}><ThemedText type="smallBold">Your task</ThemedText><ThemedText type="small">{taskDirection}{usesTapChoices ? ' Tap one answer below.' : ''}</ThemedText></View> : null}
        {usesTapChoices ? <View style={styles.options}>{activeExercise.options?.map((option) => <QuestionOption key={option.id} label={option.label} selected={false} disabled={saving} onPress={() => void submit(activeExercise.responseKind === 'select' ? option.id : option.label)} />)}</View> : activeExercise.responseKind === 'continue' ? <AppButton label={exerciseLabel(activeExercise)} loading={saving} onPress={() => void submit()} /> : <><TextInput value={response} onChangeText={setResponse} autoCapitalize="none" autoCorrect={false} multiline={activeExercise.responseKind === 'production'} accessibilityLabel="Your Japanese answer" placeholder={activeExercise.responseKind === 'production' ? 'Optional: write a short Japanese sentence' : 'Type your Japanese answer'} placeholderTextColor={theme.textSecondary} style={[styles.input, activeExercise.responseKind === 'production' && styles.productionInput, { color: theme.text, borderColor: theme.border }]} /><AppButton label={exerciseLabel(activeExercise)} loading={saving} onPress={() => void submit()} /></>}
        {activeExercise.responseKind !== 'continue' && !feedback?.canContinue ? <AppButton label={hintLevel ? 'Show a stronger hint' : 'Need a hint'} variant="quiet" loading={saving} onPress={() => void requestHint()} /> : null}
        {(activeExercise.optional || !activeActivity.required) ? <AppButton label={activeExercise.responseKind === 'production' ? 'Skip optional challenge' : 'Skip optional practice'} variant="quiet" loading={saving} onPress={() => void submit()} /> : null}
        {feedback ? <FeedbackPanel feedback={feedback} exercise={activeExercise} onContinue={() => void submit(response, true)} /> : null}
        {feedback && !feedback.kind.startsWith('correct') && notebook ? <AppButton label="Read the fuller notebook note" variant="quiet" onPress={() => router.push(notebook)} /> : null}
      </View>
      {activeActivity.type === 'sentence_production' ? <AiTeacherCard feature="writing_check" label="Optional writing check" userInput={response} context={{ learnerLevel: lesson.contentLevel, targetLevel: lesson.contentLevel, item: { id: activeActivity.id, type: 'course-production', title: activeActivity.title, details: [activeActivity.instruction, activeExercise.prompt] } }} /> : null}
      {feedback && feedback.scheduleForReview ? <AiTeacherCard feature="explain_mistake" label="Optional extra clarification" context={{ learnerLevel: lesson.contentLevel, targetLevel: lesson.contentLevel, item: { id: activeActivity.id, type: 'course-activity', title: activeActivity.title, details: [activeActivity.instruction] }, question: { prompt: activeExercise.prompt, userAnswer: response, correctAnswer: activeExercise.acceptedAnswers?.join(' / '), canonicalExplanation: feedback.explanation } }} /> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  compactHeader: { gap: Spacing.one },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  resume: { borderRadius: Radius.medium, gap: Spacing.one, padding: Spacing.two },
  activitySurface: { borderRadius: Radius.large, borderWidth: 1, gap: Spacing.two, padding: Spacing.three },
  dialogueSurface: { borderLeftWidth: 4 },
  readingSurface: { borderRadius: Radius.medium },
  listeningSurface: { borderStyle: 'dashed' },
  kanjiSurface: { alignItems: 'center' },
  workbookSurface: { borderRadius: Radius.small },
  promptBlock: { gap: Spacing.two, marginTop: Spacing.one },
  readingBlock: { gap: Spacing.two, paddingVertical: Spacing.two },
  audioBlock: { gap: Spacing.two, paddingVertical: Spacing.one },
  options: { alignSelf: 'stretch', gap: Spacing.two, width: '100%' },
  input: { minHeight: 50, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  productionInput: { minHeight: 108, textAlignVertical: 'top' },
  feedback: { borderWidth: 1, borderRadius: Radius.medium, gap: Spacing.one, marginTop: Spacing.one, padding: Spacing.two },
  taskDirection: { borderWidth: 1, borderRadius: Radius.medium, gap: 2, padding: Spacing.two },
});
