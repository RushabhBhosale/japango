import { readFile } from "node:fs/promises";

import { CACHE_ROOT, SOURCE_PATHS } from "./config";
import { parseCsv, rowsToObjects } from "./lib/csv";
import { writeJson } from "./lib/fs-utils";
import { normalizeJapaneseForm } from "./lib/text-utils";
import { reviewedN4GrammarSourceSchema } from "./schemas/content-schemas";
import type { ReviewedN4GrammarRecord } from "./schemas/content-schemas";
import type { GrammarCandidate } from "./types";

export async function parseGrammarSource(): Promise<GrammarCandidate[]> {
  const rows = rowsToObjects(
    parseCsv((await readFile(SOURCE_PATHS.grammar, "utf8")).replace(/^\uFEFF/u, "")),
  );
  const output = rows.flatMap((row, index) => {
    const pattern = normalizeJapaneseForm(row["Grammar Point"] ?? "");
    if (!pattern) {
      return [];
    }
    const parsedOrder = Number.parseInt(row["#"] ?? "", 10);
    return [
      {
        sourceRow: index + 2,
        order: Number.isFinite(parsedOrder) ? parsedOrder : index + 1,
        pattern,
        meaningLabel: row.Meaning ?? "",
        level: "N5" as const,
      },
    ];
  });
  output.sort((left, right) => left.order - right.order || left.pattern.localeCompare(right.pattern, "ja"));
  await writeJson(`${CACHE_ROOT}/normalized/grammar.json`, output);
  return output;
}

export function sortReviewedN4Grammar(
  records: readonly ReviewedN4GrammarRecord[],
): ReviewedN4GrammarRecord[] {
  return [...records].sort(
    (left, right) =>
      left.curriculumOrder - right.curriculumOrder ||
      left.category.localeCompare(right.category, "en") ||
      left.normalizedPattern.localeCompare(right.normalizedPattern, "ja") ||
      left.id.localeCompare(right.id, "en"),
  );
}

export async function parseReviewedN4GrammarSource(): Promise<
  ReviewedN4GrammarRecord[]
> {
  const source = reviewedN4GrammarSourceSchema.parse(
    JSON.parse(await readFile(SOURCE_PATHS.reviewedN4Grammar, "utf8")) as unknown,
  );
  const output = sortReviewedN4Grammar(source.grammar);
  await writeJson(`${CACHE_ROOT}/normalized/grammar-n4-reviewed.json`, output);
  return output;
}
