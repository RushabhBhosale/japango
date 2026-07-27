import type { ExamCandidate, PracticeDomain, PracticeSelection } from '@/types/exam';

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

function ordered(candidates: ExamCandidate[], seed: string): ExamCandidate[] {
  return [...candidates].sort((left, right) => {
    const recentDifference = Number(Boolean(left.lastSeenAt)) - Number(Boolean(right.lastSeenAt));
    if (recentDifference) return recentDifference;
    const hashDifference = hash(`${seed}:${left.id}`) - hash(`${seed}:${right.id}`);
    return hashDifference || left.id.localeCompare(right.id);
  });
}

function domainQuota(domains: PracticeDomain[], count: number): Map<PracticeDomain, number> {
  const quotas = new Map<PracticeDomain, number>();
  domains.forEach((domain, index) => quotas.set(domain, Math.floor(count / domains.length) + (index < count % domains.length ? 1 : 0)));
  return quotas;
}

/** Pure, seed-stable selector. The repository provides only release-ready candidates. */
export function generateExamQuestionIds(candidates: ExamCandidate[], selection: PracticeSelection): string[] {
  const uniqueDomains = [...new Set(selection.domains)];
  if (!uniqueDomains.length || selection.questionCount < 1) return [];
  const quotas = domainQuota(uniqueDomains, selection.questionCount);
  const selected: ExamCandidate[] = [];
  const usedQuestionIds = new Set<string>();
  const usedItemIds = new Set<string>();
  const usedTags = new Set<string>();

  for (const domain of uniqueDomains) {
    const candidatesForDomain = ordered(candidates.filter((candidate) => candidate.domain === domain), selection.seed);
    const orderById = new Map(candidatesForDomain.map((candidate, index) => [candidate.id, index]));
    const quota = quotas.get(domain) ?? 0;
    for (let position = 0; position < quota; position += 1) {
      const targetDifficulty = [2, 3, 4, 1, 5][position % 5];
      const candidate = candidatesForDomain
        .filter((item) => !usedQuestionIds.has(item.id) && !usedItemIds.has(item.itemId))
        .sort((left, right) => {
          const topicDifference = Number(left.tags.some((tag) => usedTags.has(tag))) - Number(right.tags.some((tag) => usedTags.has(tag)));
          if (topicDifference) return topicDifference;
          const difficultyDifference = Math.abs(left.difficultyRank - targetDifficulty) - Math.abs(right.difficultyRank - targetDifficulty);
          return difficultyDifference || (orderById.get(left.id)! - orderById.get(right.id)!);
        })[0];
      if (!candidate) break;
      selected.push(candidate); usedQuestionIds.add(candidate.id); usedItemIds.add(candidate.itemId); candidate.tags.forEach((tag) => usedTags.add(tag));
    }
    for (const candidate of candidatesForDomain) {
      if (selected.filter((item) => item.domain === domain).length >= quota) break;
      if (usedQuestionIds.has(candidate.id)) continue;
      selected.push(candidate); usedQuestionIds.add(candidate.id); candidate.tags.forEach((tag) => usedTags.add(tag));
    }
  }

  if (selected.length < selection.questionCount) {
    for (const candidate of ordered(candidates, selection.seed)) {
      if (selected.length >= selection.questionCount || usedQuestionIds.has(candidate.id)) break;
      selected.push(candidate); usedQuestionIds.add(candidate.id); candidate.tags.forEach((tag) => usedTags.add(tag));
    }
  }
  return selected.map((candidate) => candidate.id);
}
