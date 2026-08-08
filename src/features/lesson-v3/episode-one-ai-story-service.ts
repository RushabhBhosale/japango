import { z } from 'zod';

import type { V3ChatMessage, V3JapaneseLine, V3StoryChoices } from '@/types/lesson-v3';
import { createLocalId } from '@/utils/id';

import {
  episodeOneYukiFollowUp,
  episodeOneYukiProposal,
  type EpisodeOneConversationDecision,
} from './episode-one-conversation';

const responseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    replyJapanese: z.string().trim().min(1).max(240),
    next: z.enum(['follow-up', 'checkpoint']),
  }).strict(),
}).strict();

export interface EpisodeOneAiStoryReply {
  message: V3ChatMessage;
  requiresFollowUp: boolean;
  source: 'ai' | 'fallback';
}

function endpoint(): string | undefined {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/u, '');
  return base ? `${base}/api/ai/episode-conversation` : undefined;
}

// AI text has no automatic readings. It is shown as plain Japanese rather
// than inventing furigana for generated kanji.
function aiLine(raw: string): V3JapaneseLine {
  return {
    text: {
      raw,
      tokens: [{ id: 'yuki-ai-reply', kind: 'plain', surface: raw, kanjiIds: [] }],
    },
  };
}

function fallbackReply(choices: V3StoryChoices, decision: EpisodeOneConversationDecision): EpisodeOneAiStoryReply {
  const message = decision.requiresFollowUp
    ? episodeOneYukiFollowUp(choices)
    : episodeOneYukiProposal(choices);
  return {
    message: message ?? { id: 'yuki-offline-reply', sender: 'yuki', line: aiLine('明日ひまな時間があれば教えて！') },
    requiresFollowUp: decision.requiresFollowUp,
    source: 'fallback',
  };
}

export async function requestEpisodeOneYukiReply(
  learnerReply: string,
  choices: V3StoryChoices,
  decision: EpisodeOneConversationDecision,
  forceCheckpoint: boolean,
): Promise<EpisodeOneAiStoryReply> {
  const url = endpoint();
  if (!url) return fallbackReply(choices, decision);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        learnerReply,
        availabilityTomorrow: choices.availabilityTomorrow,
        preferredMeetingTime: choices.preferredMeetingTime,
        forceCheckpoint,
        requestId: createLocalId('episode-1-yuki'),
      }),
      signal: controller.signal,
    });
    const body = responseSchema.parse(await response.json() as unknown);
    return {
      message: { id: 'yuki-ai-reply', sender: 'yuki', line: aiLine(body.data.replyJapanese) },
      requiresFollowUp: decision.requiresFollowUp || body.data.next === 'follow-up',
      source: 'ai',
    };
  } catch {
    return fallbackReply(choices, decision);
  } finally {
    clearTimeout(timeout);
  }
}
