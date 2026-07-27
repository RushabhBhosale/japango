import { CACHE_ROOT } from "./config";
import { writeJson } from "./lib/fs-utils";
import type {
  CurriculumUnit,
  GrammarRecord,
  KanjiRecord,
  TextbookCurriculumMapping,
  VocabularyRecord,
} from "./schemas/content-schemas";

interface LevelLimits {
  vocabulary: number;
  kanji: number;
  grammar: number;
}

export const CURRICULUM_UNIT_LIMITS: Record<"N5" | "N4", LevelLimits> = {
  N5: { vocabulary: 25, kanji: 6, grammar: 3 },
  N4: { vocabulary: 30, kanji: 8, grammar: 3 },
};

interface IdentifiedRecord {
  id: string;
}

function balancedGroups<T>(items: readonly T[], maximum: number): T[][] {
  if (items.length === 0) return [];
  const groupCount = Math.ceil(items.length / maximum);
  return Array.from({ length: groupCount }, (_, index) => {
    const start = Math.floor((index * items.length) / groupCount);
    const end = Math.floor(((index + 1) * items.length) / groupCount);
    return items.slice(start, end);
  });
}

function spreadGroups<T>(groups: readonly T[][], unitCount: number): T[][] {
  const output = Array.from({ length: unitCount }, () => [] as T[]);
  if (groups.length === 0) return output;
  groups.forEach((group, index) => {
    const position =
      groups.length === 1
        ? 0
        : Math.round((index * (unitCount - 1)) / (groups.length - 1));
    output[position].push(...group);
  });
  return output;
}

function stageFor(order: number, total: number): CurriculumUnit["stage"] {
  const ratio = order / total;
  if (ratio <= 0.25) return "foundation";
  if (ratio <= 0.5) return "recovery";
  if (ratio <= 0.8) return "development";
  return "consolidation";
}

function median(values: readonly number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * The bounded OCR map records occurrences, not verified introductions. A
 * median normalized lesson position dampens repeated particles and examples
 * while still making the reviewed page map a deterministic sequencing hint.
 */
export function textbookRanks(
  mappings: readonly TextbookCurriculumMapping[],
): Map<string, number> {
  const placements = new Map<string, number[]>();
  for (const mapping of mappings) {
    if (!mapping.verifiedForSequencing) continue;
    const span = Math.max(1, mapping.lessonEndPage - mapping.lessonStartPage + 1);
    const rank = mapping.lessonStartPage + span / 2;
    for (const id of [
      ...mapping.vocabularyIds,
      ...mapping.kanjiIds,
      ...mapping.grammarIds,
    ]) {
      placements.set(id, [...(placements.get(id) ?? []), rank]);
    }
  }
  return new Map(
    [...placements].map(([id, values]) => [id, median(values)] as const),
  );
}

function orderByTextbookRank<T extends IdentifiedRecord>(
  records: readonly T[],
  ranks: ReadonlyMap<string, number>,
): T[] {
  return [...records].sort(
    (left, right) =>
      (ranks.get(left.id) ?? Number.POSITIVE_INFINITY) -
        (ranks.get(right.id) ?? Number.POSITIVE_INFINITY) ||
      left.id.localeCompare(right.id, "ja"),
  );
}

function topologicalGrammarOrder(
  records: readonly GrammarRecord[],
  ranks: ReadonlyMap<string, number>,
): GrammarRecord[] {
  const remaining = new Map(records.map((record) => [record.id, record]));
  const output: GrammarRecord[] = [];
  const emitted = new Set<string>();
  while (remaining.size > 0) {
    const available = [...remaining.values()]
      .filter((record) =>
        record.prerequisiteGrammarIds.every(
          (id) => emitted.has(id) || !remaining.has(id),
        ),
      )
      .sort(
        (left, right) =>
          (left.level === "N4" ? left.curriculumOrder : Number.POSITIVE_INFINITY) -
            (right.level === "N4"
              ? right.curriculumOrder
              : Number.POSITIVE_INFINITY) ||
          (ranks.get(left.id) ?? Number.POSITIVE_INFINITY) -
            (ranks.get(right.id) ?? Number.POSITIVE_INFINITY) ||
          left.id.localeCompare(right.id, "ja"),
      );
    if (available.length === 0) {
      // Validation reports the cycle. Stable fallback keeps report generation deterministic.
      output.push(
        ...[...remaining.values()].sort((left, right) =>
          left.id.localeCompare(right.id, "ja"),
        ),
      );
      break;
    }
    const selected = available[0]?.level === "N5" ? available : [available[0]];
    for (const record of selected) {
      remaining.delete(record.id);
      emitted.add(record.id);
      output.push(record);
    }
  }
  return output;
}

function grammarGroups(
  records: readonly GrammarRecord[],
  maximum: number,
): GrammarRecord[][] {
  const output: GrammarRecord[][] = [];
  let current: GrammarRecord[] = [];
  for (const record of records) {
    const currentIds = new Set(current.map(({ id }) => id));
    const dependsOnCurrent = record.prerequisiteGrammarIds.some((id) =>
      currentIds.has(id),
    );
    if (current.length >= maximum || dependsOnCurrent) {
      output.push(current);
      current = [];
    }
    current.push(record);
  }
  if (current.length > 0) output.push(current);
  return output;
}

function levelTextbookSources(level: "N5" | "N4"): string[] {
  return level === "N5"
    ? [
        "textbook-genki-i",
        "textbook-minna-no-nihongo-i",
        "textbook-minna-no-nihongo-i-grammar",
      ]
    : [
        "textbook-genki-ii",
        "textbook-minna-no-nihongo-ii",
        "textbook-minna-no-nihongo-ii-grammar",
      ];
}

function buildLevelUnits(
  level: "N5" | "N4",
  vocabulary: readonly VocabularyRecord[],
  kanji: readonly KanjiRecord[],
  grammar: readonly GrammarRecord[],
  ranks: ReadonlyMap<string, number>,
  n5FinalUnitId: string | null,
): CurriculumUnit[] {
  const limits = CURRICULUM_UNIT_LIMITS[level];
  const orderedVocabulary = orderByTextbookRank(vocabulary, ranks);
  const orderedKanji = orderByTextbookRank(kanji, ranks);
  const orderedGrammar = topologicalGrammarOrder(grammar, ranks);
  const vocabularyGroups = balancedGroups(orderedVocabulary, limits.vocabulary);
  const kanjiGroups = balancedGroups(orderedKanji, limits.kanji);
  const groupedGrammar = grammarGroups(orderedGrammar, limits.grammar);
  const unitCount = Math.max(
    1,
    vocabularyGroups.length,
    kanjiGroups.length,
    groupedGrammar.length,
  );
  const vocabularyByUnit = spreadGroups(vocabularyGroups, unitCount);
  const kanjiByUnit = spreadGroups(kanjiGroups, unitCount);
  const grammarByUnit = spreadGroups(groupedGrammar, unitCount);
  const introducedKanji = new Set<string>();

  return Array.from({ length: unitCount }, (_, index): CurriculumUnit => {
    const order = index + 1;
    const id = `${level.toLocaleLowerCase("en-US")}-unit-${String(order).padStart(3, "0")}`;
    const prerequisiteUnitIds: string[] = [];
    if (index > 0) {
      prerequisiteUnitIds.push(
        `${level.toLocaleLowerCase("en-US")}-unit-${String(index).padStart(3, "0")}`,
      );
    } else if (level === "N4" && n5FinalUnitId) {
      prerequisiteUnitIds.push(n5FinalUnitId);
    }

    const newVocabulary = vocabularyByUnit[index];
    const newKanji = kanjiByUnit[index];
    const newGrammar = grammarByUnit[index];
    const kanaFirstVocabularyIds = newVocabulary
      .filter((record) =>
        record.kanjiIds.some((kanjiId) => !introducedKanji.has(kanjiId)),
      )
      .map(({ id: vocabularyId }) => vocabularyId);
    const previousVocabulary = vocabularyByUnit[index - 1] ?? [];
    const previousKanji = kanjiByUnit[index - 1] ?? [];
    const previousGrammar = grammarByUnit[index - 1] ?? [];
    const reviewVocabularyIds = previousVocabulary.slice(-5).map(({ id: itemId }) => itemId);
    const reviewKanjiIds = previousKanji.slice(-2).map(({ id: itemId }) => itemId);
    const reviewGrammarIds = previousGrammar.slice(-2).map(({ id: itemId }) => itemId);
    const goals = [
      newVocabulary.length > 0
        ? `Recognize ${newVocabulary.length} ${level} vocabulary items in short contexts.`
        : null,
      newKanji.length > 0
        ? `Read ${newKanji.length} ${level} kanji through vocabulary, not isolated readings.`
        : null,
      newGrammar.length > 0
        ? `Practise ${newGrammar.length} ${level} grammar patterns across recognition and sentence meaning.`
        : null,
      kanaFirstVocabularyIds.length > 0
        ? `Learn ${kanaFirstVocabularyIds.length} items kana-first until their required kanji are introduced.`
        : null,
    ].filter((goal): goal is string => Boolean(goal));

    const sourceIds = new Set<string>(levelTextbookSources(level));
    for (const record of [...newVocabulary, ...newKanji]) {
      for (const source of record.sources) sourceIds.add(source.sourceId);
    }
    for (const record of newGrammar) {
      if (record.level === "N5") {
        for (const source of record.sources) sourceIds.add(source.sourceId);
      } else {
        sourceIds.add("japango-n4-grammar-reviewed");
      }
    }
    for (const record of newKanji) introducedKanji.add(record.id);

    return {
      id,
      title: `${level} focused unit ${String(order).padStart(2, "0")}`,
      level,
      order,
      kind: "learning",
      stage: stageFor(order, unitCount),
      learningGoals:
        goals.length > 0 ? goals : ["Consolidate previously introduced content."],
      grammarIds: newGrammar.map(({ id: itemId }) => itemId),
      vocabularyIds: newVocabulary.map(({ id: itemId }) => itemId),
      kanjiIds: newKanji.map(({ id: itemId }) => itemId),
      kanaFirstVocabularyIds,
      reviewGrammarIds,
      reviewVocabularyIds,
      reviewKanjiIds,
      prerequisiteUnitIds,
      sourceReferences: [...sourceIds]
        .sort()
        .map((sourceId) => ({ sourceId })),
      reviewTargets: {
        grammar: reviewGrammarIds.length,
        vocabulary: reviewVocabularyIds.length,
        kanji: reviewKanjiIds.length,
      },
      recommendedReadingDifficulty: Math.min(
        8,
        Math.max(1, Math.ceil((order * 8) / unitCount)),
      ),
      recommendedListeningDifficulty: Math.min(
        8,
        Math.max(1, Math.ceil((order * 8) / unitCount)),
      ),
      masteryRequirements: {
        minimumAccuracy: 0.8,
        minimumReviews: 2,
      },
      confidence: 0.55,
      needsReview: true,
      releaseReady: false,
    };
  });
}

export function buildCurriculumUnits(
  vocabulary: { n5: readonly VocabularyRecord[]; n4: readonly VocabularyRecord[] },
  kanji: { n5: readonly KanjiRecord[]; n4: readonly KanjiRecord[] },
  grammar: { n5: readonly GrammarRecord[]; n4: readonly GrammarRecord[] },
  textbookMap: readonly TextbookCurriculumMapping[],
): { n5: CurriculumUnit[]; n4: CurriculumUnit[] } {
  const ranks = textbookRanks(textbookMap);
  const n5 = buildLevelUnits(
    "N5",
    vocabulary.n5,
    kanji.n5,
    grammar.n5,
    ranks,
    null,
  );
  const n4 = buildLevelUnits(
    "N4",
    vocabulary.n4,
    kanji.n4,
    grammar.n4.filter(
      (record) =>
        record.level === "N4" &&
        record.reviewStatus === "approved" &&
        record.releaseReady,
    ),
    ranks,
    n5.at(-1)?.id ?? null,
  );
  return { n5, n4 };
}

export async function buildCurriculum(
  vocabulary: { n5: readonly VocabularyRecord[]; n4: readonly VocabularyRecord[] },
  kanji: { n5: readonly KanjiRecord[]; n4: readonly KanjiRecord[] },
  grammar: { n5: readonly GrammarRecord[]; n4: readonly GrammarRecord[] },
  textbookMap: readonly TextbookCurriculumMapping[],
): Promise<{ n5: CurriculumUnit[]; n4: CurriculumUnit[] }> {
  const curriculum = buildCurriculumUnits(
    vocabulary,
    kanji,
    grammar,
    textbookMap,
  );
  await writeJson(`${CACHE_ROOT}/merged/curriculum.json`, curriculum);
  return curriculum;
}
