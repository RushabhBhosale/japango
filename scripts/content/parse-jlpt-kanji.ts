import { CACHE_ROOT, SOURCE_PATHS } from "./config";
import { readJson, writeJson } from "./lib/fs-utils";
import { isSingleKanji } from "./lib/text-utils";
import type { JlptKanjiCandidate, TargetLevel } from "./types";

interface RawJlptKanjiEntry extends Record<string, unknown> {
  jlpt?: unknown;
}

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
  output.sort((left, right) => left.character.localeCompare(right.character, "ja"));
  await writeJson(`${CACHE_ROOT}/normalized/jlpt-kanji.json`, output);
  return output;
}

