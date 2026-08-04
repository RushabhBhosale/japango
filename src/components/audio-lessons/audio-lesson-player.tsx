import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Speech from 'expo-speech';

import { AppButton } from '@/components/common/app-button';
import { Card } from '@/components/common/card';
import { ProgressBar } from '@/components/common/progress-bar';
import { InteractiveJapaneseText } from '@/components/lessons-v2/interactive-japanese-text';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { nextAudioSectionIndex, updateAudioLessonPlaybackProgress } from '@/features/audio-lessons/audio-lesson-progress';
import { useTheme } from '@/hooks/use-theme';
import { JapaneseVoiceUnavailableError, speakJapanese, stopJapaneseSpeech } from '@/services/speech/japanese-speech';
import type { AudioLessonMode, AudioLessonProgress, AudioLessonVersion, AudioScriptSection } from '@/types/audio-lessons';

interface AudioLessonPlayerProps {
  lesson: AudioLessonVersion;
  initialProgress: AudioLessonProgress;
  downloadUris: Readonly<Record<string, string>>;
  onProgress: (progress: AudioLessonProgress) => void;
  onPreviousLesson?: () => void;
  onNextLesson?: () => void;
}

function sectionsForMode(lesson: AudioLessonVersion, mode: AudioLessonMode): AudioScriptSection[] {
  if (mode === 'japanese_english') return lesson.scriptSections;
  if (mode === 'review') return lesson.scriptSections.filter((section) => ['vocabulary', 'grammar_focus', 'example', 'drill', 'review', 'answer'].includes(section.sectionType));
  return lesson.scriptSections.filter((section) => section.language === 'japanese');
}

function durationMs(sections: readonly AudioScriptSection[]): number {
  return sections.reduce((total, section) => total + section.estimatedDurationMs + section.pauseAfterMs, 0);
}

function positionBeforeSection(sections: readonly AudioScriptSection[], sectionIndex: number): number {
  return sections.slice(0, sectionIndex).reduce((total, section) => total + section.estimatedDurationMs + section.pauseAfterMs, 0);
}

function timeLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function multiplierForMode(mode: AudioLessonMode): number {
  return mode === 'slow_japanese' || mode === 'shadowing' ? 0.75 : 1;
}

export function AudioLessonPlayer({ lesson, initialProgress, downloadUris, onProgress, onPreviousLesson, onNextLesson }: AudioLessonPlayerProps) {
  const theme = useTheme();
  const player = useAudioPlayer(null, { updateInterval: 500, downloadFirst: false });
  const status = useAudioPlayerStatus(player);
  const [mode, setMode] = useState<AudioLessonMode>(initialProgress.selectedMode);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [repeatSection, setRepeatSection] = useState(false);
  const [repeatLesson, setRepeatLesson] = useState(false);
  const [autoplayNext, setAutoplayNext] = useState(true);
  const [furiganaVisible, setFuriganaVisible] = useState(false);
  const [systemSpeaking, setSystemSpeaking] = useState(false);
  const [systemSpeechError, setSystemSpeechError] = useState<string>();
  const [seekWidth, setSeekWidth] = useState(1);
  const playableSections = useMemo(() => sectionsForMode(lesson, mode), [lesson, mode]);
  const currentSection = playableSections[sectionIndex];
  const totalDurationMs = useMemo(() => durationMs(playableSections), [playableSections]);
  const pendingSeekSeconds = useRef<number | undefined>(undefined);
  const playWhenReplaced = useRef(false);
  const lastSavedAt = useRef(0);
  const finishedKey = useRef<string | undefined>(undefined);
  const restoredKey = useRef<string | undefined>(undefined);
  const systemSpeechRun = useRef(0);
  const systemAutoplay = useRef(false);
  const systemAdvanceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [systemReplayNonce, setSystemReplayNonce] = useState(0);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
    return () => {
      systemSpeechRun.current += 1;
      if (systemAdvanceTimer.current) clearTimeout(systemAdvanceTimer.current);
      player.setActiveForLockScreen(false);
      void stopJapaneseSpeech();
    };
  }, [player]);

  useEffect(() => {
    const key = `${lesson.id}:${mode}`;
    if (restoredKey.current === key) return;
    restoredKey.current = key;
    const savedPosition = initialProgress.playbackPositionMs;
    let running = 0;
    const nextIndex = playableSections.findIndex((section) => {
      const end = running + section.estimatedDurationMs + section.pauseAfterMs;
      if (savedPosition < end) return true;
      running = end;
      return false;
    });
    if (nextIndex >= 0) {
      pendingSeekSeconds.current = Math.max(0, (savedPosition - positionBeforeSection(playableSections, nextIndex)) / 1_000);
      queueMicrotask(() => setSectionIndex(nextIndex));
    } else queueMicrotask(() => setSectionIndex(0));
  }, [initialProgress.playbackPositionMs, lesson.id, mode, playableSections]);

  useEffect(() => {
    if (!currentSection) return;
    const source = downloadUris[currentSection.id] ?? currentSection.audioUrl;
    if (!source || currentSection.audioStatus !== 'ready') return;
    player.replace(source);
    player.setPlaybackRate(multiplierForMode(mode));
    const pending = pendingSeekSeconds.current;
    pendingSeekSeconds.current = undefined;
    const begin = async () => {
      if (pending && pending > 0) await player.seekTo(pending);
      if (playWhenReplaced.current) player.play();
      playWhenReplaced.current = false;
    };
    void begin();
  }, [currentSection, downloadUris, mode, player]);

  const saveCurrentProgress = useCallback((positionMs: number, listenedDeltaMs: number) => {
    onProgress(updateAudioLessonPlaybackProgress(initialProgress, {
      playbackPositionMs: positionMs,
      totalDurationMs,
      listenedDeltaMs,
      playbackSpeed: player.playbackRate,
      selectedMode: mode,
    }));
  }, [initialProgress, mode, onProgress, player.playbackRate, totalDurationMs]);

  const stopSystemSpeech = useCallback(() => {
    systemSpeechRun.current += 1;
    systemAutoplay.current = false;
    if (systemAdvanceTimer.current) clearTimeout(systemAdvanceTimer.current);
    setSystemSpeaking(false);
    void stopJapaneseSpeech();
  }, []);

  const scheduleSystemAdvance = useCallback((run: number, section: AudioScriptSection) => {
    if (systemSpeechRun.current !== run) return;
    const advance = () => {
      if (systemSpeechRun.current !== run) return;
      systemAdvanceTimer.current = undefined;
      if (repeatSection) {
        systemAutoplay.current = true;
        setSystemReplayNonce((value) => value + 1);
        return;
      }
      const nextIndex = nextAudioSectionIndex(playableSections, section.id);
      if (nextIndex !== undefined) {
        systemAutoplay.current = true;
        setSectionIndex(nextIndex);
        return;
      }
      saveCurrentProgress(totalDurationMs, 0);
      if (repeatLesson) {
        systemAutoplay.current = true;
        setSectionIndex(0);
        return;
      }
      systemAutoplay.current = false;
      if (autoplayNext) onNextLesson?.();
    };
    systemAdvanceTimer.current = setTimeout(advance, Math.max(0, section.pauseAfterMs));
  }, [autoplayNext, onNextLesson, playableSections, repeatLesson, repeatSection, saveCurrentProgress, totalDurationMs]);

  const startSystemSpeech = useCallback(async () => {
    if (!currentSection || currentSection.audioStatus !== 'system_speech') return;
    const run = systemSpeechRun.current + 1;
    systemSpeechRun.current = run;
    if (systemAdvanceTimer.current) clearTimeout(systemAdvanceTimer.current);
    setSystemSpeechError(undefined);
    setSystemSpeaking(true);
    const finished = () => {
      if (systemSpeechRun.current !== run) return;
      setSystemSpeaking(false);
      const completedIndex = playableSections.findIndex((section) => section.id === currentSection.id);
      if (completedIndex < 0) return;
      const start = positionBeforeSection(playableSections, completedIndex);
      saveCurrentProgress(start + currentSection.estimatedDurationMs, currentSection.estimatedDurationMs);
      scheduleSystemAdvance(run, currentSection);
    };
    const failed = () => {
      if (systemSpeechRun.current !== run) return;
      setSystemSpeaking(false);
      setSystemSpeechError('The preview voice could not play this section. Check media volume, then try again.');
    };
    try {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
      if (systemSpeechRun.current !== run) return;
      if (currentSection.language === 'japanese') {
        await speakJapanese(currentSection.text, {
          rate: Math.max(0.5, currentSection.speakingRate * multiplierForMode(mode)),
          onDone: finished,
          onError: failed,
        });
        return;
      }
      await Speech.stop();
      if (systemSpeechRun.current !== run) return;
      Speech.speak(currentSection.text, {
        language: currentSection.speaker.language,
        rate: Math.max(0.5, currentSection.speakingRate * multiplierForMode(mode)),
        useApplicationAudioSession: true,
        onDone: finished,
        onStopped: () => { if (systemSpeechRun.current === run) setSystemSpeaking(false); },
        onError: failed,
      });
    } catch (error) {
      if (systemSpeechRun.current !== run) return;
      setSystemSpeaking(false);
      setSystemSpeechError(
        error instanceof JapaneseVoiceUnavailableError
          ? 'Japanese voice is not installed on this device. Install a Japanese text-to-speech voice in Android language settings, then try again.'
          : 'The preview voice could not start. Check media volume and try again.',
      );
    }
  }, [currentSection, mode, playableSections, saveCurrentProgress, scheduleSystemAdvance]);

  useEffect(() => {
    if (!systemAutoplay.current || currentSection?.audioStatus !== 'system_speech') return;
    systemAutoplay.current = false;
    void startSystemSpeech();
  }, [currentSection?.audioStatus, currentSection?.id, startSystemSpeech, systemReplayNonce]);

  useEffect(() => {
    if (!currentSection || !totalDurationMs) return;
    const globalPosition = positionBeforeSection(playableSections, sectionIndex) + Math.round(status.currentTime * 1_000);
    const now = Date.now();
    if (now - lastSavedAt.current >= 1_000 || !status.playing) {
      const previousPosition = initialProgress.playbackPositionMs;
      saveCurrentProgress(globalPosition, status.playing ? Math.max(0, globalPosition - previousPosition) : 0);
      lastSavedAt.current = now;
    }
  }, [currentSection, initialProgress.playbackPositionMs, playableSections, saveCurrentProgress, sectionIndex, status.currentTime, status.playing, totalDurationMs]);

  useEffect(() => {
    if (!status.didJustFinish || !currentSection) return;
    const key = `${currentSection.id}:${Math.round(status.currentTime)}`;
    if (finishedKey.current === key) return;
    finishedKey.current = key;
    if (repeatSection) {
      void player.seekTo(0).then(() => player.play());
      return;
    }
    if (sectionIndex + 1 < playableSections.length) {
      playWhenReplaced.current = true;
      queueMicrotask(() => setSectionIndex(sectionIndex + 1));
      return;
    }
    saveCurrentProgress(totalDurationMs, 0);
    if (repeatLesson) {
      playWhenReplaced.current = true;
      pendingSeekSeconds.current = 0;
      queueMicrotask(() => setSectionIndex(0));
    } else if (autoplayNext) onNextLesson?.();
  }, [autoplayNext, currentSection, onNextLesson, playableSections.length, player, repeatLesson, repeatSection, saveCurrentProgress, sectionIndex, status.currentTime, status.didJustFinish, totalDurationMs]);

  const seekToLessonPosition = (positionMs: number) => {
    if (currentSection?.audioStatus === 'system_speech') stopSystemSpeech();
    const clamped = Math.max(0, Math.min(totalDurationMs, positionMs));
    let running = 0;
    const targetIndex = playableSections.findIndex((section) => {
      const end = running + section.estimatedDurationMs + section.pauseAfterMs;
      if (clamped <= end) return true;
      running = end;
      return false;
    });
    if (targetIndex < 0) return;
    const offsetSeconds = Math.max(0, (clamped - positionBeforeSection(playableSections, targetIndex)) / 1_000);
    if (targetIndex === sectionIndex) {
      void player.seekTo(offsetSeconds);
    } else {
      pendingSeekSeconds.current = offsetSeconds;
      playWhenReplaced.current = status.playing;
      setSectionIndex(targetIndex);
    }
    saveCurrentProgress(clamped, 0);
  };

  const playOrPause = () => {
    if (!currentSection) return;
    const systemSpeech = currentSection.audioStatus === 'system_speech';
    if (!systemSpeech && !currentSection.audioUrl && !downloadUris[currentSection.id]) return;
    if (systemSpeech) {
      if (systemSpeaking) {
        stopSystemSpeech();
        return;
      }
      void startSystemSpeech();
      return;
    }
    if (status.playing) {
      player.pause();
      return;
    }
    player.setActiveForLockScreen(true, { title: lesson.title, artist: 'JapanGo', albumTitle: `JLPT ${lesson.jlptLevel} Audio Lessons` });
    player.play();
  };

  const setLessonMode = (nextMode: AudioLessonMode) => {
    player.pause();
    stopSystemSpeech();
    pendingSeekSeconds.current = 0;
    setSectionIndex(0);
    setMode(nextMode);
    onProgress({ ...initialProgress, playbackPositionMs: 0, completionPercentage: 0, status: 'not_started', selectedMode: nextMode, updatedAt: new Date().toISOString() });
  };

  if (!currentSection) return <Card><ThemedText>There are no playable sections in this mode.</ThemedText></Card>;
  const sectionStart = positionBeforeSection(playableSections, sectionIndex);
  const globalPositionMs = sectionStart + Math.round(status.currentTime * 1_000);
  const hasAudio = Boolean(downloadUris[currentSection.id] ?? currentSection.audioUrl) && currentSection.audioStatus === 'ready';
  const canPlay = hasAudio || currentSection.audioStatus === 'system_speech';
  const isPlaying = status.playing || systemSpeaking;

  return <Card style={styles.card}>
    <View style={styles.headerRow}>
      <View style={styles.flex}><ThemedText type="smallBold" themeColor="primary">NOW PLAYING · {sectionIndex + 1}/{playableSections.length}</ThemedText><ThemedText type="heading">{currentSection.sectionType.replaceAll('_', ' ')}</ThemedText></View>
      <ThemedText type="small" themeColor="textSecondary">{timeLabel(globalPositionMs)} / {timeLabel(totalDurationMs)}</ThemedText>
    </View>
    <Pressable accessibilityRole="adjustable" accessibilityLabel="Seek through audio lesson" onLayout={(event) => setSeekWidth(Math.max(1, event.nativeEvent.layout.width))} onPress={(event) => seekToLessonPosition((event.nativeEvent.locationX / seekWidth) * totalDurationMs)} style={styles.seekTouch}>
      <ProgressBar value={totalDurationMs ? Math.round((globalPositionMs / totalDurationMs) * 100) : 0} accessibilityLabel="Audio lesson playback progress" />
    </Pressable>
    {currentSection.structuredJapanese ? <InteractiveJapaneseText text={currentSection.structuredJapanese} furiganaMode={furiganaVisible ? 'always' : 'hidden'} type="default" /> : <ThemedText>{currentSection.transcript}</ThemedText>}
    {currentSection.structuredJapanese ? <AppButton label={furiganaVisible ? 'Hide furigana' : 'Show furigana'} variant="quiet" onPress={() => setFuriganaVisible((value) => !value)} /> : null}
    {currentSection.audioStatus === 'system_speech' ? <ThemedText type="small" themeColor="textSecondary">Local preview voice · hosted audio is still required for production release.</ThemedText> : null}
    {systemSpeechError ? <ThemedText type="small" themeColor="error" accessibilityLiveRegion="polite">{systemSpeechError}</ThemedText> : null}
    {!canPlay ? <ThemedText type="small" themeColor="error">Audio for this section is unavailable. Download it again or choose another published lesson.</ThemedText> : null}
    <View style={styles.controls}>
      <AppButton label="−15 sec" variant="secondary" onPress={() => seekToLessonPosition(globalPositionMs - 15_000)} />
      <AppButton label={isPlaying ? (currentSection.audioStatus === 'system_speech' ? 'Stop' : 'Pause') : 'Play'} disabled={!canPlay} onPress={playOrPause} />
      <AppButton label="+15 sec" variant="secondary" onPress={() => seekToLessonPosition(globalPositionMs + 15_000)} />
    </View>
    <View style={styles.controls}>
      <AppButton label="Previous section" variant="quiet" disabled={sectionIndex === 0} onPress={() => { stopSystemSpeech(); pendingSeekSeconds.current = 0; setSectionIndex((value) => Math.max(0, value - 1)); }} />
      <AppButton label="Next section" variant="quiet" disabled={sectionIndex + 1 >= playableSections.length} onPress={() => { stopSystemSpeech(); playWhenReplaced.current = status.playing; pendingSeekSeconds.current = 0; setSectionIndex((value) => Math.min(playableSections.length - 1, value + 1)); }} />
    </View>
    <View style={styles.modeRow} accessibilityRole="tablist">
      {lesson.modes.map((candidate) => <Pressable key={candidate} accessibilityRole="tab" accessibilityState={{ selected: mode === candidate }} onPress={() => setLessonMode(candidate)} style={[styles.mode, { borderColor: mode === candidate ? theme.primary : theme.border, backgroundColor: mode === candidate ? theme.primarySoft : theme.surface }]}><ThemedText type="smallBold">{candidate.replaceAll('_', ' ')}</ThemedText></Pressable>)}
    </View>
    <View style={styles.controls}>
      <AppButton label={repeatSection ? 'Repeating section' : 'Repeat section'} variant="secondary" onPress={() => setRepeatSection((value) => !value)} />
      <AppButton label={repeatLesson ? 'Repeating lesson' : 'Repeat lesson'} variant="secondary" onPress={() => setRepeatLesson((value) => !value)} />
      <AppButton label={autoplayNext ? 'Autoplay next: on' : 'Autoplay next: off'} variant="secondary" onPress={() => setAutoplayNext((value) => !value)} />
    </View>
    {onPreviousLesson || onNextLesson ? <View style={styles.controls}>
      <AppButton label="Previous lesson" variant="quiet" disabled={!onPreviousLesson} onPress={() => onPreviousLesson?.()} />
      <AppButton label="Next lesson" variant="quiet" disabled={!onNextLesson} onPress={() => onNextLesson?.()} />
    </View> : null}
  </Card>;
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two },
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  flex: { flex: 1, gap: 2 },
  seekTouch: { paddingVertical: Spacing.one },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  mode: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
});
