import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, router, type Href } from 'expo-router';

import { AudioLessonPlayer } from '@/components/audio-lessons/audio-lesson-player';
import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { ThemedText } from '@/components/themed-text';
import { recordAudioLessonQuestion } from '@/features/audio-lessons/audio-lesson-progress';
import { getPublishedAudioLesson, listPublishedAudioPlaylists } from '@/services/api/audio-lessons-client';
import { downloadAudioLesson } from '@/services/audio/audio-lesson-downloads';
import { cacheAudioLessons, getAudioLessonDownloadUris, getAudioLessonProgress, getCachedAudioLesson, getCachedAudioPlaylists, getAudioLessonFavoriteIds, saveAudioLessonProgress, setAudioLessonFavorite } from '@/services/database/audio-lessons-repository';
import type { AudioLessonProgress, AudioLessonVersion, AudioPlaylist } from '@/types/audio-lessons';

export default function AudioLessonScreen() {
  const { lessonId, playlistId } = useLocalSearchParams<{ lessonId: string; playlistId?: string }>();
  const [lesson, setLesson] = useState<AudioLessonVersion>();
  const [progress, setProgress] = useState<AudioLessonProgress>();
  const [downloadUris, setDownloadUris] = useState<Record<string, string>>({});
  const [playlist, setPlaylist] = useState<AudioPlaylist>();
  const [favorite, setFavorite] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!lessonId) return;
    let loaded: AudioLessonVersion | undefined;
    try { loaded = await getPublishedAudioLesson(lessonId); await cacheAudioLessons([loaded]); } catch { loaded = await getCachedAudioLesson(lessonId); }
    if (!loaded) { setError(true); return; }
    const [savedProgress, localUris, favorites, cachedPlaylists] = await Promise.all([getAudioLessonProgress(loaded.id), getAudioLessonDownloadUris(loaded.id), getAudioLessonFavoriteIds(), getCachedAudioPlaylists()]);
    setLesson(loaded); setProgress(savedProgress); setDownloadUris(localUris); setFavorite(favorites.has(loaded.id));
    if (playlistId) {
      try {
        const remote = await listPublishedAudioPlaylists();
        setPlaylist(remote.find((candidate) => candidate.id === playlistId) ?? cachedPlaylists.find((candidate) => candidate.id === playlistId));
      } catch { setPlaylist(cachedPlaylists.find((candidate) => candidate.id === playlistId)); }
    }
  }, [lessonId, playlistId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const saveProgress = (next: AudioLessonProgress) => { setProgress(next); void saveAudioLessonProgress(next); };
  const toggleFavorite = async () => { if (!lesson) return; const next = !favorite; setFavorite(next); await setAudioLessonFavorite(lesson.id, next); };
  const download = async () => { if (!lesson) return; setDownloading(true); try { await downloadAudioLesson(lesson); setDownloadUris(await getAudioLessonDownloadUris(lesson.id)); } finally { setDownloading(false); } };
  const answer = async (questionId: string, choiceId: string, correct: boolean) => { if (!progress) return; setSelectedAnswers((current) => ({ ...current, [questionId]: choiceId })); const next = recordAudioLessonQuestion(progress, questionId, correct); saveProgress(next); };
  const adjacent = (direction: 'next' | 'previous') => {
    if (!lesson || !playlist) return;
    const current = playlist.lessonIds.indexOf(lesson.lessonId);
    const next = direction === 'next' ? playlist.lessonIds[current + 1] : playlist.lessonIds[current - 1];
    if (next) router.replace({ pathname: '/audio-lessons/[lessonId]', params: { lessonId: next, playlistId: playlist.id } } as Href);
  };

  if (!lesson && !error) return <ScreenContainer scroll={false}><LoadingState label="Loading Audio Lesson…" /></ScreenContainer>;
  if (!lesson || !progress) return <ScreenContainer><EmptyState title="Audio Lesson unavailable" message="Connect once to save a published lesson for offline listening." /></ScreenContainer>;
  return <ScreenContainer>
    <PageHeader eyebrow={`JLPT ${lesson.jlptLevel} · ${lesson.estimatedMinutes} min`} title={lesson.title} subtitle={lesson.subtitle} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><AppButton label={favorite ? 'Remove favorite' : 'Add favorite'} variant="secondary" onPress={() => void toggleFavorite()} /><AppButton label="Download for offline" variant="secondary" loading={downloading} onPress={() => void download()} /></View>
    <AudioLessonPlayer lesson={lesson} initialProgress={progress} downloadUris={downloadUris} onProgress={saveProgress} onPreviousLesson={playlist?.lessonIds.indexOf(lesson.lessonId) ? () => adjacent('previous') : undefined} onNextLesson={playlist && playlist.lessonIds.indexOf(lesson.lessonId) + 1 < playlist.lessonIds.length ? () => adjacent('next') : undefined} />
    <SectionHeading title="Listening checks" detail={`${lesson.listeningQuestions.length} question${lesson.listeningQuestions.length === 1 ? '' : 's'}`} />
    {lesson.listeningQuestions.map((question) => {
      const selected = selectedAnswers[question.id];
      return <Card key={question.id}><ThemedText type="heading">{question.prompt.english ?? question.prompt.japanese?.raw}</ThemedText><ThemedText type="small" themeColor="textSecondary">Pause and answer from what you heard.</ThemedText>{question.choices.map((choice, index) => <AppButton key={choice.id} label={`${index + 1}. ${choice.label.english ?? choice.label.japanese?.raw ?? ''}`} variant={selected === choice.id ? 'primary' : 'secondary'} disabled={Boolean(selected)} onPress={() => void answer(question.id, choice.id, choice.isCorrect)} />)}{selected ? <View style={{ gap: 4 }}><ThemedText type="smallBold">{question.choices.find((choice) => choice.id === selected)?.isCorrect ? 'Correct' : 'Not quite'}</ThemedText><ThemedText themeColor="textSecondary">{question.explanation.correct.english ?? question.explanation.correct.japanese?.raw}</ThemedText></View> : null}</Card>;
    })}
  </ScreenContainer>;
}
