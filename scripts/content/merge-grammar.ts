import { CACHE_ROOT } from "./config";
import { writeJson } from "./lib/fs-utils";
import {
  grammarTitle,
  grammarSemanticId,
  splitGrammarPattern,
} from "./normalize-grammar";
import type {
  LegacyN5GrammarRecord,
  ReviewedN4GrammarRecord,
} from "./schemas/content-schemas";
import type { GrammarCandidate } from "./types";

export interface GrammarMergeArtifacts {
  n5: LegacyN5GrammarRecord[];
  n4: ReviewedN4GrammarRecord[];
  unmatched: unknown[];
  duplicates: unknown[];
  lowConfidence: unknown[];
}

export async function mergeGrammar(
  candidates: readonly GrammarCandidate[],
  reviewedN4: readonly ReviewedN4GrammarRecord[] = [],
): Promise<GrammarMergeArtifacts> {
  const parsed = candidates.map((candidate) => ({
    candidate,
    ...splitGrammarPattern(candidate.pattern),
  }));
  const baseCounts = new Map<string, number>();
  for (const item of parsed) {
    const key = item.pattern;
    baseCounts.set(key, (baseCounts.get(key) ?? 0) + 1);
  }
  const usedIds = new Map<string, number>();
  const duplicates: unknown[] = [];
  const records: LegacyN5GrammarRecord[] = [];
  const patternOccurrences = new Map<string, number>();

  for (const item of parsed) {
    const occurrence = patternOccurrences.get(item.pattern) ?? 0;
    patternOccurrences.set(item.pattern, occurrence + 1);
    const title = grammarTitle(
      item.pattern,
      item.candidate.meaningLabel,
      occurrence,
    );
    const semanticId = grammarSemanticId(
      item.pattern,
      title,
      (baseCounts.get(item.pattern) ?? 0) > 1,
    );
    const existing = usedIds.get(semanticId) ?? 0;
    usedIds.set(semanticId, existing + 1);
    const id = existing === 0 ? semanticId : `${semanticId}-${item.candidate.order}`;
    if ((baseCounts.get(item.pattern) ?? 0) > 1 || existing > 0) {
      duplicates.push({
        type: "grammar-pattern",
        pattern: item.pattern,
        sourceRow: item.candidate.sourceRow,
        chosenId: id,
        resolution: "semantic-title-slug",
      });
    }
    records.push({
      id,
      pattern: item.pattern,
      alternatePatterns: item.alternates,
      title,
      level: "N5",
      levelConfidence: 0.9,
      formationRules: [],
      shortExplanation: null,
      detailedExplanation: null,
      usage: {
        intentions: [],
        register: null,
        politeness: null,
        restrictions: [],
      },
      prerequisiteGrammarIds: [],
      relatedGrammarIds: [],
      confusedWithGrammarIds: [],
      commonMistakes: [],
      exampleIds: [],
      exerciseTemplateIds: [],
      textbookReferences: [],
      sources: [
        {
          sourceId: "kotoba-brew-grammar-n5",
          sourceRecordId: `row-${item.candidate.sourceRow}`,
        },
      ],
      attribution: [
        "Grammar pattern and level mapping from the locally supplied Kotoba Brew tracker; redistribution terms require review.",
      ],
      confidence: 0.8,
      needsReview: true,
      releaseReady: false,
    });
  }
  const duplicatePermission = records.find(
    ({ id }) => id === "grammar-verb-temoii",
  );
  const canonicalPermission = records.find(
    ({ id }) => id === "grammar-temoii",
  );
  if (duplicatePermission && canonicalPermission) {
    canonicalPermission.alternatePatterns = [
      ...new Set([
        ...canonicalPermission.alternatePatterns,
        duplicatePermission.pattern,
        ...duplicatePermission.alternatePatterns,
      ]),
    ].sort((left, right) => left.localeCompare(right, "ja"));
    duplicates.push({
      type: "grammar-pattern",
      pattern: duplicatePermission.pattern,
      sourceRow: duplicatePermission.sources[0]?.sourceRecordId,
      chosenId: canonicalPermission.id,
      mergedId: duplicatePermission.id,
      resolution: "same-permission-pattern-merged",
    });
    records.splice(records.indexOf(duplicatePermission), 1);
  }

  const idByPattern = new Map<string, string[]>();
  for (const record of records) {
    idByPattern.set(record.pattern, [...(idByPattern.get(record.pattern) ?? []), record.id]);
  }
  for (const record of records) {
    record.relatedGrammarIds = (idByPattern.get(record.pattern) ?? []).filter(
      (id) => id !== record.id,
    );
  }
  records.sort((left, right) => left.id.localeCompare(right.id, "ja"));
  const n5: LegacyN5GrammarRecord[] = records;
  const n4: ReviewedN4GrammarRecord[] = [...reviewedN4];
  const lowConfidence = n5.map((record) => ({
    type: "grammar",
    id: record.id,
    confidence: record.confidence,
    reason: "Pattern/level mapped, but original JapanGo explanation and formation review are pending.",
  }));
  const artifacts: GrammarMergeArtifacts = {
    n5,
    n4,
    unmatched: [],
    duplicates,
    lowConfidence,
  };
  await writeJson(`${CACHE_ROOT}/merged/grammar.json`, { n5, n4 });
  return artifacts;
}
