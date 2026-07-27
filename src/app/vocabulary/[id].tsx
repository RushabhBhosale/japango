import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { Spacing } from '@/constants/theme';
import type { TopicQuizMode } from '@/features/topic-quiz/topic-quiz';
import { makeFsrsCardDueNow } from '@/services/database/fsrs-repository';
import { getCourseItemUsage } from '@/services/database/course-repository';
import { markCurriculumItemStudied } from '@/services/database/progress-repository';
import {
  getVocabularyLessonById,
  getVocabularyNotebookItems,
  recordVocabularyRating,
  startVocabularyTopicQuiz,
  toggleVocabularyBookmark,
} from '@/services/database/vocabulary-repository';
import { recordStudyContentView } from '@/services/database/study-history-repository';
import type { VocabularyLesson } from '@/types/study';
import type { CourseItemUsage } from '@/types/course';

function routeId(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}

export default function VocabularyLessonScreen() {
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = routeId(rawId);
  const [lesson, setLesson] = useState<VocabularyLesson>();
  const [neighbors, setNeighbors] = useState<{ previousId?: string; nextId?: string }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [courseUsage, setCourseUsage] = useState<CourseItemUsage>();

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setError(true);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const [nextLesson, allItems, usage] = await Promise.all([
        getVocabularyLessonById(id),
        getVocabularyNotebookItems({ level: 'all', limit: 120, offset: 0 }),
        getCourseItemUsage(id),
      ]);
      setLesson(nextLesson);
      setCourseUsage(usage);
      if (nextLesson) void recordStudyContentView(nextLesson.id, 'vocabulary').catch(() => undefined);
      const index = allItems.findIndex((item) => item.id === id);
      setNeighbors({ previousId: index > 0 ? allItems[index - 1]?.id : undefined, nextId: index >= 0 ? allItems[index + 1]?.id : undefined });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const rate = async (rating: 'again' | 'hard' | 'good' | 'easy') => {
    if (!lesson) return;
    setSaving(true);
    try {
      await recordVocabularyRating(lesson.id, rating);
      await load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const toggleBookmark = async () => {
    if (!lesson) return;
    setSaving(true);
    try {
      const bookmarked = await toggleVocabularyBookmark(lesson.id);
      setLesson((current) => current ? { ...current, bookmarked } : current);
    } catch {
      setError(true);
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
      setError(true);
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
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const startQuiz = async (mode: TopicQuizMode) => {
    if (!lesson) return;
    setSaving(true);
    try {
      const session = await startVocabularyTopicQuiz([lesson.id], mode);
      router.push(`/vocabulary/session?sessionId=${encodeURIComponent(session.id)}` as Href);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Opening vocabulary…" /></ScreenContainer>;
  if (error || !lesson) {
    return (
      <ScreenContainer contentStyle={styles.centered}>
        <EmptyState title="Vocabulary is unavailable" message="This item is not in the installed release curriculum." symbol="!" />
        <AppButton label="Back to Vocabulary Notebook" onPress={() => router.replace('/library/vocabulary' as Href)} />
      </ScreenContainer>
    );
  }

  const isTransitive = lesson.partOfSpeech.includes('transitive-verb');
  const isIntransitive = lesson.partOfSpeech.includes('intransitive-verb');
  return (
    <ScreenContainer>
      <PageHeader eyebrow={`${lesson.level} vocabulary`} title={lesson.title} subtitle={lesson.meaning ?? ''} />
      <Card>
        <View style={styles.topRow}>
          <ThemedText type="smallBold" themeColor="primary">{lesson.level} · {lesson.partOfSpeech.join(' · ')}</ThemedText>
          <StatusBadge status={lesson.mastery.status} />
        </View>
        {lesson.reading && lesson.reading !== lesson.title ? <ThemedText type="japanese">{lesson.reading}</ThemedText> : null}
        <ThemedText type="heading">{lesson.meaning}</ThemedText>
        {isTransitive || isIntransitive ? <ThemedText themeColor="textSecondary">{isTransitive ? 'Transitive verb' : 'Intransitive verb'}</ThemedText> : null}
        <JapaneseSpeechButton text={lesson.title} label="Hear pronunciation" />
        <AppButton label={lesson.bookmarked ? 'Remove bookmark' : 'Bookmark word'} variant="quiet" loading={saving} onPress={() => void toggleBookmark()} />
        <AppButton label="Mark as studied" variant="quiet" loading={saving} onPress={() => void markStudied()} />
        <AppButton label="Add to review" variant="quiet" loading={saving} onPress={() => void addToReview()} />
      </Card>

      <SectionHeading title="Your review progress" />
      <Card>
        <ThemedText>FSRS state: {lesson.fsrsCard.state.replaceAll('-', ' ')}</ThemedText>
        <ThemedText>Next review: {new Date(lesson.fsrsCard.dueAt).toLocaleDateString()}</ThemedText>
        <ThemedText themeColor="textSecondary">Recent accuracy: {lesson.recentAccuracy === undefined ? 'Not enough answers yet' : `${lesson.recentAccuracy}%`}</ThemedText>
      </Card>

      {lesson.example ? (
        <>
          <SectionHeading title="In context" />
          <Card>
            <ThemedText type="japanese">{lesson.example.japanese}</ThemedText>
            <ThemedText themeColor="textSecondary">{lesson.example.reading}</ThemedText>
            <ThemedText>{lesson.example.meaning}</ThemedText>
            <JapaneseSpeechButton text={lesson.example.japanese} label="Play sentence" rate={0.76} />
          </Card>
        </>
      ) : null}

      {lesson.linkedKanji.length ? (
        <>
          <SectionHeading title="Linked kanji" />
          <Card>
            {lesson.linkedKanji.map((kanji) => (
              <View key={kanji.id} style={styles.kanjiRow}>
                <ThemedText type="japanese">{kanji.written}</ThemedText>
                <ThemedText style={styles.kanjiMeaning}>{kanji.meaning}</ThemedText>
                {kanji.reading ? <ThemedText type="small" themeColor="textSecondary">{kanji.reading}</ThemedText> : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {courseUsage?.usedIn.length ? <><SectionHeading title="Course connections" /><Card><ThemedText>Introduced in: {courseUsage.introducedIn ? `Lesson ${courseUsage.introducedIn.lessonNumber} — ${courseUsage.introducedIn.title}` : 'Study Library'}</ThemedText><ThemedText themeColor="textSecondary">Used in: {courseUsage.usedIn.map((entry) => `Lesson ${entry.lessonNumber}`).join(', ')}</ThemedText></Card></> : null}

      <SectionHeading title="Topic quiz" />
      <ThemedText type="small" themeColor="textSecondary">Quick has 5 questions, Standard has 10 deterministic variants when needed, and Full uses every canonical question.</ThemedText>
      <AppButton label="Quick quiz · 5 questions" loading={saving} onPress={() => void startQuiz('quick')} />
      <AppButton label="Standard quiz · 10 questions" variant="secondary" loading={saving} onPress={() => void startQuiz('standard')} />
      <AppButton label="Full practice" variant="secondary" loading={saving} onPress={() => void startQuiz('full')} />

      <SectionHeading title="Rate your recall" />
      <ThemedText type="small" themeColor="textSecondary">Use these only after recalling the word; they update the same FSRS schedule used by Review.</ThemedText>
      <View style={styles.ratingButtons}>
        <AppButton label="Again" variant="secondary" loading={saving} onPress={() => void rate('again')} />
        <AppButton label="Hard" variant="secondary" loading={saving} onPress={() => void rate('hard')} />
        <AppButton label="Good" variant="secondary" loading={saving} onPress={() => void rate('good')} />
        <AppButton label="Easy" variant="secondary" loading={saving} onPress={() => void rate('easy')} />
      </View>

      <AiTeacherCard feature="explain_vocabulary" label="Explain simply" moreExamples context={{ learnerLevel: lesson.level, item: { id: lesson.id, type: 'vocabulary', title: lesson.title, meaning: lesson.meaning, reading: lesson.reading, details: [...lesson.partOfSpeech, lesson.example?.japanese ?? ''].filter(Boolean) } }} />

      <SectionHeading title="Navigate vocabulary" />
      {neighbors.previousId ? <AppButton label="Previous word" variant="quiet" onPress={() => router.replace(`/vocabulary/${encodeURIComponent(neighbors.previousId!)}` as Href)} /> : null}
      {neighbors.nextId ? <AppButton label="Next word" variant="quiet" onPress={() => router.replace(`/vocabulary/${encodeURIComponent(neighbors.nextId!)}` as Href)} /> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  kanjiRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  kanjiMeaning: { flex: 1 },
  ratingButtons: { gap: Spacing.two },
});
