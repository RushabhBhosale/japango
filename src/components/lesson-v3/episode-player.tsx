import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { LoadingState } from '@/components/common/loading-state';
import { ProgressBar } from '@/components/common/progress-bar';
import { ScreenContainer } from '@/components/common/screen-container';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { v3FreeResponseEvaluator } from '@/features/lesson-v3/free-response-evaluator';
import { useTheme } from '@/hooks/use-theme';
import { getV3EpisodeProgress, saveV3EpisodeProgress } from '@/services/database/lesson-v3-repository';
import { stopJapaneseSpeech } from '@/services/speech/japanese-speech';
import { useAppStore } from '@/store/app-store';
import type { V3Episode, V3EpisodeProgress, V3EpisodeResponse, V3Scene } from '@/types/lesson-v3';

import { V3Chat } from './v3-chat';
import { V3ChoiceInteraction, V3FreeResponseInteraction, V3SentenceBuildInteraction } from './v3-interactions';
import { V3JapaneseLineView } from './v3-japanese-line';

export function EpisodePlayer({ episode }: { episode: V3Episode }) {
  const theme = useTheme();
  const assistanceMode = useAppStore((state) => state.v3Learner?.assistanceMode ?? 'guided');
  const [progress, setProgress] = useState<V3EpisodeProgress>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [sceneAnimation] = useState(() => new Animated.Value(1));
  const scrollRef = useRef<ScrollView>(null);
  const glossary = useMemo(() => Object.fromEntries(episode.learningObjectives.map((item) => [item.id, { reading: item.reading, meaning: item.meaning }])), [episode.learningObjectives]);

  useEffect(() => {
    void getV3EpisodeProgress(episode.id).then(setProgress).catch(() => setError('Your saved episode could not be opened.'));
    return () => { void stopJapaneseSpeech(); };
  }, [episode.id]);

  const currentIndex = Math.min(progress?.currentSceneIndex ?? 0, episode.scenes.length - 1);
  const scene = episode.scenes[currentIndex];
  const response = progress?.responses.find((candidate) => candidate.sceneId === scene.id);

  useEffect(() => {
    sceneAnimation.setValue(0);
    Animated.timing(sceneAnimation, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 0);
  }, [currentIndex, sceneAnimation]);

  const persist = useCallback(async (next: V3EpisodeProgress) => {
    setSaving(true);
    setError(undefined);
    try {
      const saved = await saveV3EpisodeProgress(next);
      setProgress(saved);
    } catch {
      setError('Your progress is still on this screen, but it could not be saved yet.');
    } finally {
      setSaving(false);
    }
  }, []);

  const submitResponse = async (candidate: V3EpisodeResponse) => {
    if (!progress) return;
    let evaluated = candidate;
    if (scene.type === 'freeResponse') {
      const result = await v3FreeResponseEvaluator.evaluate(candidate.answer, scene.intent);
      evaluated = {
        ...candidate,
        correct: result.accepted,
        feedbackTitle: result.title,
        feedback: result.feedback,
        suggestedResponse: result.suggestedResponse,
      };
    }
    await persist({
      ...progress,
      responses: [...progress.responses.filter((item) => item.sceneId !== scene.id), evaluated],
      updatedAt: new Date().toISOString(),
    });
  };

  const advance = async () => {
    if (!progress || scene.type === 'completion') return;
    const nextIndex = Math.min(currentIndex + 1, episode.scenes.length - 1);
    const enteringCompletion = episode.scenes[nextIndex]?.type === 'completion';
    await persist({
      ...progress,
      currentSceneIndex: nextIndex,
      learnedItemIds: [...new Set([...progress.learnedItemIds, ...(scene.learnedItemIds ?? [])])],
      completedAt: enteringCompletion ? new Date().toISOString() : progress.completedAt,
      updatedAt: new Date().toISOString(),
    });
  };

  if (!progress && !error) return <ScreenContainer scroll={false}><LoadingState label="Opening Episode 1…" /></ScreenContainer>;
  if (!progress) return <ScreenContainer><ThemedText>{error}</ThemedText><AppButton label="Back home" onPress={() => router.replace('/(tabs)')} /></ScreenContainer>;

  const interactionNeedsResponse = ['interaction', 'sentenceBuild', 'freeResponse'].includes(scene.type);
  const canContinue = !interactionNeedsResponse || Boolean(response && (scene.type !== 'freeResponse' || response.correct));

  return (
    <ScreenContainer scroll={false} keyboardAware contentStyle={styles.screen}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Leave episode" hitSlop={8} onPress={() => router.replace('/(tabs)')} style={styles.iconButton}>
          <Ionicons name="close" size={25} color={theme.text} />
        </Pressable>
        <View style={styles.progressArea}>
          <ThemedText type="smallBold" numberOfLines={1}>{episode.titleJapanese}</ThemedText>
          <ProgressBar value={((currentIndex + 1) / episode.scenes.length) * 100} accessibilityLabel="Episode progress" />
        </View>
        <View style={[styles.helpBadge, { backgroundColor: theme.primarySoft }]}>
          <ThemedText type="smallBold" style={{ color: theme.primary }}>{assistanceMode === 'guided' ? 'HELP+' : assistanceMode === 'supported' ? 'HELP' : 'JP'}</ThemedText>
        </View>
      </View>

      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.sceneContent} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: sceneAnimation, transform: [{ translateY: sceneAnimation.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
          <SceneContent scene={scene} episode={episode} assistanceMode={assistanceMode} glossary={glossary} progress={progress} response={response} onSubmit={submitResponse} />
        </Animated.View>
      </ScrollView>

      {scene.type !== 'completion' ? (
        <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          {error ? <ThemedText type="small" style={{ color: theme.error }} accessibilityLiveRegion="polite">{error}</ThemedText> : null}
          <AppButton label={scene.type === 'story' ? 'Open message' : currentIndex === episode.scenes.length - 2 ? 'Finish episode' : 'Continue'} disabled={!canContinue} loading={saving} onPress={() => void advance()} />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

interface SceneContentProps {
  scene: V3Scene;
  episode: V3Episode;
  assistanceMode: 'guided' | 'supported' | 'independent';
  glossary: Record<string, { reading: string; meaning: string }>;
  progress: V3EpisodeProgress;
  response?: V3EpisodeResponse;
  onSubmit: (response: V3EpisodeResponse) => Promise<void>;
}

function SceneContent({ scene, episode, assistanceMode, glossary, progress, response, onSubmit }: SceneContentProps) {
  const theme = useTheme();
  if (scene.type === 'story') return (
    <View style={styles.story}>
      <ThemedText type="smallBold" style={{ color: theme.primary }}>{scene.eyebrow}</ThemedText>
      <ThemedText type="title">{scene.title}</ThemedText>
      <ThemedText type="heading" themeColor="textSecondary">{scene.body}</ThemedText>
      <View style={[styles.phoneLine, { backgroundColor: theme.primarySoft }]}><Ionicons name="chatbubble-ellipses-outline" size={24} color={theme.primary} /><ThemedText type="smallBold" style={{ color: theme.primary }}>New message · Unknown</ThemedText></View>
    </View>
  );
  if (scene.type === 'chat') return <V3Chat messages={scene.messages} assistanceMode={assistanceMode} glossary={glossary} />;
  if (scene.type === 'interaction') return <V3ChoiceInteraction scene={scene} assistanceMode={assistanceMode} glossary={glossary} response={response} onSubmit={onSubmit} />;
  if (scene.type === 'sentenceBuild') return <V3SentenceBuildInteraction scene={scene} assistanceMode={assistanceMode} glossary={glossary} response={response} onSubmit={onSubmit} />;
  if (scene.type === 'freeResponse') return <V3FreeResponseInteraction scene={scene} assistanceMode={assistanceMode} glossary={glossary} response={response} onSubmit={onSubmit} />;
  if (scene.type === 'teachingMoment') return (
    <Card style={[styles.discovery, { backgroundColor: theme.primarySoft, borderColor: theme.primary }]}>
      <ThemedText type="smallBold" style={{ color: theme.primary }}>DISCOVER</ThemedText>
      <ThemedText type="heading">{scene.title}</ThemedText>
      {scene.contrast.map((contrast) => <V3JapaneseLineView key={contrast.text.raw} line={contrast} assistanceMode={assistanceMode} glossary={glossary} />)}
      <View style={[styles.rule, { backgroundColor: theme.border }]} />
      <ThemedText>{scene.explanation}</ThemedText>
    </Card>
  );
  return <Completion episode={episode} progress={progress} />;
}

function Completion({ episode, progress }: { episode: V3Episode; progress: V3EpisodeProgress }) {
  const theme = useTheme();
  const checked = progress.responses.length;
  const understood = progress.responses.filter((response) => response.correct).length;
  const learned = episode.learningObjectives.filter((item) => progress.learnedItemIds.includes(item.id)).slice(0, 5);
  return (
    <View style={styles.completion}>
      <View style={[styles.completeMark, { backgroundColor: theme.primarySoft }]}><Ionicons name="checkmark" size={32} color={theme.primary} /></View>
      <View style={styles.centerCopy}>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>EPISODE COMPLETE</ThemedText>
        <ThemedText type="title" style={styles.centerText}>{episode.titleJapanese}</ThemedText>
        <ThemedText type="heading" themeColor="textSecondary" style={styles.centerText}>{episode.titleEnglish}</ThemedText>
      </View>
      <Card>
        <ThemedText type="heading">You understood {understood} of {checked} checked moments</ThemedText>
        {learned.length ? <View style={styles.learnedList}>{learned.map((item) => <View key={item.id} style={styles.learnedRow}><ThemedText type="japanese">{item.japanese}</ThemedText><ThemedText type="small" themeColor="textSecondary">{item.meaning}</ThemedText></View>)}</View> : null}
        <ThemedText type="smallBold" style={{ color: theme.success }}>You used Japanese on your own.</ThemedText>
      </Card>
      <Card style={[styles.nextCard, { borderColor: theme.primary }]}>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>NEXT EPISODE</ThemedText>
        <ThemedText type="subtitle">{episode.nextEpisode.titleJapanese}</ThemedText>
        <ThemedText type="heading">{episode.nextEpisode.titleEnglish}</ThemedText>
        <ThemedText themeColor="textSecondary">{episode.nextEpisode.setup}</ThemedText>
        <ThemedText>{episode.nextEpisode.hook}</ThemedText>
        <AppButton label="Episode 2 coming next" disabled onPress={() => undefined} />
      </Card>
      <AppButton label="Back to home" variant="secondary" onPress={() => router.replace('/(tabs)')} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0 },
  topBar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  progressArea: { flex: 1, gap: Spacing.one },
  helpBadge: { minWidth: 44, height: 32, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
  scroll: { flex: 1 },
  sceneContent: { flexGrow: 1, padding: Spacing.three, paddingBottom: Spacing.four },
  footer: { borderTopWidth: 1, padding: Spacing.three, gap: Spacing.two },
  story: { flex: 1, minHeight: 460, justifyContent: 'center', gap: Spacing.three },
  phoneLine: { minHeight: 64, borderRadius: Radius.medium, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, marginTop: Spacing.three },
  discovery: { gap: Spacing.three, padding: Spacing.four },
  rule: { height: 1 },
  completion: { gap: Spacing.four, paddingBottom: Spacing.four },
  completeMark: { width: 64, height: 64, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  centerCopy: { alignItems: 'center', gap: Spacing.one },
  centerText: { textAlign: 'center' },
  learnedList: { gap: Spacing.two },
  learnedRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.three },
  nextCard: { gap: Spacing.two, padding: Spacing.four },
});
