import { readFile } from "node:fs/promises";

import { CACHE_ROOT, SOURCE_PATHS } from "./config";
import { parseCsv, rowsToObjects } from "./lib/csv";
import { writeJson } from "./lib/fs-utils";
import { normalizeJapaneseForm, normalizeKana } from "./lib/text-utils";
import { z } from "zod";
import type { JlptVocabularyCandidate, TargetLevel } from "./types";

const phase96VocabularySupportSchema = z.object({
  schemaVersion: z.literal(1),
  vocabulary: z.array(z.object({
    written: z.string().min(1),
    reading: z.string().min(1),
    englishHint: z.string().min(1),
  }).strict()),
}).strict();

const phase10VocabularyExpansionSchema = z.object({
  schemaVersion: z.literal(1),
  evidence: z.object({
    policy: z.string().min(1),
    referenceIds: z.array(z.string().min(1)).min(2),
  }).strict(),
  records: z.array(
    z.tuple([
      z.string().min(1),
      z.string().min(1),
      z.string().min(1),
      z.enum(["N5", "N4"]),
    ]),
  ),
}).strict();

export async function parseJlptVocabulary(): Promise<
  JlptVocabularyCandidate[]
> {
  const [csv, phase96Raw, phase10Raw] = await Promise.all([
    readFile(SOURCE_PATHS.jlptVocabulary, "utf8"),
    SOURCE_PATHS.phase96KanjiVocabularySupport
      ? readFile(SOURCE_PATHS.phase96KanjiVocabularySupport, "utf8")
      : Promise.resolve('{"schemaVersion":1,"vocabulary":[]}'),
    SOURCE_PATHS.phase10VocabularyExpansion
      ? readFile(SOURCE_PATHS.phase10VocabularyExpansion, "utf8")
      : Promise.resolve('{"schemaVersion":1,"evidence":{"policy":"fixture","referenceIds":["fixture-a","fixture-b"]},"records":[]}'),
  ]);
  const rows = rowsToObjects(
    parseCsv(csv.replace(/^\uFEFF/u, "")),
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
  const phase96 = phase96VocabularySupportSchema.parse(JSON.parse(phase96Raw)).vocabulary.map((record, index) => ({
    sourceRow: index + 1,
    sourceId: "japango-phase96-kanji-vocabulary-support",
    written: normalizeJapaneseForm(record.written),
    reading: normalizeKana(record.reading),
    englishHint: record.englishHint,
    level: "N4" as TargetLevel,
  }));
  const phase10 = phase10VocabularyExpansionSchema.parse(JSON.parse(phase10Raw));
  const phase10Candidates = phase10.records.map(([written, reading, englishHint, level], index) => ({
    sourceRow: index + 1,
    sourceId: "japango-phase10-vocabulary-expansion",
    supportingSourceIds: phase10.evidence.referenceIds,
    written: normalizeJapaneseForm(written),
    reading: normalizeKana(reading),
    englishHint,
    level,
  }));
  candidates.push(...phase96, ...phase10Candidates);
  candidates.sort((left, right) =>
    left.level.localeCompare(right.level) ||
    left.written.localeCompare(right.written, "ja") ||
    left.reading.localeCompare(right.reading, "ja") ||
    left.sourceRow - right.sourceRow,
  );
  await writeJson(`${CACHE_ROOT}/normalized/jlpt-vocabulary.json`, candidates);
  return candidates;
}
