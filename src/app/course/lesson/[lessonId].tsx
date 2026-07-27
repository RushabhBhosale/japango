import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { JapaneseSpeechButton } from '@/components/lesson/japanese-speech-button';
import { AiTeacherCard } from '@/components/lesson/ai-teacher-card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCourseLesson, getGuidedCourseLesson, startCourseLesson, submitCourseActivity } from '@/services/database/course-repository';
import type { GuidedCourseLesson, LessonActivityExercise } from '@/types/course';

function routeId(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}

function exerciseLabel(exercise: LessonActivityExercise): string {
  if (exercise.responseKind === 'continue') return 'Continue';
  if (exercise.responseKind === 'production') return 'Save my sentence';
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

function interactionTimestamp(): number {
  return Date.now();
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
  const [feedback, setFeedback] = useState<{ correct: boolean; explanation?: string }>();
  const [overviewVisible, setOverviewVisible] = useState(false);
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
      setResponse('');
      setFeedback(undefined);
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

  const submit = async (selectedResponse?: string) => {
    if (!lessonId || !activeActivity || !activeExercise) return;
    const value = selectedResponse ?? response;
    if ((activeExercise.responseKind === 'typed' || activeExercise.responseKind === 'production') && !value.trim()) {
      setFeedback({ correct: false, explanation: 'Write an answer before continuing.' });
      return;
    }
    setResponse(value);
    setSaving(true);
    try {
      const result = await submitCourseActivity(lessonId, {
        activityId: activeActivity.id,
        response: value,
        responseTimeMs: Math.max(0, interactionTimestamp() - interactionStartedAt.current),
      });
      setGuided(result.lesson);
      if (!result.correct) setFeedback({ correct: false, explanation: result.explanation ?? 'Try again. Your response is saved so this weak point can be reviewed.' });
      else {
        setResponse('');
        setFeedback(undefined);
        interactionStartedAt.current = interactionTimestamp();
      }
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening lesson…" /></ScreenContainer>;
  if (error || !guided) return <ScreenContainer><EmptyState title="Lesson unavailable" message="Your course data is still saved locally. Return to Learn and try again." symbol="!" /><AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn' as Href)} /></ScreenContainer>;
  const { lesson } = guided;
  if (lesson.progress.state === 'locked') return <ScreenContainer><PageHeader eyebrow="Course lesson" title={lesson.title} subtitle="This lesson has a prerequisite." /><Card><ThemedText>Complete the earlier lesson first, or enable lesson browsing when you want to look ahead.</ThemedText></Card><AppButton label="Back to course" onPress={() => router.replace(`/course/${lesson.courseId}` as Href)} /></ScreenContainer>;
  if (!activeActivity || !activeExercise) return <ScreenContainer><PageHeader eyebrow={`Lesson ${lesson.number}`} title={lesson.title} subtitle="Guided lesson complete" /><Card><ThemedText type="heading">Chapter complete</ThemedText><ThemedText themeColor="textSecondary">Your checkpoint, reading, listening, and production work are saved. FSRS will continue to schedule the items that need attention.</ThemedText><AppButton label="Back to course" onPress={() => router.replace(`/course/${lesson.courseId}` as Href)} /></Card></ScreenContainer>;

  const activityNumber = activeActivity.order;
  const interactionNumber = activeActivity.progress.currentInteractionIndex + 1;
  const notebook = notebookHref(activeExercise);
  return (
    <ScreenContainer>
      <PageHeader eyebrow={`Lesson ${lesson.number} · ${lesson.theme}`} title={lesson.title} subtitle={lesson.communicationGoal} />
      <Card>
        <View style={styles.progressHeader}><ThemedText type="smallBold">Activity {activityNumber} of {guided.activities.length}</ThemedText><ThemedText type="small" themeColor="textSecondary">{progress}% complete</ThemedText></View>
        <ProgressBar value={progress} accessibilityLabel="Guided lesson progress" />
        <ThemedText type="small" themeColor="textSecondary">{lesson.estimatedMinutes} minutes · {lesson.vocabularyIds.length} words · {lesson.patternObjectives.length} patterns · {lesson.kanjiIds.length} kanji</ThemedText>
        <AppButton label={overviewVisible ? 'Hide lesson overview' : 'Lesson overview'} variant="quiet" onPress={() => setOverviewVisible((visible) => !visible)} />
      </Card>

      {overviewVisible ? <Card><ThemedText type="smallBold">What comes next</ThemedText>{guided.activities.map((activity) => <ThemedText key={activity.id} type="small" themeColor={activity.id === activeActivity.id ? 'text' : 'textSecondary'}>{activity.progress.completedAt ? '✓' : activity.id === activeActivity.id ? '→' : '○'} {activity.order}. {activity.title}</ThemedText>)}</Card> : null}

      <SectionHeading title={activeActivity.title} detail={`${interactionNumber}/${activeActivity.interactionCount}`} />
      <Card>
        <ThemedText>{activeActivity.instruction}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">About {activeActivity.estimatedMinutes} minutes. You can leave at any time; this exact interaction is saved.</ThemedText>
      </Card>
      <Card>
        <ThemedText type="smallBold">{activeExercise.prompt}</ThemedText>
        {activeExercise.readingText ? <View style={styles.textBlock}><ThemedText type="japanese">{activeExercise.readingText}</ThemedText><JapaneseSpeechButton text={activeExercise.readingText} label="Play passage" rate={0.72} /></View> : null}
        {activeExercise.listeningText ? <View style={styles.textBlock}><JapaneseSpeechButton text={activeExercise.listeningText} label="Play audio" rate={0.76} /><JapaneseSpeechButton text={activeExercise.listeningText} label="Play slowly" rate={0.64} /></View> : null}
        {activeExercise.responseKind === 'select' ? <View style={styles.options}>{activeExercise.options?.map((option) => <AppButton key={option.id} label={option.label} variant="secondary" loading={saving} onPress={() => void submit(option.id)} />)}</View> : activeExercise.responseKind === 'continue' ? <AppButton label={exerciseLabel(activeExercise)} loading={saving} onPress={() => void submit()} /> : <><TextInput value={response} onChangeText={setResponse} autoCapitalize="none" autoCorrect={false} multiline={activeExercise.responseKind === 'production'} accessibilityLabel="Your Japanese answer" placeholder={activeExercise.responseKind === 'production' ? 'Write a short Japanese sentence' : 'Type your answer in Japanese'} placeholderTextColor={theme.textSecondary} style={[styles.input, activeExercise.responseKind === 'production' && styles.productionInput, { color: theme.text, borderColor: theme.border }]} /><AppButton label={exerciseLabel(activeExercise)} loading={saving} onPress={() => void submit()} /></>}
        {!activeActivity.required ? <AppButton label="Skip optional speaking practice" variant="quiet" loading={saving} onPress={() => void submit()} /> : null}
        {feedback ? <View style={[styles.feedback, { borderColor: feedback.correct ? theme.primary : theme.border, backgroundColor: feedback.correct ? theme.primarySoft : theme.backgroundSelected }]}><ThemedText type="smallBold">{feedback.correct ? 'Saved' : 'Not quite'}</ThemedText>{feedback.explanation ? <ThemedText type="small" themeColor="textSecondary">{feedback.explanation}</ThemedText> : null}</View> : null}
        {notebook ? <AppButton label="Open in Study Library" variant="quiet" onPress={() => router.push(notebook)} /> : null}
      </Card>
      {activeActivity.type === 'sentence_production' ? <AiTeacherCard feature="writing_check" label="Optional AI writing check" userInput={response} context={{ learnerLevel: lesson.contentLevel, targetLevel: lesson.contentLevel, item: { id: activeActivity.id, type: 'course-production', title: activeActivity.title, details: [activeActivity.instruction, activeExercise.prompt] } }} /> : null}
      {feedback && !feedback.correct ? <AiTeacherCard feature="explain_mistake" label="Optional AI clarification" context={{ learnerLevel: lesson.contentLevel, targetLevel: lesson.contentLevel, item: { id: activeActivity.id, type: 'course-activity', title: activeActivity.title, details: [activeActivity.instruction] }, question: { prompt: activeExercise.prompt, userAnswer: response, correctAnswer: activeExercise.acceptedAnswers?.join(' / '), canonicalExplanation: feedback.explanation } }} /> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  progressHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  options: { gap: Spacing.two },
  textBlock: { gap: Spacing.two, marginTop: Spacing.two },
  input: { minHeight: 50, borderWidth: 1, borderRadius: Radius.medium, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  productionInput: { minHeight: 108, textAlignVertical: 'top' },
  feedback: { borderWidth: 1, borderRadius: Radius.medium, gap: Spacing.one, marginTop: Spacing.two, padding: Spacing.two },
});
