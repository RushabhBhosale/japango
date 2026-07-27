export const topicQuizModes = ['quick', 'standard', 'full'] as const;

export type TopicQuizMode = (typeof topicQuizModes)[number];

const topicVariantPrefix = 'topic-quiz::';

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  }
  return result >>> 0;
}

export function createTopicQuizVariantId(sourceQuestionId: string, variantIndex: number): string {
  return `${topicVariantPrefix}${sourceQuestionId}::${variantIndex}`;
}

export function parseTopicQuizVariantId(questionId: string):
  | { sourceQuestionId: string; variantIndex: number }
  | undefined {
  if (!questionId.startsWith(topicVariantPrefix)) return undefined;
  const remainder = questionId.slice(topicVariantPrefix.length);
  const separator = remainder.lastIndexOf('::');
  if (separator <= 0) return undefined;
  const sourceQuestionId = remainder.slice(0, separator);
  const variantIndex = Number(remainder.slice(separator + 2));
  if (!sourceQuestionId || !Number.isInteger(variantIndex) || variantIndex < 1) return undefined;
  return { sourceQuestionId, variantIndex };
}

export function selectTopicQuizQuestionIds(
  sourceQuestionIds: readonly string[],
  mode: TopicQuizMode,
): string[] {
  const uniqueIds = [...new Set(sourceQuestionIds)];
  if (mode === 'full') return uniqueIds;

  const desiredCount = mode === 'quick' ? 5 : 10;
  const ordered = [...uniqueIds].sort((left, right) => {
    const difference = hash(`topic-quiz-v1:${left}`) - hash(`topic-quiz-v1:${right}`);
    return difference || left.localeCompare(right);
  });
  const selected = ordered.slice(0, Math.min(desiredCount, ordered.length));
  if (!ordered.length) return selected;

  for (let index = selected.length; index < desiredCount; index += 1) {
    const sourceQuestionId = ordered[(index - ordered.length) % ordered.length];
    const variantIndex = Math.floor((index - ordered.length) / ordered.length) + 1;
    if (!sourceQuestionId) break;
    selected.push(createTopicQuizVariantId(sourceQuestionId, variantIndex));
  }
  return selected;
}
