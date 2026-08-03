import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { LessonV2Section } from '@/components/lessons-v2/lesson-v2-section';
import { getPublishedLessonV2 } from '@/services/api/lessons-v2-client';
import { recordLessonsV2Completion } from '@/features/lessons-v2/lesson-flow';
import { cacheLessonsV2, getCachedLessonV2, getLessonsV2FuriganaMode, getLessonsV2Progress, recordLessonsV2Attempt, saveLessonsV2Progress, setLessonsV2FuriganaMode } from '@/services/database/lessons-v2-repository';
import type { LessonV2Question, LessonV2Version, LessonsV2FuriganaMode } from '@/types/lessons-v2';

export default function LessonsV2LessonScreen() {
  const { lessonId } = useLocalSearchParams<{ lessonId: string }>();
  const [lesson, setLesson] = useState<LessonV2Version>();
  const [furiganaMode, setFuriganaMode] = useState<LessonsV2FuriganaMode>('hidden');
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!lessonId) return;
    try {
      const published = await getPublishedLessonV2(lessonId);
      await cacheLessonsV2([published]);
      setLesson(published);
    } catch {
      const cached = await getCachedLessonV2(lessonId);
      if (!cached) { setError(true); return; }
      setLesson(cached);
    }
    setFuriganaMode(await getLessonsV2FuriganaMode());
  }, [lessonId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const answer = async (question: LessonV2Question, choiceId: string, correct: boolean) => {
    if (!lesson) return;
    await recordLessonsV2Attempt({ lessonVersionId: lesson.id, questionId: question.id, selectedChoiceId: choiceId, correct, responseTimeMs: 0 });
    const progress = await getLessonsV2Progress(lesson.id);
    const section = lesson.sections.find((candidate) => candidate.questions.some((candidateQuestion) => candidateQuestion.id === question.id));
    if (section) await saveLessonsV2Progress(recordLessonsV2Completion(progress, section.id, question.id));
  };

  const toggleFurigana = async () => {
    const next: LessonsV2FuriganaMode = furiganaMode === 'hidden' ? 'always' : 'hidden';
    setFuriganaMode(next);
    await setLessonsV2FuriganaMode(next);
  };

  if (!lesson && !error) return <ScreenContainer scroll={false}><LoadingState label="Loading lesson…" /></ScreenContainer>;
  if (!lesson) return <ScreenContainer><EmptyState title="Lesson unavailable" message="Connect once to save this published V2 lesson on your device." /></ScreenContainer>;
  return <ScreenContainer>
    <PageHeader eyebrow={`JLPT ${lesson.level} · V${lesson.version}`} title={lesson.title} subtitle={`${lesson.estimatedMinutes} minutes · ${lesson.objectives.join(' · ')}`} />
    <AppButton label={furiganaMode === 'hidden' ? 'Show furigana' : 'Hide furigana'} variant="secondary" onPress={() => void toggleFurigana()} />
    {lesson.sections.map((section) => <LessonV2Section key={section.id} section={section} furiganaMode={furiganaMode} onAnswered={(question, choiceId, correct) => void answer(question, choiceId, correct)} />)}
    <View><AppButton label="Lesson complete" onPress={() => undefined} /></View>
  </ScreenContainer>;
}
