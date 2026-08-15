import { z } from 'zod';

import { AiChatServerError } from '../errors';
import type { AiChatProvider } from '../provider';
import type { ProactiveCandidate } from './policy';
import type { ProactiveWeakness } from './schemas';

const responseSchema = z.object({ message: z.string().trim().min(1).max(280) }).strict();

function prompt(candidate: ProactiveCandidate, target?: ProactiveWeakness): { system: string; user: string } {
  return {
    system: `You are Yui, JapanGo's fictional warm casual Japanese friend. Write one short unsolicited message that naturally continues an established chat. It must sound social, not like a lesson or reminder to study. Never claim a physical real-world action. This will be shown in a notification to a beginner, so write in simple English with no Japanese text. Use no more than two short sentences, and return JSON only: {"message":"..."}.`,
    user: JSON.stringify({
      conversationSummary: candidate.summary ?? null,
      hiddenScenario: candidate.scenario ?? null,
      optionalWeaknessToUseNaturally: target ? { type: target.type, key: target.key } : null,
      instruction: 'Sometimes use the weakness naturally; if it would feel forced, send a normal social message instead.',
    }),
  };
}

function parseMessage(raw: string): string {
  const candidate = raw.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '');
  try {
    return responseSchema.parse(JSON.parse(candidate) as unknown).message;
  } catch {
    const match = candidate.match(/\{[\s\S]*\}/u);
    if (!match) throw new AiChatServerError('INVALID_RESPONSE', true, 'Yui’s proactive message was unreadable.');
    return responseSchema.parse(JSON.parse(match[0]) as unknown).message;
  }
}

export async function generateProactiveMessage(
  providers: readonly AiChatProvider[],
  candidate: ProactiveCandidate,
  target: ProactiveWeakness | undefined,
  signal: AbortSignal,
): Promise<string> {
  const request = prompt(candidate, target);
  let lastError: unknown;
  for (const provider of providers) {
    try {
      return parseMessage(await provider.complete({ ...request, signal }));
    } catch (error) {
      lastError = error;
      if (error instanceof AiChatServerError && !error.retryable) throw error;
    }
  }
  throw lastError instanceof AiChatServerError
    ? lastError
    : new AiChatServerError('ALL_PROVIDERS_FAILED', true, 'Yui is unavailable right now.');
}
