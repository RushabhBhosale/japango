import type { AudioScriptSection } from './contracts';

export interface AudioTtsResult {
  audioUrl?: string;
  audioStatus: AudioScriptSection['audioStatus'];
  estimatedDurationMs: number;
  provider: string;
}

export interface AudioTtsProvider {
  readonly name: string;
  synthesize(section: AudioScriptSection): Promise<AudioTtsResult>;
}

/** Uses the device's Japanese/English system voices until a hosted TTS provider is configured. */
export class SystemSpeechTtsProvider implements AudioTtsProvider {
  readonly name = 'system-speech';

  async synthesize(section: AudioScriptSection): Promise<AudioTtsResult> {
    return { audioStatus: 'system_speech', estimatedDurationMs: section.estimatedDurationMs, provider: this.name };
  }
}

/** Simple provider contract for a private backend TTS service. Keys remain server-side. */
export class HttpAudioTtsProvider implements AudioTtsProvider {
  readonly name = 'http-tts';

  constructor(private readonly baseUrl: string, private readonly apiKey?: string) {}

  async synthesize(section: AudioScriptSection): Promise<AudioTtsResult> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/u, '')}/synthesize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({ text: section.text, language: section.speaker.language, voice: section.speaker.voice, speakingRate: section.speakingRate }),
    });
    if (!response.ok) throw new Error('TTS synthesis failed.');
    const result = await response.json() as { audioUrl?: unknown; durationMs?: unknown };
    if (typeof result.audioUrl !== 'string') throw new Error('TTS synthesis did not return an audio URL.');
    return { audioUrl: result.audioUrl, audioStatus: 'ready', estimatedDurationMs: typeof result.durationMs === 'number' ? Math.round(result.durationMs) : section.estimatedDurationMs, provider: this.name };
  }
}

export function loadAudioTtsProvider(environment = process.env): AudioTtsProvider {
  if (environment.AUDIO_TTS_PROVIDER === 'http' && environment.AUDIO_TTS_BASE_URL) {
    return new HttpAudioTtsProvider(environment.AUDIO_TTS_BASE_URL, environment.AUDIO_TTS_API_KEY);
  }
  return new SystemSpeechTtsProvider();
}
