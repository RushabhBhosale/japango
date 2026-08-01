import { useEffect, useRef, useState } from 'react';

import { AppButton } from '@/components/common/app-button';
import {
  JapaneseVoiceUnavailableError,
  speakJapanese,
  stopJapaneseSpeech,
} from '@/services/speech/japanese-speech';

import { ThemedText } from '../themed-text';

interface JapaneseSpeechButtonProps {
  text: string;
  label?: string;
  rate?: number;
}

export function JapaneseSpeechButton({ text, label = 'Play pronunciation', rate }: JapaneseSpeechButtonProps) {
  const [playbackState, setPlaybackState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [message, setMessage] = useState<string>();
  const playbackId = useRef(0);
  const resumeAt = useRef(0);
  const previousText = useRef(text);

  useEffect(() => () => {
    playbackId.current += 1;
    void stopJapaneseSpeech();
  }, []);

  useEffect(() => {
    if (previousText.current === text) return;
    previousText.current = text;
    playbackId.current += 1;
    resumeAt.current = 0;
    setPlaybackState('idle');
    void stopJapaneseSpeech();
  }, [text]);

  const playFrom = async (startAt: number) => {
    const currentPlayback = playbackId.current + 1;
    playbackId.current = currentPlayback;
    resumeAt.current = startAt;
    setMessage(undefined);
    setPlaybackState('playing');
    try {
      await speakJapanese(text.slice(startAt), {
        rate,
        onBoundary: (relativeIndex) => {
          if (playbackId.current === currentPlayback) resumeAt.current = startAt + relativeIndex;
        },
        onDone: () => {
          if (playbackId.current !== currentPlayback) return;
          resumeAt.current = 0;
          setPlaybackState('idle');
        },
        onError: () => {
          if (playbackId.current !== currentPlayback) return;
          setPlaybackState('idle');
          setMessage('Pronunciation could not be played on this device.');
        },
      });
    } catch (error) {
      if (playbackId.current !== currentPlayback) return;
      setPlaybackState('idle');
      setMessage(
        error instanceof JapaneseVoiceUnavailableError
          ? 'A Japanese system voice is unavailable. Install one in your device language settings to use pronunciation.'
          : 'Pronunciation could not be played on this device.',
      );
    }
  };

  const pause = async () => {
    // Expo Speech cannot natively pause on Android. Stop at the most recent
    // word boundary and resume from that boundary so playback is reliable on
    // every supported device.
    playbackId.current += 1;
    await stopJapaneseSpeech();
    setPlaybackState('paused');
  };

  const toggleSpeech = async () => {
    if (playbackState === 'playing') {
      await pause();
      return;
    }
    await playFrom(playbackState === 'paused' ? resumeAt.current : 0);
  };

  const buttonLabel = playbackState === 'playing'
    ? 'Pause playback'
    : playbackState === 'paused'
      ? 'Resume playback'
      : label;

  return (
    <>
      <AppButton
        label={buttonLabel}
        variant="secondary"
        accessibilityLabel={playbackState === 'paused' ? 'Resume from the last spoken word' : buttonLabel}
        onPress={() => void toggleSpeech()}
      />
      {playbackState === 'paused' ? <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">Paused. Resume from the last spoken word.</ThemedText> : null}
      {message ? <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">{message}</ThemedText> : null}
    </>
  );
}
