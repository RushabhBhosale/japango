import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { LoadingState } from '@/components/common/loading-state';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { SectionHeading } from '@/components/common/section-heading';
import { DailyReadingCard } from '@/components/daily-reading/daily-reading-card';
import { InteractiveJapaneseText } from '@/components/lesson/japanese-text';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { loadTodayDailyReading, resolveDailyReadingLevel } from '@/features/daily-reading/daily-reading-service';
import { localDateKey } from '@/features/daily-reading/streak';
import { v3EpisodeList } from '@/features/lesson-v3/episodes';
import { useTheme } from '@/hooks/use-theme';
import { getDailyReadingHomeState } from '@/services/database/daily-reading-repository';
import { getV3EpisodeProgresses } from '@/services/database/lesson-v3-repository';
import { useAppStore } from '@/store/app-store';
import type { DailyReadingHomeState } from '@/types/daily-reading';
import type { V3EpisodeProgress } from '@/types/lesson-v3';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface ActivityRowProps {
  icon: IconName;
  label: string;
  detail: string;
  onPress: () => void;
}

function ActivityRow({ icon, label, detail, onPress }: ActivityRowProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.activityRow, { borderColor: theme.border, backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}
    >
      <View style={[styles.activityIcon, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name={icon} size={22} color={theme.primary} />
      </View>
      <View style={styles.activityCopy}>
        <ThemedText type="cardTitle">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{detail}</ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={22} color={theme.primary} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const learner = useAppStore((state) => state.v3Learner);
  const profile = useAppStore((state) => state.profile);
  const [progresses, setProgresses] = useState<V3EpisodeProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [dailyReading, setDailyReading] = useState<DailyReadingHomeState>();
  const [dailyReadingLoading, setDailyReadingLoading] = useState(true);
  const [dailyReadingError, setDailyReadingError] = useState<string>();
  const [expandedLevel, setExpandedLevel] = useState<'N5' | 'N4'>();

  const load = useCallback(async () => {
    try {
      setProgresses(await getV3EpisodeProgresses());
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const loadDailyReading = useCallback(async () => {
    const date = localDateKey();
    const level = resolveDailyReadingLevel(profile, learner);
    setDailyReadingLoading(true);
    setDailyReadingError(undefined);
    try {
      setDailyReading(await getDailyReadingHomeState(date, level));
      await loadTodayDailyReading(date, level);
      setDailyReading(await getDailyReadingHomeState(date, level));
    } catch (error) {
      setDailyReading(await getDailyReadingHomeState(date, level));
      setDailyReadingError(error instanceof Error ? error.message : 'Today’s reading could not be loaded.');
    } finally {
      setDailyReadingLoading(false);
    }
  }, [learner, profile]);
  useFocusEffect(useCallback(() => { void loadDailyReading(); }, [loadDailyReading]));

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
  const sceneProgress = Math.round((progress.currentSceneIndex / Math.max(1, currentEpisode.scenes.length - 1)) * 100);
  const readingQuestions = dailyReading?.reading?.questions.length ?? 0;
  const readingAnswered = dailyReading?.progress?.answers.length ?? 0;
  const readingProgress = readingQuestions ? readingAnswered / readingQuestions : 0;
  const todayProgress = Math.round((Math.min(sceneProgress, 100) / 2) + (readingProgress * 50));
  const levelLabel = learner?.assessmentResult?.startingLevel ?? profile?.learnerLevel ?? currentEpisode.level;
  const firstName = profile?.displayName?.trim().split(/\s+/u)[0];
  const assistance = learner?.assistanceMode === 'guided' ? 'Guided support' : learner?.assistanceMode === 'supported' ? 'Help on tap' : 'Japanese first';

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <InteractiveJapaneseText type="smallBold" style={{ color: theme.primary }}>おかえりなさい</InteractiveJapaneseText>
          <ThemedText type="display">{firstName ? `Welcome back, ${firstName}.` : 'Welcome back.'}</ThemedText>
        </View>
        <View style={[styles.levelBadge, { backgroundColor: theme.primarySoft }]}>
          <ThemedText type="metadata" style={{ color: theme.primary }}>{levelLabel}</ThemedText>
        </View>
      </View>

      <View style={styles.todayProgress}>
        <View style={styles.todayHeading}>
          <View style={styles.todayCopy}>
            <ThemedText type="metadata" themeColor="textSecondary">Today’s progress</ThemedText>
            <ThemedText type="heading">A little Japanese, every day.</ThemedText>
          </View>
          <ThemedText type="heading" style={{ color: theme.primary }}>{todayProgress}%</ThemedText>
        </View>
        <ProgressBar value={todayProgress} accessibilityLabel={`${todayProgress} percent of today’s learning complete`} />
        <View style={styles.todayStats}>
          <ThemedText type="small" themeColor="textSecondary">Goal · {profile?.dailyGoalMinutes ?? 15} min</ThemedText>
          <View style={styles.streakStat}>
            <Ionicons name="flame-outline" size={16} color={theme.warning} />
            <ThemedText type="small" themeColor="textSecondary">{dailyReading?.streak ?? 0} day reading streak</ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeading title="Continue learning" detail={assistance} />
        <Card variant="accent" style={styles.episodeCard}>
          <View style={styles.episodeMeta}>
            <ThemedText type="metadata" style={{ color: theme.primary }}>Episode {currentEpisode.episodeNumber} · {currentEpisode.level}</ThemedText>
            <View style={[styles.time, { backgroundColor: theme.primarySoft }]}>
              <Ionicons name="time-outline" size={16} color={theme.primary} />
              <ThemedText type="smallBold" style={{ color: theme.primary }}>{currentEpisode.estimatedMinutes} min</ThemedText>
            </View>
          </View>
          <View style={styles.episodeTitle}>
            <InteractiveJapaneseText type="title" contextualReading={currentEpisode.titleReading}>{currentEpisode.titleJapanese}</InteractiveJapaneseText>
            <ThemedText type="heading" themeColor="textSecondary">{currentEpisode.titleEnglish}</ThemedText>
          </View>
          <View style={styles.arcCopy}>
            <InteractiveJapaneseText type="smallBold" contextualReading={currentEpisode.arcTitleReading} style={{ color: theme.primary }}>{currentEpisode.arcTitleJapanese}</InteractiveJapaneseText>
            <ThemedText type="small" themeColor="textSecondary">{currentEpisode.arcTitleEnglish}</ThemedText>
          </View>
          {started && !completed ? (
            <View style={styles.resumeBlock}>
              <View style={styles.resumeLabels}>
                <ThemedText type="small" themeColor="textSecondary">Your place is saved</ThemedText>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>{sceneProgress}%</ThemedText>
              </View>
              <ProgressBar value={sceneProgress} accessibilityLabel={`${sceneProgress} percent of this episode complete`} />
            </View>
          ) : null}
          <ThemedText themeColor="textSecondary">
            {completed
              ? 'This chapter is complete. Revisit the ending or open another episode below.'
              : `${currentEpisode.curriculumGrammarIds.length} learning targets and ${currentEpisode.examSkills.length} exam skills unfold inside the story.`}
          </ThemedText>
          <AppButton
            label={completed ? 'Revisit the ending' : started ? `Continue Episode ${currentEpisode.episodeNumber}` : `Start Episode ${currentEpisode.episodeNumber}`}
            onPress={() => router.push(`/episode/${currentEpisode.id}` as Href)}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeading title="Today’s activities" detail="Short, focused practice" />
        <DailyReadingCard
          state={dailyReading}
          loading={dailyReadingLoading}
          errorMessage={dailyReadingError}
          onRetry={() => { void loadDailyReading(); }}
          onOpen={() => {
            if (dailyReading?.reading) router.push(`/daily-reading/${dailyReading.reading.id}` as Href);
          }}
        />
        <ActivityRow icon="checkmark-done-outline" label="Daily homework" detail="A 5–10 minute plan shaped by your progress and chat" onPress={() => router.push('/homework' as Href)} />
        <ActivityRow icon="layers-outline" label="Vocabulary review" detail="Revisit words at the right moment" onPress={() => router.push('/(tabs)/flashcards')} />
        <ActivityRow icon="document-text-outline" label="Exam practice" detail="JLPT-style unit tests and mock exams" onPress={() => router.push('/(tabs)/exams')} />
      </View>

      {learned.length ? (
        <View style={styles.section}>
          <SectionHeading title="Recently learned" detail="From your current story" />
          <View style={[styles.learnedList, { borderColor: theme.border }]}>
            {learned.map((item, index) => (
              <View key={item.id} style={[styles.learnedRow, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                <View style={styles.learnedJapanese}>
                  <InteractiveJapaneseText type="cardTitle" contextualReading={item.reading}>{item.japanese}</InteractiveJapaneseText>
                  <InteractiveJapaneseText type="small" themeColor="textSecondary">{item.reading}</InteractiveJapaneseText>
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.learnedMeaning}>{item.meaning}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View style={[styles.newLearnerNote, { borderColor: theme.border }]}>
          <Ionicons name="hand-left-outline" size={22} color={theme.primary} />
          <ThemedText themeColor="textSecondary" style={styles.noteCopy}>Tap unfamiliar Japanese inside a story to see its reading and meaning.</ThemedText>
        </View>
      )}

      <View style={styles.section}>
        <SectionHeading title="Learning progress" detail="N5 → N4 story course" />
        <View style={[styles.progressList, { borderColor: theme.border }]}>
          {(['N5', 'N4'] as const).map((level, levelIndex) => {
            const episodes = v3EpisodeList.filter((episode) => episode.level === level);
            const completeCount = episodes.filter((episode) => progressByEpisode.get(episode.id)?.completedAt).length;
            const percentage = Math.round((completeCount / Math.max(1, episodes.length)) * 100);
            const expanded = expandedLevel === level;
            return (
              <View key={level} style={levelIndex > 0 ? { borderTopColor: theme.border, borderTopWidth: 1 } : undefined}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  accessibilityLabel={`${level} progress, ${percentage} percent. ${expanded ? 'Collapse' : 'Show episodes'}`}
                  onPress={() => setExpandedLevel(expanded ? undefined : level)}
                  style={({ pressed }) => [styles.levelRow, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}
                >
                  <View style={[styles.levelMark, { borderColor: theme.primary }]}>
                    <ThemedText type="smallBold" style={{ color: theme.primary }}>{level}</ThemedText>
                  </View>
                  <View style={styles.levelCopy}>
                    <View style={styles.levelLabels}>
                      <ThemedText type="cardTitle">{level} story arc</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">{completeCount}/{episodes.length} complete</ThemedText>
                    </View>
                    <ProgressBar value={percentage} accessibilityLabel={`${level} course progress`} />
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={21} color={theme.primary} />
                </Pressable>
                {expanded ? (
                  <View style={[styles.episodeList, { borderTopColor: theme.border }]}>
                    {episodes.map((episode) => {
                      const episodeProgress = progressByEpisode.get(episode.id);
                      const isCurrent = episode.id === currentEpisode.id;
                      return (
                        <Pressable
                          key={episode.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Open Episode ${episode.episodeNumber}: ${episode.titleEnglish}`}
                          onPress={() => router.push(`/episode/${episode.id}` as Href)}
                          style={({ pressed }) => [styles.courseRow, { backgroundColor: pressed || isCurrent ? theme.primarySoft : 'transparent' }]}
                        >
                          <ThemedText type="metadata" style={{ color: isCurrent ? theme.primary : theme.textSecondary }}>{String(episode.episodeNumber).padStart(2, '0')}</ThemedText>
                          <View style={styles.courseCopy}>
                            <InteractiveJapaneseText type="cardTitle" contextualReading={episode.titleReading}>{episode.titleJapanese}</InteractiveJapaneseText>
                            <ThemedText type="small" themeColor="textSecondary">{episode.titleEnglish} · {episode.estimatedMinutes} min</ThemedText>
                          </View>
                          <Ionicons name={episodeProgress?.completedAt ? 'checkmark-circle' : episodeProgress?.currentSceneIndex ? 'play-circle' : 'chevron-forward'} size={22} color={episodeProgress?.completedAt ? theme.success : theme.primary} />
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, justifyContent: 'space-between', minWidth: 0 },
  headerCopy: { flex: 1, gap: Spacing.one, minWidth: 220 },
  levelBadge: { borderRadius: Radius.pill, maxWidth: '100%', paddingHorizontal: Spacing.twoHalf, paddingVertical: Spacing.two },
  todayProgress: { gap: Spacing.twoHalf },
  todayHeading: { alignItems: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, justifyContent: 'space-between' },
  todayCopy: { flex: 1, gap: Spacing.half, minWidth: 210 },
  todayStats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'space-between' },
  streakStat: { alignItems: 'center', flexDirection: 'row', gap: Spacing.one },
  section: { gap: Spacing.three },
  episodeCard: { gap: Spacing.threeHalf },
  episodeMeta: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'space-between' },
  time: { alignItems: 'center', borderRadius: Radius.pill, flexDirection: 'row', gap: Spacing.one, paddingHorizontal: Spacing.twoHalf, paddingVertical: Spacing.two },
  episodeTitle: { gap: Spacing.half, minWidth: 0 },
  arcCopy: { gap: Spacing.half, minWidth: 0 },
  resumeBlock: { gap: Spacing.two },
  resumeLabels: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'space-between' },
  activityRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: Spacing.twoHalf, minHeight: 80, minWidth: 0, paddingHorizontal: Spacing.two, paddingVertical: Spacing.three },
  activityIcon: { alignItems: 'center', borderRadius: Radius.medium, height: 48, justifyContent: 'center', width: 48 },
  activityCopy: { flex: 1, gap: Spacing.half, minWidth: 0 },
  learnedList: { borderBottomWidth: 1, borderTopWidth: 1 },
  learnedRow: { alignItems: 'baseline', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three, justifyContent: 'space-between', minHeight: 68, paddingHorizontal: Spacing.two, paddingVertical: Spacing.twoHalf },
  learnedJapanese: { flexGrow: 1, gap: Spacing.half, minWidth: 130 },
  learnedMeaning: { flexGrow: 1, minWidth: 120, textAlign: 'right' },
  newLearnerNote: { alignItems: 'center', borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.three },
  noteCopy: { flex: 1, minWidth: 0 },
  progressList: { borderBottomWidth: 1, borderTopWidth: 1 },
  levelRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.twoHalf, minHeight: 88, paddingHorizontal: Spacing.two, paddingVertical: Spacing.three },
  levelMark: { alignItems: 'center', borderRadius: Radius.pill, borderWidth: 1, height: 46, justifyContent: 'center', width: 46 },
  levelCopy: { flex: 1, gap: Spacing.two, minWidth: 0 },
  levelLabels: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, justifyContent: 'space-between' },
  episodeList: { borderTopWidth: 1 },
  courseRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.twoHalf, minHeight: 68, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  courseCopy: { flex: 1, minWidth: 0 },
});
