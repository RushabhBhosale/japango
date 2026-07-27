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
import { JapaneseSpeechButton } from '@/components/lesson/japanese-speech-button';
import { ThemedText } from '@/components/themed-text';
import type { TopicQuizMode } from '@/features/topic-quiz/topic-quiz';
import { makeFsrsCardDueNow } from '@/services/database/fsrs-repository';
import { getCourseItemUsage } from '@/services/database/course-repository';
import { getContentNeighbors, getGrammarById, startContentTopicQuiz, toggleContentBookmark } from '@/services/database/content-learning-repository';
import { markCurriculumItemStudied } from '@/services/database/progress-repository';
import { recordStudyContentView } from '@/services/database/study-history-repository';
import type { GrammarLesson } from '@/types/content-learning';
import type { CourseItemUsage } from '@/types/course';

function routeId(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}

export default function GrammarLessonScreen() {
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = routeId(rawId);
  const [lesson, setLesson] = useState<GrammarLesson>();
  const [neighbors, setNeighbors] = useState<{ previousId?: string; nextId?: string }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [courseUsage, setCourseUsage] = useState<CourseItemUsage>();

  const load = useCallback(async () => {
    setFailed(false);
    setLoading(true);
    try {
      // The original N5 foundation patterns intentionally live in the generic
      // canonical view because they predate the richer bundled detail schema.
      // Deep links to the Grammar Notebook must not show a false unavailable
      // state for those valid local items.
      if (id?.startsWith('n5-grammar-')) {
        router.replace(`/curriculum/${encodeURIComponent(id)}` as Href);
        return;
      }
      const [nextLesson, nextNeighbors, usage] = await Promise.all([
        id ? getGrammarById(id) : Promise.resolve(undefined),
        id ? getContentNeighbors(id, 'grammar') : Promise.resolve({}),
        id ? getCourseItemUsage(id) : Promise.resolve(undefined),
      ]);
      setLesson(nextLesson);
      setNeighbors(nextNeighbors);
      setCourseUsage(usage);
      if (nextLesson) void recordStudyContentView(nextLesson.id, 'grammar').catch(() => undefined);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const toggleBookmark = async () => {
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
      const session = await startContentTopicQuiz(lesson.id, 'grammar', mode);
      router.push(`/practice/${encodeURIComponent(session.id)}` as Href);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening grammar…" /></ScreenContainer>;
  if (!lesson || failed) {
    return (
      <ScreenContainer>
        <EmptyState title="Grammar is unavailable" message="This release item could not be opened. Try returning to the notebook and opening it again." symbol="!" />
        <AppButton label="Back to Grammar Notebook" onPress={() => router.replace('/library/grammar' as Href)} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <PageHeader eyebrow={`${lesson.level} grammar`} title={lesson.title} subtitle={lesson.meanings.join('; ')} />
      <Card>
        <StatusBadge status={lesson.mastery.status} />
        <JapaneseSpeechButton text={lesson.title} label="Play grammar pattern" />
        <AppButton label={lesson.bookmarked ? 'Remove bookmark' : 'Bookmark grammar'} variant="quiet" loading={saving} onPress={() => void toggleBookmark()} />
        <AppButton label="Mark as studied" variant="quiet" loading={saving} onPress={() => void markStudied()} />
        <AppButton label="Add to review" variant="quiet" loading={saving} onPress={() => void addToReview()} />
      </Card>

      <SectionHeading title="Meaning and usage" />
      <Card>
        <ThemedText type="heading">{lesson.meanings.join(' · ')}</ThemedText>
        <ThemedText themeColor="textSecondary">{lesson.notes ?? 'Use the formation and examples below as the canonical study guidance for this pattern.'}</ThemedText>
      </Card>

      <SectionHeading title="Formation" />
      <Card>
        {lesson.formation.length ? lesson.formation.map((part) => (
          <ThemedText key={`${part.base}-${part.structure}`}>{part.base}: {part.structure}</ThemedText>
        )) : <ThemedText themeColor="textSecondary">Canonical formation guidance is not available for this pattern yet.</ThemedText>}
      </Card>

      {lesson.examples.length ? (
        <>
          <SectionHeading title="Examples" />
          {lesson.examples.map((example) => (
            <Card key={example.id}>
              <ThemedText type="japanese">{example.japanese}</ThemedText>
              <ThemedText themeColor="textSecondary">{example.reading}</ThemedText>
              <ThemedText>{example.meaning}</ThemedText>
              <JapaneseSpeechButton text={example.japanese} label="Play example" rate={0.76} />
            </Card>
          ))}
        </>
      ) : null}

      {lesson.relatedGrammar.length ? (
        <>
          <SectionHeading title="Related grammar" />
          {lesson.relatedGrammar.map((item) => (
            <AppButton key={item.id} label={`${item.title} · ${item.meaning ?? ''}`} variant="secondary" onPress={() => router.push(`/grammar/${encodeURIComponent(item.id)}` as Href)} />
          ))}
        </>
      ) : null}

      {courseUsage?.usedIn.length ? <><SectionHeading title="Course connections" /><Card><ThemedText>Introduced in: {courseUsage.introducedIn ? `Lesson ${courseUsage.introducedIn.lessonNumber} — ${courseUsage.introducedIn.title}` : 'Study Library'}</ThemedText><ThemedText themeColor="textSecondary">Used in: {courseUsage.usedIn.map((entry) => `Lesson ${entry.lessonNumber}`).join(', ')}</ThemedText></Card></> : null}

      <SectionHeading title="Topic quiz" detail={`${lesson.questionCount} canonical questions`} />
      <ThemedText type="small" themeColor="textSecondary">Quick has 5 questions, Standard has 10 deterministic variants when needed, and Full uses every canonical question.</ThemedText>
      <AppButton label="Quick quiz · 5 questions" loading={saving} disabled={!lesson.questionCount} onPress={() => void startQuiz('quick')} />
      <AppButton label="Standard quiz · 10 questions" variant="secondary" loading={saving} disabled={!lesson.questionCount} onPress={() => void startQuiz('standard')} />
      <AppButton label="Full practice" variant="secondary" loading={saving} disabled={!lesson.questionCount} onPress={() => void startQuiz('full')} />

      <AiTeacherCard feature="explain_grammar" label="Explain simply" moreExamples context={{ learnerLevel: lesson.level, item: { id: lesson.id, type: 'grammar', title: lesson.title, meaning: lesson.meanings.join('; '), details: [...lesson.formation.map((part) => `${part.base}: ${part.structure}`), lesson.notes ?? ''].filter(Boolean) } }} />

      <SectionHeading title="Navigate grammar" />
      {neighbors.previousId ? <AppButton label="Previous lesson" variant="quiet" onPress={() => router.replace(`/grammar/${encodeURIComponent(neighbors.previousId!)}` as Href)} /> : null}
      {neighbors.nextId ? <AppButton label="Next lesson" variant="quiet" onPress={() => router.replace(`/grammar/${encodeURIComponent(neighbors.nextId!)}` as Href)} /> : null}
    </ScreenContainer>
  );
}
