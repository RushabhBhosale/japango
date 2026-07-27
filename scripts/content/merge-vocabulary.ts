import { CACHE_ROOT } from "./config";
import { writeJson } from "./lib/fs-utils";
import {
  extractKanji,
  kanaToRomaji,
  kanjiId,
  vocabularyBaseId,
} from "./lib/text-utils";
import {
  conjugationClass,
  normalizePartOfSpeech,
  normalizeSense,
  transitivity,
} from "./normalize-vocabulary";
import type { VocabularyRecord } from "./schemas/content-schemas";
import type {
  JlptVocabularyCandidate,
  VocabularyMatchResult,
} from "./types";

export interface VocabularyMergeArtifacts {
  n5: VocabularyRecord[];
  n4: VocabularyRecord[];
  supplemental: VocabularyRecord[];
  unmatched: unknown[];
  ambiguous: unknown[];
  duplicates: unknown[];
  levelConflicts: unknown[];
  lowConfidence: unknown[];
}

function candidateKey(candidate: JlptVocabularyCandidate): string {
  return `${candidate.written}\u0000${candidate.reading}`;
}

function matchConfidence(method: string): number {
  if (method === "exact") return 0.99;
  if (method === "normalized") return 0.96;
  if (method === "kana-only") return 0.94;
  return 0.86;
}

export async function mergeVocabulary(
  results: readonly VocabularyMatchResult[],
  generatedKanji: ReadonlySet<string>,
): Promise<VocabularyMergeArtifacts> {
  const groups = new Map<string, VocabularyMatchResult[]>();
  for (const result of results) {
    const key = candidateKey(result.candidate);
    groups.set(key, [...(groups.get(key) ?? []), result]);
  }

  const artifacts: VocabularyMergeArtifacts = {
    n5: [],
    n4: [],
    supplemental: [],
    unmatched: [],
    ambiguous: [],
    duplicates: [],
    levelConflicts: [],
    lowConfidence: [],
  };
  const usedIds = new Map<string, number>();

  for (const [key, grouped] of [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right, "ja"),
  )) {
    const levels = [...new Set(grouped.map(({ candidate }) => candidate.level))];
    const sourceRows = grouped.map(({ candidate }) => candidate.sourceRow).sort((a, b) => a - b);
    if (grouped.length > 1) {
      artifacts.duplicates.push({
        type: "vocabulary-mapping",
        identity: key.replace("\u0000", " / "),
        sourceRows,
        resolution: levels.length === 1 ? "deduplicated-identical-level" : "level-conflict",
      });
    }
    if (levels.length > 1) {
      artifacts.levelConflicts.push({
        type: "vocabulary",
        identity: key.replace("\u0000", " / "),
        candidateLevels: levels,
        supportingSources: sourceRows.map((row) => ({ sourceId: "jlpt-vocabulary", row })),
        chosenLevel: "unknown",
        resolutionRule: "Internal mapping disagreement is not guessed; record is supplemental pending review.",
        confidence: 0,
        needsReview: true,
      });
    }

    const representative = [...grouped].sort(
      (left, right) => left.candidate.sourceRow - right.candidate.sourceRow,
    )[0];
    const successful = grouped.filter((result) => result.status === "matched");
    const ambiguous = grouped.filter((result) => result.status === "ambiguous");
    if (ambiguous.length > 0) {
      artifacts.ambiguous.push(...ambiguous);
      continue;
    }
    if (successful.length === 0) {
      artifacts.unmatched.push(...grouped);
      continue;
    }
    const sequences = [...new Set(successful.flatMap((result) => result.matches.map((match) => match.sequence)))];
    if (sequences.length !== 1) {
      artifacts.ambiguous.push({
        candidate: representative.candidate,
        status: "ambiguous",
        sequences,
        reason: "Duplicate JLPT rows resolved to different JMdict sequences.",
      });
      continue;
    }
    const match = successful.flatMap((result) => result.matches)[0];
    const tags = [...new Set(match.senses.flatMap((sense) => sense.tags))];
    const baseId = vocabularyBaseId(
      representative.candidate.written,
      representative.candidate.reading,
    );
    const collisionCount = usedIds.get(baseId) ?? 0;
    usedIds.set(baseId, collisionCount + 1);
    const id = collisionCount === 0 ? baseId : `${baseId}-${match.sequence}`;
    if (collisionCount > 0) {
      artifacts.duplicates.push({
        type: "stable-id-collision",
        baseId,
        chosenId: id,
        resolution: "appended-JMdict-sequence",
      });
    }

    const confidence = levels.length > 1 ? 0 : matchConfidence(match.matchMethod);
    const level = levels.length === 1 ? levels[0] : "unknown";
    const primaryForm = match.written;
    const forms = [primaryForm, ...match.forms.filter((form) => form !== primaryForm)];
    const record: VocabularyRecord = {
      id,
      primaryForm,
      writtenForms: [...new Set(forms)].map((text, index) => ({
        text,
        primary: index === 0,
        common: match.common && index === 0,
        restrictions: [],
      })),
      readings: [
        {
          kana: representative.candidate.reading,
          romaji: kanaToRomaji(representative.candidate.reading),
          primary: true,
          restrictions: [],
        },
      ],
      senses: match.senses.map(normalizeSense),
      partOfSpeech: normalizePartOfSpeech(tags),
      conjugationClass: conjugationClass(tags),
      transitivity: transitivity(tags),
      common: match.common,
      jlpt: {
        level,
        confidence: levels.length === 1 ? 0.99 : 0,
        sources: sourceRows.map((row) => ({
          sourceId: "jlpt-vocabulary",
          sourceRecordId: `row-${row}`,
        })),
        conflicts: levels.length > 1 ? [`Conflicting levels: ${levels.join(", ")}`] : [],
      },
      kanjiIds: extractKanji(primaryForm)
        .filter((character) => generatedKanji.has(character))
        .map(kanjiId),
      relatedVocabularyIds: [],
      confusableVocabularyIds: [],
      topicTags: [],
      textbookReferences: [],
      examples: [],
      sources: [
        { sourceId: "jmdict", sourceRecordId: String(match.sequence) },
        ...sourceRows.map((row) => ({
          sourceId: "jlpt-vocabulary",
          sourceRecordId: `row-${row}`,
        })),
      ],
      attribution: [
        "JMdict data © Electronic Dictionary Research and Development Group, CC BY-SA 4.0.",
      ],
      confidence,
      needsReview: confidence < 0.9 || levels.length > 1,
      releaseReady: confidence >= 0.9 && levels.length === 1,
    };
    if (confidence < 0.9) {
      artifacts.lowConfidence.push({
        type: "vocabulary",
        id,
        confidence,
        reason: match.matchMethod,
      });
    }
    if (level === "N5") artifacts.n5.push(record);
    else if (level === "N4") artifacts.n4.push(record);
    else artifacts.supplemental.push(record);
  }

  for (const records of [artifacts.n5, artifacts.n4, artifacts.supplemental]) {
    records.sort((left, right) => left.id.localeCompare(right.id, "ja"));
  }
  await writeJson(`${CACHE_ROOT}/merged/vocabulary.json`, {
    n5: artifacts.n5,
    n4: artifacts.n4,
    supplemental: artifacts.supplemental,
  });
  return artifacts;
}
