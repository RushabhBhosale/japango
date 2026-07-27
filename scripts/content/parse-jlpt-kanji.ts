import { CACHE_ROOT, SOURCE_PATHS } from "./config";
import { readJson, writeJson } from "./lib/fs-utils";
import { isSingleKanji } from "./lib/text-utils";
import type { JlptKanjiCandidate, TargetLevel } from "./types";

interface RawJlptKanjiEntry extends Record<string, unknown> {
  jlpt?: unknown;
}

interface Phase9KanjiExpansion {
  schemaVersion: 1;
  candidates: Array<{ character: string; level: "N4"; auditStatus: "review-required"; rationale: string }>;
}
interface Phase9EditorialDecisions { approvedKanji: string[]; }

export async function parseJlptKanji(): Promise<JlptKanjiCandidate[]> {
  const raw = await readJson<Record<string, RawJlptKanjiEntry>>(
    SOURCE_PATHS.jlptKanji,
  );
  const output = Object.entries(raw).flatMap(([character, metadata]) => {
    if (!isSingleKanji(character)) {
      return [];
    }
    const numericLevel = metadata.jlpt;
    if (numericLevel !== 5 && numericLevel !== 4) {
      return [];
    }
    return [
      {
        character,
        level: `N${numericLevel}` as TargetLevel,
        sourceMetadata: metadata,
      },
    ];
  });
  const expansionPath = (SOURCE_PATHS as Partial<typeof SOURCE_PATHS>).phase9KanjiExpansion;
  const expansion = expansionPath
    ? await readJson<Phase9KanjiExpansion>(expansionPath)
    : { schemaVersion: 1 as const, candidates: [] };
  const decisionsPath = (SOURCE_PATHS as Partial<typeof SOURCE_PATHS>).phase9EditorialDecisions;
  const decisions = decisionsPath ? await readJson<Phase9EditorialDecisions>(decisionsPath) : { approvedKanji: [] };
  const approvedKanji = new Set(decisions.approvedKanji);
  const known = new Set(output.map(({ character }) => character));
  for (const candidate of expansion.candidates) {
    if (!isSingleKanji(candidate.character) || known.has(candidate.character)) continue;
    output.push({
      character: candidate.character,
      level: candidate.level,
      sourceMetadata: { phase9AuditCandidate: true, auditStatus: candidate.auditStatus, editorialApproved: approvedKanji.has(candidate.character), rationale: candidate.rationale },
    });
  }
  output.sort((left, right) => left.character.localeCompare(right.character, "ja"));
  await writeJson(`${CACHE_ROOT}/normalized/jlpt-kanji.json`, output);
  return output;
}
