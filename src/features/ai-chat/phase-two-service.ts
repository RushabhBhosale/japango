import { getActiveYuiScenario, getCachedChatEmbedding, getChatMemoriesWithoutEmbeddings, getEmbeddedChatMemories, markChatMemoriesUsed, saveCachedChatEmbedding, saveChatMemoryEmbedding, saveYuiScenario } from '@/services/database/ai-chat-repository';
import type { AiChatContext, AiChatScenario } from '@/types/ai-chat';
import { sha256Text } from '@/utils/deterministic-hash';

import { selectRelevantMemories } from './memory-retrieval';
import { selectNextScenario } from './scenario-engine';

function endpoint(path: string): string | undefined {
  const base = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/u, '');
  return base ? `${base}${path}` : undefined;
}

async function requestEmbeddings(inputs: readonly string[]): Promise<number[][]> {
  const url = endpoint('/api/ai-chat/embeddings');
  if (!url) throw new Error('Chat memory is not connected to a secure server.');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ inputs }),
  });
  const body = await response.json() as { success?: boolean; data?: { embeddings?: unknown } };
  const embeddings = body.data?.embeddings;
  if (!response.ok || !body.success || !Array.isArray(embeddings)
    || embeddings.some((embedding) => !Array.isArray(embedding) || embedding.some((value) => typeof value !== 'number' || !Number.isFinite(value)))) {
    throw new Error('Chat memory embeddings could not be created.');
  }
  return embeddings as number[][];
}

async function embeddingFor(text: string): Promise<number[]> {
  const hash = sha256Text(text.trim());
  const cached = await getCachedChatEmbedding(hash);
  if (cached) return cached;
  const [embedding] = await requestEmbeddings([text]);
  if (!embedding) throw new Error('Chat memory embedding was empty.');
  await saveCachedChatEmbedding(hash, embedding);
  return embedding;
}

export async function ensureYuiScenario(context: AiChatContext): Promise<AiChatScenario> {
  const existing = await getActiveYuiScenario();
  if (existing) return existing;
  return saveYuiScenario(selectNextScenario(context.weaknesses));
}

export async function preparePhaseTwoChatContext(context: AiChatContext, latestMessage: string): Promise<Pick<AiChatContext, 'relevantMemories' | 'scenario'>> {
  const scenario = await ensureYuiScenario(context);
  try {
    const memories = await getEmbeddedChatMemories();
    if (!memories.length) return { scenario, relevantMemories: [] };
    const queryEmbedding = await embeddingFor(latestMessage);
    const relevant = selectRelevantMemories(queryEmbedding, memories);
    await markChatMemoriesUsed(relevant.map(({ memory }) => memory.id));
    return { scenario, relevantMemories: relevant.map(({ memory }) => memory) };
  } catch {
    // Conversation remains available when embedding retrieval is offline.
    return { scenario, relevantMemories: [] };
  }
}

export async function enrichPendingChatMemories(): Promise<void> {
  const memories = await getChatMemoriesWithoutEmbeddings();
  if (!memories.length) return;
  const embeddings = await requestEmbeddings(memories.map(({ text }) => text));
  await Promise.all(memories.map(async (memory, index) => {
    const embedding = embeddings[index];
    if (embedding) await saveChatMemoryEmbedding(memory.id, embedding);
  }));
}

export async function syncYuiProactiveContext(input: {
  localUserId: string;
  context: AiChatContext;
  scenario?: AiChatScenario;
}): Promise<void> {
  const url = endpoint('/api/ai-chat/proactive-context');
  if (!url) return;
  let timeZone = 'UTC';
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    // A valid UTC fallback keeps the scheduler safe on runtimes without timezone data.
  }
  const scenario = input.scenario ?? input.context.scenario;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      localUserId: input.localUserId,
      timeZone,
      summary: input.context.summary,
      weaknesses: input.context.weaknesses,
      scenario: scenario ? {
        title: scenario.title,
        setting: scenario.setting,
        goal: scenario.goal,
        targetGrammar: scenario.targetGrammar,
        targetVocabulary: scenario.targetVocabulary,
        complication: scenario.complication,
      } : undefined,
      lastActiveAt: new Date().toISOString(),
    }),
  });
  const body = await response.json() as { success?: boolean };
  if (!response.ok || !body.success) throw new Error('Yui’s availability update could not be saved.');
}
