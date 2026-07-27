import { useEffect, useState } from 'react';

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
  const [speaking, setSpeaking] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => () => { void stopJapaneseSpeech(); }, []);

  const toggleSpeech = async () => {
    if (speaking) {
      await stopJapaneseSpeech();
      setSpeaking(false);
      return;
    }
    setMessage(undefined);
    try {
      setSpeaking(true);
      await speakJapanese(text, {
        rate,
        onDone: () => setSpeaking(false),
        onError: () => {
          setSpeaking(false);
          setMessage('Pronunciation could not be played on this device.');
        },
      });
    } catch (error) {
      setSpeaking(false);
      setMessage(
        error instanceof JapaneseVoiceUnavailableError
          ? 'A Japanese system voice is unavailable. Install one in your device language settings to use pronunciation.'
          : 'Pronunciation could not be played on this device.',
      );
    }
  };

  return (
    <>
      <AppButton
        label={speaking ? 'Stop pronunciation' : label}
        variant="secondary"
        onPress={() => void toggleSpeech()}
      />
      {message ? <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">{message}</ThemedText> : null}
    </>
  );
}
