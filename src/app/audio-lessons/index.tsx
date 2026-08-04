import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect, type Href } from 'expo-router';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { EmptyState } from '@/components/common/empty-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listPublishedAudioLessons, listPublishedAudioPlaylists } from '@/services/api/audio-lessons-client';
import { cacheAudioLessons, cacheAudioPlaylists, getAudioLessonFavoriteIds, getAudioLessonProgress, getCachedAudioLessons, getCachedAudioPlaylists, isAudioLessonDownloaded } from '@/services/database/audio-lessons-repository';
import type { AudioLessonType, AudioLessonVersion, AudioPlaylist } from '@/types/audio-lessons';

type LibraryScope = 'all' | 'incomplete' | 'completed' | 'downloaded' | 'favorites' | 'recent';

const lessonTypes: readonly { value: AudioLessonType; label: string }[] = [
  { value: 'grammar_explanation', label: 'Grammar' }, { value: 'vocabulary_review', label: 'Vocabulary' },
  { value: 'dialogue_practice', label: 'Dialogues' }, { value: 'sentence_pattern_drill', label: 'Patterns' },
  { value: 'listening_comprehension', label: 'Listening' }, { value: 'short_story', label: 'Stories' },
  { value: 'jlpt_listening_practice', label: 'JLPT' }, { value: 'shadowing_practice', label: 'Shadowing' },
  { value: 'mixed_review', label: 'Mixed review' },
];

interface LibraryState {
  lessons: AudioLessonVersion[];
  playlists: AudioPlaylist[];
  favorites: Set<string>;
  downloaded: Set<string>;
  progress: Map<string, Awaited<ReturnType<typeof getAudioLessonProgress>>>;
}

function openLesson(lesson: AudioLessonVersion, playlistId?: string): void {
  router.push({ pathname: '/audio-lessons/[lessonId]', params: { lessonId: lesson.lessonId, ...(playlistId ? { playlistId } : {}) } } as Href);
}

export default function AudioLessonsLibraryScreen() {
  const theme = useTheme();
  const [data, setData] = useState<LibraryState>();
  const [offline, setOffline] = useState(false);
  const [level, setLevel] = useState<'all' | 'N5' | 'N4'>('all');
  const [type, setType] = useState<AudioLessonType>();
  const [scope, setScope] = useState<LibraryScope>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    let lessons: AudioLessonVersion[];
    let playlists: AudioPlaylist[];
    let isOffline = false;
    try {
      [lessons, playlists] = await Promise.all([listPublishedAudioLessons(), listPublishedAudioPlaylists()]);
      await Promise.all([cacheAudioLessons(lessons), cacheAudioPlaylists(playlists)]);
    } catch {
      [lessons, playlists] = await Promise.all([getCachedAudioLessons(), getCachedAudioPlaylists()]);
      isOffline = true;
    }
    const [favorites, downloadedRows, progressRows] = await Promise.all([
      getAudioLessonFavoriteIds(),
      Promise.all(lessons.map((lesson) => isAudioLessonDownloaded(lesson.id))),
      Promise.all(lessons.map((lesson) => getAudioLessonProgress(lesson.id))),
    ]);
    setData({ lessons, playlists, favorites, downloaded: new Set(lessons.filter((_, index) => downloadedRows[index]).map((lesson) => lesson.id)), progress: new Map(progressRows.map((progress) => [progress.lessonVersionId, progress])) });
    setOffline(isOffline);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const visibleLessons = useMemo(() => {
    if (!data) return [];
    const normalized = query.trim().toLocaleLowerCase();
    return data.lessons.filter((lesson) => {
      const progress = data.progress.get(lesson.id);
      if (level !== 'all' && lesson.jlptLevel !== level) return false;
      if (type && lesson.lessonType !== type) return false;
      if (scope === 'completed' && progress?.status !== 'completed') return false;
      if (scope === 'incomplete' && (!progress || progress.status === 'completed')) return false;
      if (scope === 'downloaded' && !data.downloaded.has(lesson.id)) return false;
      if (scope === 'favorites' && !data.favorites.has(lesson.id)) return false;
      if (scope === 'recent' && !progress?.lastPlayedAt) return false;
      return !normalized || [lesson.title, lesson.subtitle, lesson.lessonType, ...lesson.objectives].join(' ').toLocaleLowerCase().includes(normalized);
    }).sort((left, right) => {
      if (scope !== 'recent') return 0;
      return (data.progress.get(right.id)?.lastPlayedAt ?? '').localeCompare(data.progress.get(left.id)?.lastPlayedAt ?? '');
    });
  }, [data, level, query, scope, type]);

  if (!data) return <ScreenContainer scroll={false}><LoadingState label="Opening Audio Lessons…" /></ScreenContainer>;
  const filtersActive = level !== 'all' || Boolean(type) || scope !== 'all' || Boolean(query.trim());
  const continueLesson = [...data.progress.values()].filter((progress) => progress.status === 'in_progress').sort((left, right) => (right.lastPlayedAt ?? '').localeCompare(left.lastPlayedAt ?? ''))[0];
  const continueItem = continueLesson ? data.lessons.find((lesson) => lesson.id === continueLesson.lessonVersionId) : undefined;
  return <ScreenContainer keyboardAware>
    <PageHeader eyebrow="Audio Lessons" title="Listen anywhere" subtitle={offline ? 'Showing downloaded lesson information. Connect once to refresh the library.' : 'Short N5 and N4 lessons for work, walks, and commutes.'} />
    {continueItem ? <Card style={{ backgroundColor: theme.primarySoft }}><ThemedText type="smallBold" themeColor="primary">CONTINUE LISTENING</ThemedText><ThemedText type="heading">{continueItem.title}</ThemedText><ThemedText themeColor="textSecondary">{continueLesson?.completionPercentage ?? 0}% complete · resumes where you paused</ThemedText><AppButton label="Resume" onPress={() => openLesson(continueItem)} /></Card> : null}
    <TextInput accessibilityLabel="Search Audio Lessons" value={query} onChangeText={setQuery} placeholder="Search audio lessons" placeholderTextColor={theme.textSecondary} style={[styles.search, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]} />
    <View style={styles.filters} accessibilityRole="tablist">
      {(['all', 'N5', 'N4'] as const).map((candidate) => <Filter key={candidate} label={candidate === 'all' ? 'All levels' : candidate} selected={level === candidate} onPress={() => setLevel(candidate)} />)}
      {(['all', 'incomplete', 'completed', 'downloaded', 'favorites', 'recent'] as const).map((candidate) => <Filter key={candidate} label={candidate === 'all' ? 'All' : candidate} selected={scope === candidate} onPress={() => setScope(candidate)} />)}
    </View>
    <View style={styles.filters} accessibilityRole="tablist">
      <Filter label="All types" selected={!type} onPress={() => setType(undefined)} />
      {lessonTypes.map((candidate) => <Filter key={candidate.value} label={candidate.label} selected={type === candidate.value} onPress={() => setType(candidate.value)} />)}
    </View>
    {data.playlists.length ? <><SectionHeading title="Playlists" detail={`${data.playlists.length} ready`} />
      {data.playlists.map((playlist) => <Card key={playlist.id}><ThemedText type="heading">{playlist.title}</ThemedText><ThemedText themeColor="textSecondary">{playlist.description}</ThemedText><ThemedText type="small" themeColor="textSecondary">{playlist.lessonIds.length} lessons{playlist.jlptLevel ? ` · ${playlist.jlptLevel}` : ''}</ThemedText><AppButton label="Open playlist" variant="secondary" onPress={() => { const first = data.lessons.find((lesson) => lesson.lessonId === playlist.lessonIds[0]); if (first) openLesson(first, playlist.id); }} /></Card>)}</> : null}
    <SectionHeading title="Audio library" detail={`${visibleLessons.length} lessons`} />
    {!visibleLessons.length ? <>
      <EmptyState
        title={data.lessons.length === 0 ? 'No published Audio Lessons yet' : 'No audio lessons match these filters'}
        message={data.lessons.length === 0
          ? 'Audio drafts stay private until their Japanese links, source references, and hosted audio have been reviewed and published.'
          : 'Clear one or more filters to see other published lessons.'}
      />
      {filtersActive ? <AppButton label="Clear filters" variant="secondary" onPress={() => { setLevel('all'); setType(undefined); setScope('all'); setQuery(''); }} /> : null}
    </> : null}
    {visibleLessons.map((lesson) => {
      const progress = data.progress.get(lesson.id);
      return <Card key={lesson.id}><View style={styles.cardHeader}><ThemedText type="smallBold" themeColor="primary">{lesson.jlptLevel} · {lesson.lessonType.replaceAll('_', ' ')}</ThemedText>{data.favorites.has(lesson.id) ? <ThemedText type="small">Saved</ThemedText> : null}</View><ThemedText type="heading">{lesson.title}</ThemedText><ThemedText themeColor="textSecondary">{lesson.subtitle}</ThemedText><ThemedText type="small" themeColor="textSecondary">{lesson.estimatedMinutes} min · {progress?.status === 'in_progress' ? `${progress.completionPercentage}% complete` : progress?.status === 'completed' ? 'completed' : 'not started'}{data.downloaded.has(lesson.id) ? ' · downloaded' : ''}</ThemedText><AppButton label={progress?.status === 'in_progress' ? 'Continue' : 'Listen'} onPress={() => openLesson(lesson)} /></Card>;
    })}
  </ScreenContainer>;
}

function Filter({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={[styles.filter, { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primarySoft : theme.surface }]}><ThemedText type="smallBold">{label}</ThemedText></Pressable>;
}

const styles = StyleSheet.create({
  search: { borderRadius: 16, borderWidth: 1, minHeight: 50, paddingHorizontal: Spacing.two },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  filter: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});
