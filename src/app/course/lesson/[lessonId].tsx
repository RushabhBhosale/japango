import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { AiTeacherCard } from '@/components/lesson/ai-teacher-card';
import { JapaneseSpeechButton } from '@/components/lesson/japanese-speech-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCourseLesson, getGuidedCourseLesson, recordCourseActivityHint, startCourseLesson, submitCourseActivity } from '@/services/database/course-repository';
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

function expectedResponseText(exercise: LessonActivityExercise): string | undefined {
  const expected = exercise.expectedResponse;
  if (!expected || expected.script === 'none' || expected.script === 'choice') return expected?.format;
  const script = expected.script === 'hiragana' ? 'Use hiragana.'
    : expected.script === 'katakana' ? 'Use katakana.'
      : expected.script === 'kanji_or_kana' ? 'Kana or the lesson’s written form is accepted.'
        : 'Write a complete Japanese sentence.';
  const politeness = expected.politeness === 'polite' ? ' Use polite Japanese.' : expected.politeness === 'casual' ? ' Use casual Japanese.' : '';
  return expected.format ? `${expected.format} ${politeness}`.trim() : `${script}${politeness}`;
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

function sectionFor(activity: CourseLessonActivitySummary): string {
  if (['vocabulary_intro', 'vocabulary_practice'].includes(activity.type)) return 'Vocabulary';
  if (['grammar_explanation', 'substitution_drill', 'conjugation_drill', 'sentence_transformation', 'sentence_ordering', 'error_correction'].includes(activity.type)) return 'Grammar practice';
  if (['kanji_intro', 'kanji_practice'].includes(activity.type)) return 'Kanji';
  if (['reading', 'timed_reading'].includes(activity.type)) return 'Reading';
  if (['listening', 'dictation', 'shadowing'].includes(activity.type)) return 'Listening';
  if (activity.type === 'checkpoint') return 'Checkpoint';
  return activity.type === 'dialogue' || activity.type === 'story' ? 'Conversation' : 'Lesson';
}

function shouldTransition(from: CourseLessonActivitySummary, next: CourseLessonActivitySummary | undefined): boolean {
  return Boolean(next && next.progress.currentInteractionIndex === 0 && sectionFor(from) !== sectionFor(next));
}

function activityStyle(type: CourseLessonActivitySummary['type']) {
  if (type === 'dialogue' || type === 'story') return styles.dialogueSurface;
  if (type === 'reading' || type === 'timed_reading') return styles.readingSurface;
  if (type === 'listening' || type === 'dictation' || type === 'shadowing') return styles.listeningSurface;
  if (type === 'kanji_intro' || type === 'kanji_practice') return styles.kanjiSurface;
  if (type === 'grammar_explanation' || type === 'substitution_drill' || type === 'conjugation_drill' || type === 'sentence_transformation' || type === 'sentence_ordering') return styles.workbookSurface;
  return undefined;
}

function FeedbackPanel({ feedback, onContinue }: { feedback: CourseAnswerFeedback; onContinue: () => void }) {
  const theme = useTheme();
  const positive = feedback.kind === 'correct';
  return (
    <View accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: positive ? theme.primary : theme.border, backgroundColor: positive ? theme.primarySoft : theme.backgroundSelected }]}>
      <ThemedText type="smallBold">{feedback.title}</ThemedText>
      {feedback.learnerAnswer ? <ThemedText type="small" themeColor="textSecondary">You wrote: {feedback.learnerAnswer}</ThemedText> : null}
      {feedback.acceptedAnswer ? <ThemedText type="smallBold">{positive ? 'Answer: ' : 'Use: '}{feedback.acceptedAnswer}</ThemedText> : null}
      <ThemedText type="small" themeColor="textSecondary">{feedback.explanation}</ThemedText>
      {feedback.hint ? <ThemedText type="small">Hint: {feedback.hint}</ThemedText> : null}
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
  const [overviewVisible, setOverviewVisible] = useState(false);
  const [transition, setTransition] = useState<CourseLessonActivitySummary>();
  const [hintLevel, setHintLevel] = useState(0);
  const [resumeVisible, setResumeVisible] = useState(false);
  const interactionStartedAt = useRef(0);

  const load = useCallback(async () => {
    if (!lessonId) { setError(true); setLoading(false); return; }
    setError(false);
    try {
      const initial = await getCourseLesson(lessonId);
      if (!initial) throw new Error('Lesson unavailable');
      if (initial.progress.state !== 'locked') await startCourseLesson(lessonId);
      const next = await getGuidedCourseLesson(lessonId);
      if (!next) throw new Error('Guided lesson unavailable');
      setGuided(next);
      setResumeVisible(Boolean(initial.progress.startedAt && (next.currentActivity?.progress.currentInteractionIndex || next.currentActivity?.order !== 1)));
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
  const progress = useMemo(() => {
    if (!guided) return 0;
    const interactions = guided.activities.reduce((total, activity) => total + activity.interactionCount, 0);
    const completed = guided.activities.reduce((total, activity) => total + Math.min(activity.progress.currentInteractionIndex, activity.interactionCount), 0);
    return interactions ? Math.round((completed / interactions) * 100) : 0;
  }, [guided]);

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
      const before = activeActivity;
      const result = await submitCourseActivity(lessonId, {
        activityId: activeActivity.id,
        response: value,
        responseTimeMs: Math.max(0, interactionTimestamp() - interactionStartedAt.current),
        hintLevel,
        continueAfterTeaching,
      });
      setGuided(result.lesson);
      setResumeVisible(false);
      if (!result.correct) {
        setFeedback(result.feedback);
        setHintLevel(result.feedback?.hintLevel ?? hintLevel);
      } else {
        const next = result.lesson.currentActivity;
        setResponse('');
        setHintLevel(0);
        setFeedback(undefined);
        if (shouldTransition(before, next)) setTransition(next);
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

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening lesson…" /></ScreenContainer>;
  if (error || !guided) return <ScreenContainer><EmptyState title="Lesson unavailable" message="Your course data is still saved locally. Return to Learn and try again." symbol="!" /><AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn' as Href)} /></ScreenContainer>;
  const { lesson } = guided;
  if (lesson.progress.state === 'locked') return <ScreenContainer><EmptyState title={lesson.title} message="Complete the earlier lesson first, or enable lesson browsing when you want to look ahead." symbol="!" /><AppButton label="Back to course" onPress={() => router.replace(`/course/${lesson.courseId}` as Href)} /></ScreenContainer>;
  if (!activeActivity || !activeExercise) return <ScreenContainer><View style={styles.compactHeader}><ThemedText type="smallBold" themeColor="primary">LESSON {lesson.number}</ThemedText><ThemedText type="heading">{lesson.title}</ThemedText></View><Card><ThemedText type="heading">Lesson complete</ThemedText><ThemedText themeColor="textSecondary">You can now {lesson.objectives.join(', ')}. Your checkpoint, reading, listening, and review schedule are saved.</ThemedText><AppButton label="Back to course" onPress={() => router.replace(`/course/${lesson.courseId}` as Href)} /></Card></ScreenContainer>;

  if (transition) return <ScreenContainer scroll={false} contentStyle={styles.transitionPage}><View style={styles.transition}><ThemedText type="smallBold" themeColor="primary">SECTION COMPLETE</ThemedText><ThemedText type="title">{sectionFor(transition)}</ThemedText><ThemedText>{transition.title}</ThemedText><ThemedText themeColor="textSecondary">{transition.instruction}</ThemedText><AppButton label={sectionFor(transition) === 'Grammar practice' ? 'Start practice' : 'Continue'} onPress={() => setTransition(undefined)} /></View></ScreenContainer>;

  const interactionNumber = activeActivity.progress.currentInteractionIndex + 1;
  const notebook = notebookHref(activeExercise);
  const responseFormat = expectedResponseText(activeExercise);
  return (
    <ScreenContainer keyboardAware>
      <View style={styles.compactHeader}>
        <View style={styles.headerRow}><ThemedText type="smallBold" themeColor="primary">LESSON {lesson.number} · {sectionFor(activeActivity).toUpperCase()}</ThemedText><ThemedText type="small" themeColor="textSecondary">{progress}%</ThemedText></View>
        <ThemedText type="heading">{lesson.title}</ThemedText>
        <View style={styles.headerRow}><ThemedText type="small" themeColor="textSecondary">{activeActivity.title} · {interactionNumber}/{activeActivity.interactionCount}</ThemedText><AppButton label={overviewVisible ? 'Close overview' : 'Overview'} variant="quiet" onPress={() => setOverviewVisible((visible) => !visible)} /></View>
        <ProgressBar value={progress} accessibilityLabel="Guided lesson progress" />
      </View>

      {resumeVisible ? <View style={[styles.resume, { backgroundColor: theme.primarySoft }]}><ThemedText type="smallBold">Welcome back</ThemedText><ThemedText type="small" themeColor="textSecondary">You are continuing with {activeActivity.title}. Your exact place was saved.</ThemedText><AppButton label="Continue" variant="quiet" onPress={() => setResumeVisible(false)} /></View> : null}
      {overviewVisible ? <Card><ThemedText type="smallBold">Lesson overview</ThemedText><ThemedText type="small" themeColor="textSecondary">{lesson.experience.primarySkill} · about {lesson.estimatedMinutes} minutes</ThemedText><ThemedText type="small" themeColor="textSecondary">{lesson.communicationGoal}</ThemedText>{guided.activities.map((activity) => <ThemedText key={activity.id} type="small" themeColor={activity.id === activeActivity.id ? 'text' : 'textSecondary'}>{activity.progress.completedAt ? '✓' : activity.id === activeActivity.id ? '→' : '○'} {sectionFor(activity)} — {activity.title}</ThemedText>)}</Card> : null}

      <View style={[styles.activitySurface, activityStyle(activeActivity.type), { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <ThemedText type="smallBold" themeColor="primary">{sectionFor(activeActivity).toUpperCase()}</ThemedText>
        <ThemedText type="heading">{activeActivity.title}</ThemedText>
        <ThemedText>{activeActivity.instruction}</ThemedText>
        <View style={styles.promptBlock}>
          <ThemedText type="smallBold">{activeExercise.prompt}</ThemedText>
          {activeExercise.readingText ? <View style={styles.readingBlock}><ThemedText type="japanese">{activeExercise.readingText}</ThemedText><JapaneseSpeechButton text={activeExercise.readingText} label="Play passage" rate={0.72} /></View> : null}
          {activeExercise.listeningText ? <View style={styles.audioBlock}><ThemedText type="small" themeColor="textSecondary">Listen before revealing a transcript.</ThemedText><JapaneseSpeechButton text={activeExercise.listeningText} label="Play audio" rate={0.76} /><JapaneseSpeechButton text={activeExercise.listeningText} label="Play slowly" rate={0.64} /></View> : null}
        </View>
        {responseFormat ? <ThemedText type="small" themeColor="textSecondary">{responseFormat}</ThemedText> : null}
        {activeExercise.responseKind === 'select' ? <View style={styles.options}>{activeExercise.options?.map((option) => <AppButton key={option.id} label={option.label} variant="secondary" loading={saving} onPress={() => void submit(option.id)} accessibilityLabel={`Choose ${option.label}`} />)}</View> : activeExercise.responseKind === 'continue' ? <AppButton label={exerciseLabel(activeExercise)} loading={saving} onPress={() => void submit()} /> : <><TextInput value={response} onChangeText={setResponse} autoCapitalize="none" autoCorrect={false} multiline={activeExercise.responseKind === 'production'} accessibilityLabel={responseFormat ?? 'Your Japanese answer'} placeholder={activeExercise.responseKind === 'production' ? 'Write a short Japanese sentence' : 'Type your Japanese answer'} placeholderTextColor={theme.textSecondary} style={[styles.input, activeExercise.responseKind === 'production' && styles.productionInput, { color: theme.text, borderColor: theme.border }]} /><AppButton label={exerciseLabel(activeExercise)} loading={saving} onPress={() => void submit()} /></>}
        {activeExercise.responseKind !== 'continue' && !feedback?.canContinue ? <AppButton label={hintLevel ? 'Show a stronger hint' : 'Need a hint'} variant="quiet" loading={saving} onPress={() => void requestHint()} /> : null}
        {!activeActivity.required ? <AppButton label="Skip optional speaking" variant="quiet" loading={saving} onPress={() => void submit()} /> : null}
        {feedback ? <FeedbackPanel feedback={feedback} onContinue={() => void submit(response, true)} /> : null}
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
  options: { gap: Spacing.two },
  input: { minHeight: 50, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  productionInput: { minHeight: 108, textAlignVertical: 'top' },
  feedback: { borderWidth: 1, borderRadius: Radius.medium, gap: Spacing.one, marginTop: Spacing.one, padding: Spacing.two },
  transitionPage: { justifyContent: 'center', paddingBottom: Spacing.five, paddingTop: Spacing.five },
  transition: { alignSelf: 'stretch', gap: Spacing.three, justifyContent: 'center', minHeight: 360 },
});
