import { CACHE_ROOT } from "./config";
import { writeJson } from "./lib/fs-utils";
import { kanjiId } from "./lib/text-utils";
import { canonicalKanjiUnicode, legacyJlptLevel } from "./normalize-kanji";
import type { KanjiRecord } from "./schemas/content-schemas";
import type {
  JlptKanjiCandidate,
  KanjidicEntry,
  KanjiVgEntry,
} from "./types";

export interface KanjiMergeArtifacts {
  n5: KanjiRecord[];
  n4: KanjiRecord[];
  components: Array<{ id: string; character: string; kanjiIds: string[] }>;
  unmatched: unknown[];
  levelConflicts: unknown[];
  lowConfidence: unknown[];
  missingReferences: unknown[];
}

export async function mergeKanji(
  mappings: readonly JlptKanjiCandidate[],
  kanjidic: ReadonlyMap<string, KanjidicEntry>,
  kanjiVg: ReadonlyMap<string, KanjiVgEntry>,
): Promise<KanjiMergeArtifacts> {
  const artifacts: KanjiMergeArtifacts = {
    n5: [],
    n4: [],
    components: [],
    unmatched: [],
    levelConflicts: [],
    lowConfidence: [],
    missingReferences: [],
  };
  const componentMembers = new Map<string, string[]>();

  for (const mapping of mappings) {
    const canonical = kanjidic.get(mapping.character);
    if (!canonical) {
      artifacts.unmatched.push({
        character: mapping.character,
        level: mapping.level,
        reason: "No KANJIDIC2 character record.",
      });
      continue;
    }
    if (canonical.meanings.length === 0 || canonical.strokeCount === null) {
      artifacts.missingReferences.push({
        character: mapping.character,
        sourceId: "kanjidic2",
        reason: "Required KANJIDIC2 meaning or stroke count missing.",
      });
      continue;
    }
    const phase9AuditCandidate = mapping.sourceMetadata.phase9AuditCandidate === true;
    const phase9EditorialApproved = mapping.sourceMetadata.editorialApproved === true;
    const legacy = legacyJlptLevel(canonical);
    const conflicts = legacy && legacy !== mapping.level
      ? [`Dedicated mapping ${mapping.level}; legacy KANJIDIC2 mapping ${legacy}.`]
      : [];
    if (conflicts.length > 0) {
      artifacts.levelConflicts.push({
        type: "kanji",
        identity: mapping.character,
        candidateLevels: [mapping.level, legacy],
        supportingSources: ["jlpt-kanji", "kanjidic2-legacy"],
        chosenLevel: mapping.level,
        resolutionRule: "Dedicated JLPT mapping overrides legacy KANJIDIC2 metadata.",
        confidence: 0.9,
        needsReview: true,
      });
    }
    const vg = kanjiVg.get(mapping.character);
    if (!vg) {
      artifacts.missingReferences.push({
        character: mapping.character,
        sourceId: "kanjivg",
        reason: "No canonical unsuffixed KanjiVG SVG was found.",
      });
    }
    const id = kanjiId(mapping.character);
    const record: KanjiRecord = {
      id,
      character: mapping.character,
      unicode: canonicalKanjiUnicode(mapping.character),
      meanings: canonical.meanings,
      readings: {
        on: canonical.onReadings,
        kun: canonical.kunReadings,
        nanori: canonical.nanori,
      },
      strokeCount: canonical.strokeCount,
      radicals: canonical.radicals,
      components: vg?.components ?? [],
      grade: canonical.grade,
      frequencyRank: canonical.frequencyRank,
      jlpt: {
        level: mapping.level,
        confidence: phase9EditorialApproved ? 0.95 : phase9AuditCandidate ? 0.85 : conflicts.length > 0 ? 0.9 : 0.98,
        sources: [{ sourceId: "jlpt-kanji", sourceRecordId: mapping.character }],
        conflicts,
      },
      vocabularyIds: [],
      similarKanjiIds: [],
      textbookReferences: [],
      kanjiVg: {
        svgPath: vg?.svgPath ?? null,
        elementIds: vg?.elementIds ?? [],
        available: Boolean(vg),
      },
      sources: [
        { sourceId: "kanjidic2", sourceRecordId: mapping.character },
        { sourceId: "jlpt-kanji", sourceRecordId: mapping.character },
        ...(vg ? [{ sourceId: "kanjivg", sourceRecordId: vg.svgPath }] : []),
      ],
      attribution: [
        "KANJIDIC2 data © Electronic Dictionary Research and Development Group, CC BY-SA 4.0.",
        ...(vg
          ? ["KanjiVG © Ulrich Apel and contributors, CC BY-SA 3.0."]
          : []),
      ],
      confidence: phase9EditorialApproved ? 0.95 : phase9AuditCandidate ? 0.85 : conflicts.length > 0 ? 0.9 : 0.98,
      needsReview: (!phase9EditorialApproved && phase9AuditCandidate) || conflicts.length > 0,
      releaseReady: phase9EditorialApproved && conflicts.length === 0 || !phase9AuditCandidate && conflicts.length === 0,
    };
    for (const component of record.components) {
      componentMembers.set(component, [...(componentMembers.get(component) ?? []), id]);
    }
    (mapping.level === "N5" ? artifacts.n5 : artifacts.n4).push(record);
  }

  for (const records of [artifacts.n5, artifacts.n4]) {
    records.sort((left, right) => left.id.localeCompare(right.id, "ja"));
  }
  artifacts.components = [...componentMembers.entries()]
    .map(([character, kanjiIds]) => ({
      id: `component-${canonicalKanjiUnicode(character).slice(2)}`,
      character,
      kanjiIds: [...new Set(kanjiIds)].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  await writeJson(`${CACHE_ROOT}/merged/kanji.json`, {
    n5: artifacts.n5,
    n4: artifacts.n4,
    components: artifacts.components,
  });
  return artifacts;
}
