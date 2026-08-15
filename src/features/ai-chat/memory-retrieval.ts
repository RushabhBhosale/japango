import type { ChatMemory } from '@/types/ai-chat';

export interface RankedChatMemory {
  memory: ChatMemory & { embedding: number[] };
  score: number;
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function selectRelevantMemories(
  queryEmbedding: readonly number[],
  memories: readonly (ChatMemory & { embedding: number[] })[],
  limit = 3,
): RankedChatMemory[] {
  return memories
    .map((memory) => ({ memory, score: cosineSimilarity(queryEmbedding, memory.embedding) }))
    .filter(({ score }) => score >= 0.42)
    .sort((left, right) => right.score - left.score || right.memory.importance - left.memory.importance)
    .slice(0, Math.max(1, Math.min(3, limit)));
}
