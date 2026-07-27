import path from "node:path";

import { OUTPUT_ROOT } from "./config";
import { sha256Text, writeJson, writeText } from "./lib/fs-utils";
import type { OcrCurriculumCandidate } from "./extract-textbook-curriculum";
import {
  lessonWindowForPage,
  TEXTBOOK_PROFILES,
  textbookProfileForFile,
} from "./textbook-profiles";

export type TextbookOcrConflictType =
  | "OCR noise"
  | "valid unmatched vocabulary"
  | "ambiguous JMdict match"
  | "grammar candidate"
  | "kanji candidate"
  | "lesson-heading candidate"
  | "duplicate occurrence"
  | "formatting artifact"
  | "page-order problem";

interface PageRange {
  start: number;
  end: number;
}

export interface UniqueTextbookConflict {
  id: string;
  sourceBook: string;
  sourceFile: string;
  normalizedCandidate: string;
  lesson: number;
  pageRanges: PageRange[];
  conflictType: Exclude<TextbookOcrConflictType, "duplicate occurrence">;
  matchedIds: string[];
  occurrenceCount: number;
  duplicateOccurrenceCount: number;
  affectsCurriculumBand: boolean;
}

type PrimaryConflictType = UniqueTextbookConflict["conflictType"];

const LOW_INFORMATION_PARTICLES = new Set(["が", "か", "で", "と", "の"]);

function isOcrConflict(value: unknown): value is OcrCurriculumCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OcrCurriculumCandidate>;
  return (
    typeof candidate.sourceFile === "string" &&
    typeof candidate.pageNumber === "number" &&
    typeof candidate.detectedLesson === "number" &&
    typeof candidate.normalizedCandidate === "string" &&
    Array.isArray(candidate.matchedIds)
  );
}

function primaryType(candidate: OcrCurriculumCandidate): PrimaryConflictType {
  if (LOW_INFORMATION_PARTICLES.has(candidate.normalizedCandidate)) {
    return "formatting artifact";
  }
  if (candidate.matchedIds.some((id) => id.startsWith("grammar-"))) {
    return "grammar candidate";
  }
  if (candidate.matchedIds.some((id) => id.startsWith("kanji-"))) {
    return "kanji candidate";
  }
  if (
    candidate.matchedIds.length > 1 &&
    candidate.matchedIds.every((id) => id.startsWith("vocab-"))
  ) {
    return "ambiguous JMdict match";
  }
  return "OCR noise";
}

function contiguousRanges(pages: readonly number[]): PageRange[] {
  const sorted = [...new Set(pages)].sort((left, right) => left - right);
  const ranges: PageRange[] = [];
  for (const page of sorted) {
    const previous = ranges.at(-1);
    if (previous && page === previous.end + 1) {
      previous.end = page;
    } else {
      ranges.push({ start: page, end: page });
    }
  }
  return ranges;
}

function inExpectedLesson(candidate: OcrCurriculumCandidate): boolean {
  const profile = textbookProfileForFile(candidate.sourceFile);
  const window = profile
    ? lessonWindowForPage(profile, candidate.pageNumber)
    : null;
  return window?.lesson === candidate.detectedLesson;
}

function countBy<T>(values: readonly T[], key: (value: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = key(value);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

function markdownTable(headers: readonly string[], rows: readonly string[][]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

export async function analyzeTextbookConflicts(
  rawValues: readonly unknown[],
): Promise<{ unique: UniqueTextbookConflict[]; reviewQueueSize: number }> {
  const raw = rawValues.filter(isOcrConflict);
  const groups = new Map<
    string,
    { type: PrimaryConflictType; values: OcrCurriculumCandidate[] }
  >();
  for (const conflict of raw) {
    const type = primaryType(conflict);
    const key = [
      conflict.sourceFile,
      conflict.normalizedCandidate,
      conflict.detectedLesson,
      type,
    ].join("\u0000");
    const existing = groups.get(key);
    if (existing) existing.values.push(conflict);
    else groups.set(key, { type, values: [conflict] });
  }

  const unique = [...groups.values()]
    .map(({ type, values }): UniqueTextbookConflict => {
      const first = values[0];
      const profile = textbookProfileForFile(first.sourceFile);
      const matchedIds = [...new Set(values.flatMap(({ matchedIds: ids }) => ids))].sort();
      const identity = [
        first.sourceFile,
        first.normalizedCandidate,
        first.detectedLesson,
        type,
      ].join("|");
      return {
        id: `ocr-conflict-${sha256Text(identity).slice(0, 12)}`,
        sourceBook: profile?.sourceBook ?? first.sourceFile,
        sourceFile: first.sourceFile,
        normalizedCandidate: first.normalizedCandidate,
        lesson: first.detectedLesson,
        pageRanges: contiguousRanges(values.map(({ pageNumber }) => pageNumber)),
        conflictType: type,
        matchedIds,
        occurrenceCount: values.length,
        duplicateOccurrenceCount: Math.max(0, values.length - 1),
        affectsCurriculumBand: values.some(inExpectedLesson),
      };
    })
    .sort(
      (left, right) =>
        left.sourceFile.localeCompare(right.sourceFile) ||
        left.lesson - right.lesson ||
        left.normalizedCandidate.localeCompare(right.normalizedCandidate, "ja") ||
        left.conflictType.localeCompare(right.conflictType),
    );

  const identityQueue = unique
    .filter(
      (conflict) =>
        conflict.affectsCurriculumBand &&
        (conflict.conflictType === "ambiguous JMdict match" ||
          (conflict.conflictType === "grammar candidate" &&
            /-grammer\.pdf$/u.test(conflict.sourceFile))),
    )
    .map((conflict) => ({
      priority:
        conflict.conflictType === "ambiguous JMdict match" ? "P1" : "P2",
      reason:
        conflict.conflictType === "ambiguous JMdict match"
          ? "Resolve canonical vocabulary identity within a bounded lesson."
          : "Resolve grammar identity in a dedicated grammar-reference section.",
      ...conflict,
    }));
  const headingQueue = TEXTBOOK_PROFILES.flatMap((profile) =>
    profile.lessonAnchors
      .filter(({ headingStatus }) => headingStatus === "inferred")
      .map((anchor) => ({
        id: `lesson-heading-${sha256Text(`${profile.sourceFile}|${anchor.lesson}|${anchor.startPage}`).slice(0, 12)}`,
        priority: "P0",
        reason:
          "Lesson heading is OCR-damaged; page cadence and adjacent headings establish the provisional boundary.",
        sourceBook: profile.sourceBook,
        sourceFile: profile.sourceFile,
        normalizedCandidate: `lesson-${anchor.lesson}`,
        lesson: anchor.lesson,
        pageRanges: [{ start: anchor.startPage, end: anchor.startPage }],
        conflictType: "lesson-heading candidate" as const,
        matchedIds: [],
        occurrenceCount: 1,
        duplicateOccurrenceCount: 0,
        affectsCurriculumBand: true,
      })),
  );
  const reviewQueue = [...headingQueue, ...identityQueue].sort(
    (left, right) =>
      left.priority.localeCompare(right.priority) ||
      left.sourceFile.localeCompare(right.sourceFile) ||
      left.lesson - right.lesson ||
      left.normalizedCandidate.localeCompare(right.normalizedCandidate, "ja"),
  );
  await writeJson(
    path.join(OUTPUT_ROOT, "reports/textbook-ocr-review-queue.json"),
    reviewQueue,
  );

  const primaryTypes: PrimaryConflictType[] = [
    "OCR noise",
    "valid unmatched vocabulary",
    "ambiguous JMdict match",
    "grammar candidate",
    "kanji candidate",
    "lesson-heading candidate",
    "formatting artifact",
    "page-order problem",
  ];
  const rawCounts = countBy(raw, (conflict) => primaryType(conflict));
  const uniqueCounts = countBy(unique, ({ conflictType }) => conflictType);
  const duplicateRawCount = unique.reduce(
    (total, conflict) => total + conflict.duplicateOccurrenceCount,
    0,
  );
  const duplicateGroupCount = unique.filter(
    ({ duplicateOccurrenceCount }) => duplicateOccurrenceCount > 0,
  ).length;
  const typeRows = [
    ...primaryTypes.map((type) => [
      type,
      String(rawCounts.get(type) ?? 0),
      String(uniqueCounts.get(type) ?? 0),
    ]),
    ["duplicate occurrence (secondary)", String(duplicateRawCount), String(duplicateGroupCount)],
  ];
  const rawByBook = countBy(raw, ({ sourceFile }) => sourceFile);
  const uniqueByBook = countBy(unique, ({ sourceFile }) => sourceFile);
  const bookRows = TEXTBOOK_PROFILES.map((profile) => [
    profile.sourceBook,
    String(rawByBook.get(profile.sourceFile) ?? 0),
    String(uniqueByBook.get(profile.sourceFile) ?? 0),
  ]);
  const report = `# Textbook OCR conflict cleanup

## Scope and semantics

The supplied raw file contains ${raw.length.toLocaleString("en-US")} ambiguous canonical matches. It does **not** contain all OCR tokens: the original extractor discarded zero-match tokens before reporting. Consequently OCR noise, valid unmatched vocabulary, unique kanji, lesson headings, and page-order transitions cannot be measured from this raw conflict file and are reported as zero primary conflicts rather than fabricated classifications.

The earlier “matched/total” figures measured unambiguous versus ambiguous canonical-hit occurrences, not OCR match coverage. The cleaned lesson map now uses a reviewed page-anchor manifest instead of the unsafe carry-forward lesson regex.

## Deduplication result

- Total raw conflicts: ${raw.length.toLocaleString("en-US")}
- Unique conflicts after source + normalized candidate + lesson + conflict-type deduplication: ${unique.length.toLocaleString("en-US")}
- Later duplicate occurrences collapsed: ${duplicateRawCount.toLocaleString("en-US")}
- Unique groups with repeated occurrences: ${duplicateGroupCount.toLocaleString("en-US")}
- Reduced manual review queue: ${reviewQueue.length.toLocaleString("en-US")}
- Low-value formatting/noise groups excluded: ${(uniqueCounts.get("formatting artifact") ?? 0).toLocaleString("en-US")} unique / ${(rawCounts.get("formatting artifact") ?? 0).toLocaleString("en-US")} raw

Pages for each unique key are aggregated into contiguous page ranges; page ranges are metadata, not separate identities.

## Counts by conflict type

${markdownTable(["Conflict type", "Raw", "Unique"], typeRows)}

“Duplicate occurrence” is a secondary classification and therefore overlaps the primary rows.

## Counts by book

${markdownTable(["Book", "Raw", "Unique"], bookRows)}

## High-priority review set

The queue contains inferred/damaged lesson headings first (P0), useful vocabulary-only identity ambiguities within a bounded lesson second (P1), and non-particle grammar ambiguities from the dedicated Minna grammar references third (P2). Repeated bare particles, preface/index hits, textbook-body grammar repetitions, and formatting artifacts are excluded.

The map records OCR token occurrences, not verified first-introduction placements. Repeated canonical IDs must not be interpreted as textbook assignments without editorial review.

## Recommended review order

1. Confirm P0 lesson headings and page boundaries because they affect every downstream placement.
2. Resolve P1 JMdict identity choices before vocabulary sequencing or SQLite transformation.
3. Review P2 grammar identities alongside the OCR-only N4 heading candidate report.
4. Revisit textbook-body grammar occurrences only when a specific curriculum decision requires them.
5. Ignore low-information particle repetitions unless a targeted page review provides syntax context.
`;
  await writeText(
    path.join(OUTPUT_ROOT, "reports/textbook-ocr-conflicts-summary.md"),
    report,
  );
  return { unique, reviewQueueSize: reviewQueue.length };
}
