import { getLearnerProfile } from '@/services/database/profile-repository';
import {
  createPendingYuiMessage,
  getChatMessage,
  getYuiChat,
  getYuiChatContext,
  markChatMessageFailed,
  markChatMessagePending,
  persistYuiResponse,
} from '@/services/database/ai-chat-repository';
import type { AiChatMessage, AiChatResponse } from '@/types/ai-chat';

import { enrichPendingChatMemories, preparePhaseTwoChatContext } from './phase-two-service';
import { aiChatNetworkRequestSchema, aiChatResponseSchema, type AiChatNetworkRequest } from './schemas';

// Allow the server enough time to use OpenRouter’s model fallback before the
// device treats the message as failed.
const requestTimeoutMs = 55_000;
const inFlightMessages = new Map<string, Promise<void>>();

export class AiChatClientError extends Error {
  constructor(public readonly retryable: boolean, message: string) {
    super(message);
  }
}

function endpoint(): string | undefined {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/u, '');
  return base ? `${base}/api/ai-chat/conversations/yui-main/messages` : undefined;
}

function learnerLevel(level: Awaited<ReturnType<typeof getLearnerProfile>>['learnerLevel']): 'N5' | 'N4' {
  return level === 'Ready to begin N4 gradually' ? 'N4' : 'N5';
}

function signalKey(type: 'grammar' | 'vocabulary' | 'kanji', key: string): string {
  return `${type}:${key.trim().toLocaleLowerCase('en-US')}`;
}

/** Models may report only curriculum targets that the local learner owns. */
function keepSupportedLearningSignals(
  response: AiChatResponse,
  context: Awaited<ReturnType<typeof getYuiChatContext>>,
): AiChatResponse {
  const supported = new Set([
    ...context.learningTargets.map((target) => signalKey(target.type, target.key)),
    ...context.weaknesses.map((target) => signalKey(target.type, target.key)),
  ]);
  return {
    ...response,
    learningSignals: response.learningSignals.filter((signal) => supported.has(signalKey(signal.type, signal.key))),
  };
}

async function requestYuiReply(input: AiChatNetworkRequest): Promise<AiChatResponse> {
  const url = endpoint();
  if (!url) {
    throw new AiChatClientError(false, 'Chat needs a secure JapanGo server connection before Yui can reply.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    const body = await response.json() as {
      success?: boolean;
      data?: unknown;
      error?: { retryable?: boolean; userMessage?: string };
    };
    if (!response.ok || !body.success) {
      throw new AiChatClientError(
        Boolean(body.error?.retryable),
        body.error?.userMessage ?? 'Yui could not reply right now. Your message is saved; try again when you are online.',
      );
    }
    return aiChatResponseSchema.parse(body.data);
  } catch (error) {
    if (error instanceof AiChatClientError) throw error;
    if (controller.signal.aborted) {
      throw new AiChatClientError(true, 'Yui is taking longer than usual. Your message is saved; try again shortly.');
    }
    throw new AiChatClientError(true, 'Yui could not reply right now. Your message is saved; try again when you are online.');
  } finally {
    clearTimeout(timeout);
  }
}

async function sendPendingMessage(message: AiChatMessage): Promise<void> {
  const existing = inFlightMessages.get(message.id);
  if (existing) return existing;
  const request = sendPendingMessageOnce(message).finally(() => inFlightMessages.delete(message.id));
  inFlightMessages.set(message.id, request);
  return request;
}

async function sendPendingMessageOnce(message: AiChatMessage): Promise<void> {
  const [context, profile] = await Promise.all([getYuiChatContext(), getLearnerProfile()]);
  let phaseTwo: Awaited<ReturnType<typeof preparePhaseTwoChatContext>> = { relevantMemories: [] };
  try {
    phaseTwo = await preparePhaseTwoChatContext(context, message.content);
  } catch {
    // Chat replies must remain available if optional local memory preparation fails.
  }
  const payload = aiChatNetworkRequestSchema.parse({
    message: message.content,
    learnerLevel: learnerLevel(profile.learnerLevel),
    conversation: {
      summary: context.summary,
      recentMessages: context.recentMessages.map(({ role, content }) => ({ role, content })),
      relevantMemories: phaseTwo.relevantMemories?.map(({ text }) => text),
      scenario: phaseTwo.scenario ? {
        title: phaseTwo.scenario.title,
        setting: phaseTwo.scenario.setting,
        goal: phaseTwo.scenario.goal,
        targetGrammar: phaseTwo.scenario.targetGrammar,
        targetVocabulary: phaseTwo.scenario.targetVocabulary,
        complication: phaseTwo.scenario.complication,
      } : undefined,
    },
    chatPatterns: context.chatPatterns.map(({ type, observations }) => ({ type, observations })),
    learningTargets: context.learningTargets,
    weaknesses: context.weaknesses,
  });
  try {
    const response = keepSupportedLearningSignals(await requestYuiReply(payload), context);
    await persistYuiResponse(message.id, response);
    void enrichPendingChatMemories().catch(() => undefined);
  } catch (error) {
    await markChatMessageFailed(message.id);
    throw error;
  }
}

export async function sendYuiMessage(
  content: string,
  onPending?: (message: AiChatMessage) => void,
): Promise<Awaited<ReturnType<typeof getYuiChat>>> {
  const normalized = content.trim();
  if (!normalized) throw new AiChatClientError(false, 'Write a message before sending it.');
  const message = await createPendingYuiMessage(normalized);
  onPending?.(message);
  await sendPendingMessage(message);
  return getYuiChat();
}

export async function retryYuiMessage(messageId: string): Promise<Awaited<ReturnType<typeof getYuiChat>>> {
  const message = await getChatMessage(messageId);
  if (!message || message.role !== 'learner') {
    throw new AiChatClientError(false, 'That message is no longer available to retry.');
  }
  if (message.deliveryStatus !== 'failed') return getYuiChat();
  const claimed = await markChatMessagePending(message.id);
  if (!claimed) return getYuiChat();
  await sendPendingMessage({ ...message, deliveryStatus: 'pending' });
  return getYuiChat();
}
