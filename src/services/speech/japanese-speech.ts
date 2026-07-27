import * as Speech from 'expo-speech';

export class JapaneseVoiceUnavailableError extends Error {
  constructor() {
    super('A Japanese system voice is not available on this device.');
  }
}

export interface JapaneseSpeechOptions {
  rate?: number;
  onDone?: () => void;
  onError?: () => void;
}

function isJapaneseVoice(language: string): boolean {
  return language.toLowerCase().startsWith('ja');
}

export async function speakJapanese(
  text: string,
  { rate = 0.82, onDone, onError }: JapaneseSpeechOptions = {},
): Promise<void> {
  if (!text.trim()) return;
  const voices = await Speech.getAvailableVoicesAsync();
  const voice = voices.find((candidate) => isJapaneseVoice(candidate.language));
  if (!voice) throw new JapaneseVoiceUnavailableError();
  await Speech.stop();
  Speech.speak(text, {
    language: voice.language,
    voice: voice.identifier,
    rate,
    onDone,
    onStopped: onDone,
    onError,
  });
}

export async function stopJapaneseSpeech(): Promise<void> {
  await Speech.stop();
}
