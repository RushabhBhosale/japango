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
import { JapaneseSpeechButton } from '@/components/lesson/japanese-speech-button';
import { AiTeacherCard } from '@/components/lesson/ai-teacher-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  getVocabularyLessonById,
  recordVocabularyRating,
  startVocabularySession,
  toggleVocabularyBookmark,
} from '@/services/database/vocabulary-repository';
import { setFsrsCardState } from '@/services/database/fsrs-repository';
import type { VocabularyLesson } from '@/types/study';

function routeId(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}

export default function VocabularyLessonScreen() {
  const { id: rawId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = routeId(rawId);
  const [lesson, setLesson] = useState<VocabularyLesson>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setError(true);
      return;
    }
    setError(false);
    try {
      setLesson(await getVocabularyLessonById(id));
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
      router.back();
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

  const startPractice = async () => {
    if (!lesson) return;
    setSaving(true);
    try {
      const session = await startVocabularySession([lesson.id]);
      router.push(`/vocabulary/session?sessionId=${encodeURIComponent(session.id)}` as Href);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const changeReviewAvailability = async (action: 'bury' | 'suspend') => {
    if (!lesson) return;
    setSaving(true);
    try {
      await setFsrsCardState(lesson.id, action);
      router.back();
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
        <AppButton label="Back to Learn" onPress={() => router.replace('/(tabs)/learn')} />
      </ScreenContainer>
    );
  }

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
        <JapaneseSpeechButton text={lesson.title} />
        <AppButton
          label={lesson.bookmarked ? 'Remove bookmark' : 'Bookmark word'}
          variant="quiet"
          loading={saving}
          onPress={() => void toggleBookmark()}
        />
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

      <AiTeacherCard feature="explain_vocabulary" label="Explain simply" moreExamples context={{ learnerLevel: lesson.level, item: { id: lesson.id, type: 'vocabulary', title: lesson.title, meaning: lesson.meaning, reading: lesson.reading, details: [...lesson.partOfSpeech, lesson.example?.japanese ?? ''].filter(Boolean) } }} />

      <SectionHeading title="Practise" />
      <AppButton label="Start a question" loading={saving} onPress={() => void startPractice()} />
      <ThemedText type="small" themeColor="textSecondary">Rate this word to update its local review schedule.</ThemedText>
      <View style={styles.ratingButtons}>
        <AppButton label="Again" variant="secondary" loading={saving} onPress={() => void rate('again')} />
        <AppButton label="Hard" variant="secondary" loading={saving} onPress={() => void rate('hard')} />
        <AppButton label="Good" variant="secondary" loading={saving} onPress={() => void rate('good')} />
        <AppButton label="Easy" variant="secondary" loading={saving} onPress={() => void rate('easy')} />
      </View>
      <AppButton label="Bury until tomorrow" variant="quiet" loading={saving} onPress={() => void changeReviewAvailability('bury')} />
      <AppButton label="Suspend this card" variant="quiet" loading={saving} onPress={() => void changeReviewAvailability('suspend')} />
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
