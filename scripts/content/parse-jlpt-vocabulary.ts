import { readFile } from "node:fs/promises";

import { CACHE_ROOT, SOURCE_PATHS } from "./config";
import { parseCsv, rowsToObjects } from "./lib/csv";
import { writeJson } from "./lib/fs-utils";
import { normalizeJapaneseForm, normalizeKana } from "./lib/text-utils";
import type { JlptVocabularyCandidate, TargetLevel } from "./types";

export async function parseJlptVocabulary(): Promise<
  JlptVocabularyCandidate[]
> {
  const rows = rowsToObjects(
    parseCsv((await readFile(SOURCE_PATHS.jlptVocabulary, "utf8")).replace(/^\uFEFF/u, "")),
  );
  const candidates = rows.flatMap((row, index) => {
    const level = row["JLPT Level"];
    if (level !== "N5" && level !== "N4") {
      return [];
    }
    const written = normalizeJapaneseForm(row.Original ?? "");
    const reading = normalizeKana(row.Furigana ?? "");
    if (!written) {
      return [];
    }
    return [
      {
        sourceRow: index + 2,
        written,
        reading,
        englishHint: row.English ?? "",
        level: level as TargetLevel,
      },
    ];
  });
  candidates.sort((left, right) =>
    left.level.localeCompare(right.level) ||
    left.written.localeCompare(right.written, "ja") ||
    left.reading.localeCompare(right.reading, "ja") ||
    left.sourceRow - right.sourceRow,
  );
  await writeJson(`${CACHE_ROOT}/normalized/jlpt-vocabulary.json`, candidates);
  return candidates;
}
