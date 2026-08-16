import type { DailyHomeworkItemType, DailyHomeworkSource } from '@/types/daily-homework';

export interface DailyHomeworkCandidate {
  id: string;
  type: DailyHomeworkItemType;
  source: DailyHomeworkSource;
  priority: number;
}

export interface DailyHomeworkSelection {
  id: string;
  type: DailyHomeworkItemType;
  source: DailyHomeworkSource;
}

const sourceCycle: readonly DailyHomeworkSource[] = [
  'weakness', 'weakness', 'weakness', 'weakness',
  'new', 'new', 'new',
  'conversation-practice', 'conversation-practice',
  'due-review',
];

const targetCounts: Readonly<Record<DailyHomeworkItemType, number>> = {
  vocabulary: 5,
  kanji: 2,
  grammar: 1,
};

function dateRank(date: string, id: string): number {
  let hash = 2_166_136_261;
  for (const character of `${date}:${id}`) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function compareCandidates(date: string, left: DailyHomeworkCandidate, right: DailyHomeworkCandidate): number {
  return right.priority - left.priority
    || (date ? dateRank(date, left.id) - dateRank(date, right.id) : 0)
    || left.id.localeCompare(right.id);
}

function takeForType(
  candidates: readonly DailyHomeworkCandidate[],
  type: DailyHomeworkItemType,
  count: number,
  usedIds: ReadonlySet<string>,
  cycleOffset: number,
  date: string,
): DailyHomeworkSelection[] {
  const available = candidates.filter((candidate) => candidate.type === type && !usedIds.has(candidate.id));
  const selected: DailyHomeworkSelection[] = [];
  const claimed = new Set(usedIds);

  for (let index = 0; index < count; index += 1) {
    const preferredSource = sourceCycle[(cycleOffset + index) % sourceCycle.length]!;
    const candidate = available
      .filter((item) => item.source === preferredSource && !claimed.has(item.id))
      .sort((left, right) => compareCandidates(date, left, right))[0]
      ?? available.filter((item) => !claimed.has(item.id)).sort((left, right) => compareCandidates(date, left, right))[0];
    if (!candidate) break;
    claimed.add(candidate.id);
    selected.push({ id: candidate.id, type: candidate.type, source: candidate.source });
  }
  return selected;
}

/**
 * Creates a compact plan from authoritative curriculum candidates. The source
 * cycle makes the requested 40/30/20/10 priority a tie-breaker, while due
 * reviews and per-type daily limits remain non-negotiable.
 */
export function selectDailyHomework(candidates: readonly DailyHomeworkCandidate[], date = ''): DailyHomeworkSelection[] {
  const selected: DailyHomeworkSelection[] = [];
  const usedIds = new Set<string>();
  let cycleOffset = date ? dateRank(date, 'source-cycle') % sourceCycle.length : 0;

  for (const type of ['vocabulary', 'kanji', 'grammar'] as const) {
    const next = takeForType(candidates, type, targetCounts[type], usedIds, cycleOffset, date);
    for (const item of next) usedIds.add(item.id);
    selected.push(...next);
    cycleOffset += targetCounts[type];
  }

  const dueCandidates = candidates
    .filter((candidate) => candidate.source === 'due-review' && !usedIds.has(candidate.id))
    .sort((left, right) => compareCandidates(date, left, right))
    .slice(0, 3);
  for (const candidate of dueCandidates) {
    usedIds.add(candidate.id);
    selected.push({ id: candidate.id, type: candidate.type, source: candidate.source });
  }
  return selected;
}
