import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { LoadingState } from '@/components/common/loading-state';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { v3EpisodeList } from '@/features/lesson-v3/episodes';
import { useTheme } from '@/hooks/use-theme';
import { getV3EpisodeProgresses } from '@/services/database/lesson-v3-repository';
import { useAppStore } from '@/store/app-store';
import type { V3EpisodeProgress } from '@/types/lesson-v3';

export default function HomeScreen() {
  const theme = useTheme();
  const learner = useAppStore((state) => state.v3Learner);
  const [progresses, setProgresses] = useState<V3EpisodeProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setProgresses(await getV3EpisodeProgresses());
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const progressByEpisode = useMemo(() => new Map(progresses.map((progress) => [progress.episodeId, progress])), [progresses]);
  const currentEpisode = v3EpisodeList.find((episode) => !progressByEpisode.get(episode.id)?.completedAt) ?? v3EpisodeList[v3EpisodeList.length - 1];
  const progress = progressByEpisode.get(currentEpisode.id) ?? {
    episodeId: currentEpisode.id,
    currentSceneIndex: 0,
    responses: [],
    learnedItemIds: [],
    storyChoices: {},
    updatedAt: new Date().toISOString(),
  };

  if (loading) return <ScreenContainer scroll={false}><LoadingState label="Finding your place in the story…" /></ScreenContainer>;

  const started = progress.currentSceneIndex > 0;
  const completed = Boolean(progress.completedAt);
  const learned = currentEpisode.learningObjectives.filter((item) => progress.learnedItemIds.includes(item.id)).slice(0, 4);
  const sceneProgress = Math.round((progress.currentSceneIndex / (currentEpisode.scenes.length - 1)) * 100);
  const assistance = learner?.assistanceMode === 'guided' ? 'Guided support' : learner?.assistanceMode === 'supported' ? 'Help on tap' : 'Japanese first';

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>こんにちは</ThemedText>
          <ThemedText type="title">Your story is ready.</ThemedText>
        </View>
        <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}><ThemedText type="heading" style={{ color: theme.primary }}>ゆ</ThemedText></View>
      </View>

      <View style={styles.sectionHeader}>
        <ThemedText type="smallBold" themeColor="textSecondary">{completed ? 'STORY SO FAR' : 'CONTINUE STORY'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{assistance}</ThemedText>
      </View>

      <Card style={[styles.episodeCard, { borderColor: theme.primary }]}>
        <View style={styles.arcRow}>
          <View style={styles.arcCopy}>
            <ThemedText type="smallBold" style={{ color: theme.primary }}>{currentEpisode.arcTitleJapanese}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{currentEpisode.arcTitleEnglish}</ThemedText>
          </View>
          <View style={[styles.time, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name="time-outline" size={17} color={theme.primary} />
            <ThemedText type="smallBold" style={{ color: theme.primary }}>{currentEpisode.estimatedMinutes} min</ThemedText>
          </View>
        </View>

        <View style={styles.episodeTitle}>
          <ThemedText type="smallBold" themeColor="textSecondary">EPISODE {currentEpisode.episodeNumber} · {currentEpisode.level}</ThemedText>
          <ThemedText type="subtitle">{currentEpisode.titleJapanese}</ThemedText>
          <ThemedText type="heading" themeColor="textSecondary">{currentEpisode.titleEnglish}</ThemedText>
        </View>

        {started && !completed ? (
          <View style={styles.resumeRow}>
            <View style={[styles.resumeTrack, { backgroundColor: theme.border }]}><View style={[styles.resumeFill, { width: `${sceneProgress}%`, backgroundColor: theme.primary }]} /></View>
            <ThemedText type="small" themeColor="textSecondary">Saved</ThemedText>
          </View>
        ) : null}

        <ThemedText themeColor="textSecondary">
          {completed
            ? 'This chapter is complete. You can revisit it or continue from the course map below.'
            : `${currentEpisode.curriculumGrammarIds.length} curriculum targets and ${currentEpisode.examSkills.length} exam skills are woven into this chapter.`}
        </ThemedText>
        <AppButton
          label={completed ? 'Revisit the ending' : started ? `Continue Episode ${currentEpisode.episodeNumber}` : `Start Episode ${currentEpisode.episodeNumber}`}
          onPress={() => router.push(`/episode/${currentEpisode.id}` as Href)}
        />
      </Card>


      {learned.length ? (
        <View style={styles.secondary}>
          <ThemedText type="smallBold" themeColor="textSecondary">RECENTLY MET IN THE STORY</ThemedText>
          <Card style={styles.learnedCard}>
            {learned.map((item, index) => (
              <View key={item.id} style={[styles.learnedRow, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                <View>
                  <ThemedText type="heading">{item.japanese}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{item.reading}</ThemedText>
                </View>
                <ThemedText type="small">{item.meaning}</ThemedText>
              </View>
            ))}
          </Card>
        </View>
      ) : (
        <View style={[styles.newLearnerNote, { borderColor: theme.border }]}>
          <Ionicons name="hand-left-outline" size={22} color={theme.primary} />
          <ThemedText themeColor="textSecondary" style={styles.noteCopy}>Tap unfamiliar Japanese inside the story for its reading and meaning.</ThemedText>
        </View>
      )}

      <View style={styles.secondary}>
        <ThemedText type="smallBold" themeColor="textSecondary">50-EPISODE JLPT COURSE MAP</ThemedText>
        {(['N5', 'N4'] as const).map((level) => (
          <View key={level} style={styles.courseLevel}>
            <ThemedText type="heading">{level} story arc</ThemedText>
            {v3EpisodeList.filter((episode) => episode.level === level).map((episode) => {
              const episodeProgress = progressByEpisode.get(episode.id);
              const isCurrent = episode.id === currentEpisode.id;
              return (
                <Pressable
                  key={episode.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open Episode ${episode.episodeNumber}: ${episode.titleEnglish}`}
                  onPress={() => router.push(`/episode/${episode.id}` as Href)}
                  style={[styles.courseRow, { borderColor: isCurrent ? theme.primary : theme.border, backgroundColor: theme.surface }]}
                >
                  <View style={[styles.episodeNumber, { backgroundColor: isCurrent ? theme.primarySoft : theme.background }]}>
                    <ThemedText type="smallBold" style={{ color: isCurrent ? theme.primary : theme.textSecondary }}>{episode.episodeNumber}</ThemedText>
                  </View>
                  <View style={styles.courseCopy}>
                    <ThemedText type="heading">{episode.titleJapanese}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{episode.titleEnglish} · {episode.estimatedMinutes} min</ThemedText>
                  </View>
                  <Ionicons name={episodeProgress?.completedAt ? 'checkmark-circle' : episodeProgress?.currentSceneIndex ? 'play-circle' : 'chevron-forward'} size={22} color={episodeProgress?.completedAt ? theme.success : theme.primary} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.three },
  avatar: { width: 52, height: 52, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two, marginTop: Spacing.two },
  episodeCard: { gap: Spacing.four, padding: Spacing.four, borderRadius: Radius.large },
  arcRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.three },
  arcCopy: { flex: 1 },
  time: { flexDirection: 'row', gap: Spacing.one, borderRadius: Radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  episodeTitle: { gap: Spacing.one },
  resumeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  resumeTrack: { flex: 1, height: 4, borderRadius: Radius.pill, overflow: 'hidden' },
  resumeFill: { height: '100%', borderRadius: Radius.pill },
  secondary: { gap: Spacing.two },
  learnedCard: { paddingVertical: Spacing.one },
  learnedRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, paddingVertical: Spacing.two },
  newLearnerNote: { borderTopWidth: 1, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  noteCopy: { flex: 1 },
  courseLevel: { gap: Spacing.two },
  courseRow: { minHeight: 70, borderWidth: 1, borderRadius: Radius.medium, padding: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  episodeNumber: { width: 42, height: 42, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  courseCopy: { flex: 1, minWidth: 0 },
});
