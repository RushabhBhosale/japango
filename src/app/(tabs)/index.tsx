import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { LoadingState } from '@/components/common/loading-state';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { episodeOne } from '@/features/lesson-v3/episode-one';
import { useTheme } from '@/hooks/use-theme';
import { getV3EpisodeProgress } from '@/services/database/lesson-v3-repository';
import { useAppStore } from '@/store/app-store';
import type { V3EpisodeProgress } from '@/types/lesson-v3';

export default function HomeScreen() {
  const theme = useTheme();
  const learner = useAppStore((state) => state.v3Learner);
  const [progress, setProgress] = useState<V3EpisodeProgress>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setProgress(await getV3EpisodeProgress(episodeOne.id));
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading || !progress) return <ScreenContainer scroll={false}><LoadingState label="Finding your place in the story…" /></ScreenContainer>;

  const started = progress.currentSceneIndex > 0;
  const completed = Boolean(progress.completedAt);
  const learned = episodeOne.learningObjectives.filter((item) => progress.learnedItemIds.includes(item.id)).slice(0, 4);
  const sceneProgress = Math.round((progress.currentSceneIndex / (episodeOne.scenes.length - 1)) * 100);
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
            <ThemedText type="smallBold" style={{ color: theme.primary }}>{episodeOne.arcTitleJapanese}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{episodeOne.arcTitleEnglish}</ThemedText>
          </View>
          <View style={[styles.time, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name="time-outline" size={17} color={theme.primary} />
            <ThemedText type="smallBold" style={{ color: theme.primary }}>{episodeOne.estimatedMinutes} min</ThemedText>
          </View>
        </View>

        <View style={styles.episodeTitle}>
          <ThemedText type="smallBold" themeColor="textSecondary">EPISODE 1</ThemedText>
          <ThemedText type="subtitle">{episodeOne.titleJapanese}</ThemedText>
          <ThemedText type="heading" themeColor="textSecondary">{episodeOne.titleEnglish}</ThemedText>
        </View>

        {started && !completed ? (
          <View style={styles.resumeRow}>
            <View style={[styles.resumeTrack, { backgroundColor: theme.border }]}><View style={[styles.resumeFill, { width: `${sceneProgress}%`, backgroundColor: theme.primary }]} /></View>
            <ThemedText type="small" themeColor="textSecondary">Saved</ThemedText>
          </View>
        ) : null}

        <ThemedText themeColor="textSecondary">
          {completed
            ? 'You and Yuki agreed to meet tomorrow at Shinjuku Station.'
            : 'A message from an unknown number pulls you into your first conversation in Japan.'}
        </ThemedText>
        <AppButton
          label={completed ? 'Revisit the ending' : started ? 'Continue Episode 1' : 'Start Episode 1'}
          onPress={() => router.push(`/episode/${episodeOne.id}` as Href)}
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
});
