import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { StatusBadge } from '@/components/common/status-badge';
import { AiTeacherCard } from '@/components/lesson/ai-teacher-card';
import { JapaneseText } from '@/components/lesson/japanese-text';
import { JapaneseSpeechButton } from '@/components/lesson/japanese-speech-button';
import { ThemedText } from '@/components/themed-text';
import type { TopicQuizMode } from '@/features/topic-quiz/topic-quiz';
import { makeFsrsCardDueNow } from '@/services/database/fsrs-repository';
import { getCourseItemUsage } from '@/services/database/course-repository';
import { getContentNeighbors, getKanjiById, startContentTopicQuiz, toggleContentBookmark } from '@/services/database/content-learning-repository';
import { markCurriculumItemStudied } from '@/services/database/progress-repository';
import { recordStudyContentView } from '@/services/database/study-history-repository';
import type { KanjiLesson } from '@/types/content-learning';
import type { CourseItemUsage } from '@/types/course';

function routeId(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}

export default function KanjiLessonScreen() {
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = routeId(rawId);
  const [lesson, setLesson] = useState<KanjiLesson>();
  const [neighbors, setNeighbors] = useState<{ previousId?: string; nextId?: string }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [courseUsage, setCourseUsage] = useState<CourseItemUsage>();

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [nextLesson, nextNeighbors, usage] = await Promise.all([
        id ? getKanjiById(id) : Promise.resolve(undefined),
        id ? getContentNeighbors(id, 'kanji') : Promise.resolve({}),
        id ? getCourseItemUsage(id) : Promise.resolve(undefined),
      ]);
      setLesson(nextLesson);
      setNeighbors(nextNeighbors);
      setCourseUsage(usage);
      if (nextLesson) void recordStudyContentView(nextLesson.id, 'kanji').catch(() => undefined);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const bookmark = async () => {
    if (!lesson) return;
    setSaving(true);
    try {
      const bookmarked = await toggleContentBookmark(lesson.id);
      setLesson((current) => current ? { ...current, bookmarked } : current);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const markStudied = async () => {
    if (!lesson) return;
    setSaving(true);
    try {
      const mastery = await markCurriculumItemStudied(lesson.id);
      setLesson((current) => current ? { ...current, mastery } : current);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const addToReview = async () => {
    if (!lesson) return;
    setSaving(true);
    try {
      await makeFsrsCardDueNow(lesson.id);
      await load();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const startQuiz = async (mode: TopicQuizMode) => {
    if (!lesson) return;
    setSaving(true);
    try {
      const session = await startContentTopicQuiz(lesson.id, 'kanji', mode);
      router.push(`/practice/${encodeURIComponent(session.id)}` as Href);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening kanji…" /></ScreenContainer>;
  if (!lesson || failed) return <ScreenContainer><EmptyState title="Kanji is unavailable" message="This release item could not be opened. Try returning to the notebook and opening it again." symbol="!" /><AppButton label="Back to Kanji Notebook" onPress={() => router.replace('/library/kanji' as Href)} /></ScreenContainer>;
  return (
    <ScreenContainer>
      <PageHeader eyebrow={`${lesson.level} kanji`} title={lesson.title} subtitle={lesson.meanings.join('; ')} />
      <Card>
        <JapaneseText type="japanese">{lesson.title}</JapaneseText>
        <StatusBadge status={lesson.mastery.status} />
        <ThemedText>On: {lesson.onReadings.join(' · ') || '—'}</ThemedText>
        <ThemedText>Kun: {lesson.kunReadings.join(' · ') || '—'}</ThemedText>
        {lesson.strokeCount ? <ThemedText>Strokes: {lesson.strokeCount}</ThemedText> : null}
        {lesson.components.length ? <ThemedText themeColor="textSecondary">Components: {lesson.components.join(' · ')}</ThemedText> : null}
        <JapaneseSpeechButton text={[...lesson.onReadings, ...lesson.kunReadings].join('、')} label="Hear readings" />
        <AppButton label={lesson.bookmarked ? 'Remove bookmark' : 'Bookmark kanji'} variant="quiet" loading={saving} onPress={() => void bookmark()} />
        <AppButton label="Mark as studied" variant="quiet" loading={saving} onPress={() => void markStudied()} />
        <AppButton label="Add to review" variant="quiet" loading={saving} onPress={() => void addToReview()} />
      </Card>

      <SectionHeading title="Your review progress" />
      <Card><ThemedText>FSRS state: {lesson.fsrsCard.state.replaceAll('-', ' ')}</ThemedText><ThemedText>Next review: {new Date(lesson.fsrsCard.dueAt).toLocaleDateString()}</ThemedText><ThemedText themeColor="textSecondary">Recent accuracy: {lesson.recentAccuracy === undefined ? 'Not enough answers yet' : `${lesson.recentAccuracy}%`}</ThemedText></Card>

      {lesson.linkedVocabulary.length ? <><SectionHeading title="Vocabulary using this kanji" />{lesson.linkedVocabulary.map((item) => <Card key={item.id}><JapaneseText type="japanese">{item.title}</JapaneseText><ThemedText>{item.meaning}</ThemedText><JapaneseSpeechButton text={item.title} label="Play word" /><AppButton label="Open vocabulary" variant="quiet" onPress={() => router.push(`/vocabulary/${encodeURIComponent(item.id)}` as Href)} /></Card>)}</> : null}
      {lesson.examples.length ? <><SectionHeading title="Examples" />{lesson.examples.map((example) => <Card key={example.id}><JapaneseText type="japanese">{example.japanese}</JapaneseText><ThemedText themeColor="textSecondary">{example.reading}</ThemedText><ThemedText>{example.meaning}</ThemedText></Card>)}</> : null}
      {lesson.relatedKanji.length ? <><SectionHeading title="Related kanji" />{lesson.relatedKanji.map((item) => <AppButton key={item.id} label={`${item.title} · ${item.meaning ?? ''}`} variant="secondary" onPress={() => router.push(`/kanji/${encodeURIComponent(item.id)}` as Href)} />)}</> : null}

      {courseUsage?.usedIn.length ? <><SectionHeading title="Course connections" /><Card><ThemedText>Introduced in: {courseUsage.introducedIn ? `Lesson ${courseUsage.introducedIn.lessonNumber} — ${courseUsage.introducedIn.title}` : 'Study Library'}</ThemedText><ThemedText themeColor="textSecondary">Used in: {courseUsage.usedIn.map((entry) => `Lesson ${entry.lessonNumber}`).join(', ')}</ThemedText></Card></> : null}

      <SectionHeading title="Flashcards" />
      <AppButton label="Start flashcards for this kanji" onPress={() => router.push(`/library/flashcards?set=custom&itemIds=${encodeURIComponent(lesson.id)}` as Href)} />

      <SectionHeading title="Kanji quiz" detail={`${lesson.questionCount} canonical questions`} />
      {lesson.questionCount ? <><AppButton label="Quick quiz · 5 questions" loading={saving} onPress={() => void startQuiz('quick')} /><AppButton label="Standard quiz · 10 questions" variant="secondary" loading={saving} onPress={() => void startQuiz('standard')} /><AppButton label="Full practice" variant="secondary" loading={saving} onPress={() => void startQuiz('full')} /></> : <ThemedText themeColor="textSecondary">A canonical quiz is not available for this character yet. Flashcards remain available.</ThemedText>}

      <AiTeacherCard feature="explain_kanji" label="Explain this kanji" moreExamples context={{ learnerLevel: lesson.level, item: { id: lesson.id, type: 'kanji', title: lesson.title, meaning: lesson.meanings.join('; '), details: [`On: ${lesson.onReadings.join(' · ')}`, `Kun: ${lesson.kunReadings.join(' · ')}`, ...lesson.components] } }} />
      <SectionHeading title="Navigate kanji" />
      {neighbors.previousId ? <AppButton label="Previous kanji" variant="quiet" onPress={() => router.replace(`/kanji/${encodeURIComponent(neighbors.previousId!)}` as Href)} /> : null}
      {neighbors.nextId ? <AppButton label="Next kanji" variant="quiet" onPress={() => router.replace(`/kanji/${encodeURIComponent(neighbors.nextId!)}` as Href)} /> : null}
    </ScreenContainer>
  );
}
