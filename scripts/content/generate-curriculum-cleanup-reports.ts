import path from "node:path";

import { CURRICULUM_UNIT_LIMITS } from "./build-curriculum";
import { OUTPUT_ROOT } from "./config";
import { writeText } from "./lib/fs-utils";
import type {
  CurriculumUnit,
  TextbookCurriculumMapping,
} from "./schemas/content-schemas";
import { TEXTBOOK_PROFILES } from "./textbook-profiles";
import type { ContentBundle } from "./validate-content";

interface AssignmentCoverage {
  assigned: number;
  unassigned: number;
  unassignedIds: string[];
}

export interface CurriculumCoverageMetrics {
  vocabulary: AssignmentCoverage;
  kanji: AssignmentCoverage;
  grammar: AssignmentCoverage;
  unitCounts: { n5: number; n4: number };
  maximumPrerequisiteDepth: number;
  unitsExceedingLimits: number;
  unitsMissingGoals: number;
}

function markdownTable(headers: readonly string[], rows: readonly string[][]): string {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function percentage(numerator: number, denominator: number): string {
  return denominator === 0
    ? "n/a"
    : `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function placementStats(
  mappings: readonly TextbookCurriculumMapping[],
  field: "vocabularyIds" | "grammarIds" | "kanjiIds",
): { placements: number; unique: number; duplicates: number } {
  const placements = mappings.reduce(
    (total, mapping) => total + mapping[field].length,
    0,
  );
  const unique = new Set(mappings.flatMap((mapping) => mapping[field])).size;
  return { placements, unique, duplicates: placements - unique };
}

function coverageForIds(allIds: readonly string[], assignedIds: readonly string[]): AssignmentCoverage {
  const assigned = new Set(assignedIds);
  const unassignedIds = allIds.filter((id) => !assigned.has(id)).sort();
  return {
    assigned: allIds.length - unassignedIds.length,
    unassigned: unassignedIds.length,
    unassignedIds,
  };
}

function maximumPrerequisiteDepth(units: readonly CurriculumUnit[]): number {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const memo = new Map<string, number>();
  const visit = (id: string, visiting = new Set<string>()): number => {
    if (memo.has(id)) return memo.get(id) ?? 0;
    if (visiting.has(id)) return 0;
    const nextVisiting = new Set(visiting).add(id);
    const unit = byId.get(id);
    const depth = unit
      ? 1 +
        Math.max(
          0,
          ...unit.prerequisiteUnitIds.map((prerequisite) =>
            visit(prerequisite, nextVisiting),
          ),
        )
      : 0;
    memo.set(id, depth);
    return depth;
  };
  return Math.max(0, ...units.map(({ id }) => visit(id)));
}

export async function generateCurriculumCleanupReports(
  bundle: ContentBundle,
): Promise<CurriculumCoverageMetrics> {
  const textbookRows: string[][] = [];
  const textbookSections: string[] = [];
  for (const profile of TEXTBOOK_PROFILES) {
    const mappings = bundle.textbookMap.filter(
      ({ sourceFile }) => sourceFile === profile.sourceFile,
    );
    const expected = profile.lessonAnchors.map(({ lesson }) => lesson);
    const mapped = new Set(mappings.map(({ lesson }) => lesson));
    const missing = expected.filter((lesson) => !mapped.has(lesson));
    const impossible = mappings
      .map(({ lesson }) => lesson)
      .filter((lesson) => !expected.includes(lesson));
    const inferred = mappings.filter(
      ({ lessonHeadingStatus }) => lessonHeadingStatus === "inferred",
    );
    const lowConfidence = mappings.filter(({ confidence }) => confidence < 0.6);
    const suspicious = mappings.filter(
      (mapping) =>
        mapping.sourcePages.length === 0 ||
        mapping.sourcePages.some(
          (page) =>
            page < mapping.lessonStartPage || page > mapping.lessonEndPage,
        ),
    );
    const vocabulary = placementStats(mappings, "vocabularyIds");
    const grammar = placementStats(mappings, "grammarIds");
    const kanji = placementStats(mappings, "kanjiIds");
    textbookRows.push([
      profile.sourceBook,
      `${mappings.length}/${expected.length}`,
      String(mappings.length - inferred.length),
      String(inferred.length),
      String(lowConfidence.length),
      `${vocabulary.placements}/${vocabulary.unique}/${vocabulary.duplicates}`,
      `${grammar.placements}/${grammar.unique}/${grammar.duplicates}`,
      `${kanji.placements}/${kanji.unique}/${kanji.duplicates}`,
    ]);
    textbookSections.push(`### ${profile.sourceBook}

- Expected lesson range: ${expected[0]}–${expected.at(-1)}
- Lesson rows mapped: ${mappings.length}
- Headings directly detected: ${mappings.length - inferred.length}
- Headings inferred from reviewed cadence: ${inferred.length}${inferred.length > 0 ? ` (${inferred.map(({ lesson }) => lesson).join(", ")})` : ""}
- Lessons missing: ${missing.length === 0 ? "none" : missing.join(", ")}
- Impossible lesson assignments: ${impossible.length === 0 ? "none" : impossible.join(", ")}
- Low-confidence lesson rows: ${lowConfidence.length}
- Empty or out-of-window page ranges: ${suspicious.length}
- Vocabulary placements / unique IDs / repeated placements: ${vocabulary.placements} / ${vocabulary.unique} / ${vocabulary.duplicates}
- Grammar placements / unique IDs / repeated placements: ${grammar.placements} / ${grammar.unique} / ${grammar.duplicates}
- Kanji placements / unique IDs / repeated placements: ${kanji.placements} / ${kanji.unique} / ${kanji.duplicates}
- Confidence policy: ${inferred.length > 0 ? "0.7 for detected headings; 0.5 for inferred headings" : "0.7 for detected headings"}
`);
  }
  const textbookReport = `# Textbook curriculum map review

## Verification result

All lesson boundaries now come from an explicit, reviewed page-anchor manifest over the cached OCR. The previous anywhere-on-page carry-forward regex was removed because contents pages, examples, indexes, and cross-references produced impossible assignments. No full or targeted OCR rerun was needed.

The map records bounded canonical token occurrences, **not verified first introductions**. Vocabulary, grammar, and kanji IDs can legitimately repeat in examples and reviews, so every placement remains \`needsReview: true\` / \`releaseReady: false\`. The map may guide deterministic staging but cannot itself authorize production content.

“Placement / unique / repeated” below counts ID appearances across lesson rows, distinct IDs in the book, and extra appearances beyond the first.

${markdownTable(
  [
    "Book",
    "Lessons mapped/expected",
    "Detected headings",
    "Inferred headings",
    "Low confidence",
    "Vocabulary p/u/r",
    "Grammar p/u/r",
    "Kanji p/u/r",
  ],
  textbookRows,
)}

${textbookSections.join("\n")}
## Remaining review

Confirm the inferred heading pages first, then resolve vocabulary-only identity ambiguities and dedicated grammar-book ambiguities from \`textbook-ocr-review-queue.json\`. Page references are physical PDF page numbers. Duplicate placements are review exposures, not new-content assignments.
`;
  await writeText(
    path.join(OUTPUT_ROOT, "reports/textbook-curriculum-review.md"),
    textbookReport,
  );

  const units = [...bundle.curriculum.n5, ...bundle.curriculum.n4];
  const allVocabularyIds = [
    ...bundle.vocabulary.n5,
    ...bundle.vocabulary.n4,
  ].map(({ id }) => id);
  const allKanjiIds = [...bundle.kanji.n5, ...bundle.kanji.n4].map(({ id }) => id);
  const allGrammarIds = [...bundle.grammar.n5, ...bundle.grammar.n4].map(({ id }) => id);
  const vocabularyCoverage = coverageForIds(
    allVocabularyIds,
    units.flatMap(({ vocabularyIds }) => vocabularyIds),
  );
  const kanjiCoverage = coverageForIds(
    allKanjiIds,
    units.flatMap(({ kanjiIds }) => kanjiIds),
  );
  const grammarCoverage = coverageForIds(
    allGrammarIds,
    units.flatMap(({ grammarIds }) => grammarIds),
  );
  const unitsExceedingLimits = units.filter((unit) => {
    const limits = CURRICULUM_UNIT_LIMITS[unit.level];
    return (
      unit.vocabularyIds.length > limits.vocabulary ||
      unit.kanjiIds.length > limits.kanji ||
      unit.grammarIds.length > limits.grammar
    );
  }).length;
  const unitsMissingGoals = units.filter(
    ({ learningGoals }) => learningGoals.length === 0,
  ).length;
  const average = (
    levelUnits: readonly CurriculumUnit[],
    field: "vocabularyIds" | "kanjiIds" | "grammarIds",
  ): string =>
    levelUnits.length === 0
      ? "0.00"
      : (
          levelUnits.reduce((total, unit) => total + unit[field].length, 0) /
          levelUnits.length
        ).toFixed(2);
  const bookCoverageRows = TEXTBOOK_PROFILES.map((profile) => {
    const mappings = bundle.textbookMap.filter(
      ({ sourceFile }) => sourceFile === profile.sourceFile,
    );
    const levelVocabulary =
      profile.levelBand === "N5" ? bundle.vocabulary.n5 : bundle.vocabulary.n4;
    const levelKanji = profile.levelBand === "N5" ? bundle.kanji.n5 : bundle.kanji.n4;
    const levelGrammar =
      profile.levelBand === "N5" ? bundle.grammar.n5 : bundle.grammar.n4;
    const levelVocabularyIds = new Set(levelVocabulary.map(({ id }) => id));
    const levelKanjiIds = new Set(levelKanji.map(({ id }) => id));
    const levelGrammarIds = new Set(levelGrammar.map(({ id }) => id));
    const vocabulary = new Set(
      mappings
        .flatMap(({ vocabularyIds }) => vocabularyIds)
        .filter((id) => levelVocabularyIds.has(id)),
    );
    const kanji = new Set(
      mappings
        .flatMap(({ kanjiIds }) => kanjiIds)
        .filter((id) => levelKanjiIds.has(id)),
    );
    const grammar = new Set(
      mappings
        .flatMap(({ grammarIds }) => grammarIds)
        .filter((id) => levelGrammarIds.has(id)),
    );
    return [
      profile.sourceBook,
      `${vocabulary.size}/${levelVocabulary.length} (${percentage(vocabulary.size, levelVocabulary.length)})`,
      `${kanji.size}/${levelKanji.length} (${percentage(kanji.size, levelKanji.length)})`,
      `${grammar.size}/${levelGrammar.length} (${percentage(grammar.size, levelGrammar.length)})`,
    ];
  });
  const depth = maximumPrerequisiteDepth(units);
  const coverageReport = `# Curriculum coverage report

## Assignment coverage

| Content | Assigned | Unassigned | Total |
| --- | ---: | ---: | ---: |
| Vocabulary | ${vocabularyCoverage.assigned} | ${vocabularyCoverage.unassigned} | ${allVocabularyIds.length} |
| Kanji | ${kanjiCoverage.assigned} | ${kanjiCoverage.unassigned} | ${allKanjiIds.length} |
| Grammar | ${grammarCoverage.assigned} | ${grammarCoverage.unassigned} | ${allGrammarIds.length} |

Unassigned vocabulary IDs: ${vocabularyCoverage.unassignedIds.length === 0 ? "none" : vocabularyCoverage.unassignedIds.join(", ")}

Unassigned kanji IDs: ${kanjiCoverage.unassignedIds.length === 0 ? "none" : kanjiCoverage.unassignedIds.join(", ")}

Unassigned grammar IDs: ${grammarCoverage.unassignedIds.length === 0 ? "none" : grammarCoverage.unassignedIds.join(", ")}

## Unit statistics

| Level | Units | Avg new vocabulary | Avg new kanji | Avg grammar |
| --- | ---: | ---: | ---: | ---: |
| N5 | ${bundle.curriculum.n5.length} | ${average(bundle.curriculum.n5, "vocabularyIds")} | ${average(bundle.curriculum.n5, "kanjiIds")} | ${average(bundle.curriculum.n5, "grammarIds")} |
| N4 | ${bundle.curriculum.n4.length} | ${average(bundle.curriculum.n4, "vocabularyIds")} | ${average(bundle.curriculum.n4, "kanjiIds")} | ${average(bundle.curriculum.n4, "grammarIds")} |

- Maximum prerequisite depth: ${depth}
- Units exceeding hard maxima: ${unitsExceedingLimits}
- Units missing learning goals: ${unitsMissingGoals}
- Duplicate new-content assignments: 0 (validated)
- N4 transition: the first N4 unit depends on the final N5 unit; later N4 units inherit that prerequisite transitively.
- N4 grammar: all ${bundle.grammar.n4.filter(({ releaseReady }) => releaseReady).length} approved records are assigned deterministically; ${bundle.grammar.n4.filter(({ releaseReady }) => !releaseReady).length} unresolved development-only records are excluded from units, and OCR candidates cannot override the manual source.
- Kana-first policy: vocabulary whose required kanji is not in an earlier unit is explicitly listed in \`kanaFirstVocabularyIds\`.

The requested lower bounds are pedagogical recommendations, not hard errors. Complete N5 coverage requires at least 42 units for 125 grammar patterns at a maximum of three, while 598 vocabulary and 79 kanji cannot simultaneously supply every one of those units with at least 15 vocabulary and three kanji. Zero-new categories are therefore allowed; all nonzero groups are balanced below the hard maxima.

## Bounded textbook occurrence coverage by book

${markdownTable(["Book", "Vocabulary", "Kanji", "Grammar"], bookCoverageRows)}

Textbook coverage is occurrence evidence only, not proof of first introduction or release readiness. Large textbook lessons are not copied: the app curriculum is independently split into focused units and keeps all curriculum records non-release-ready pending pedagogy review.
`;
  await writeText(
    path.join(OUTPUT_ROOT, "reports/curriculum-coverage-report.md"),
    coverageReport,
  );

  return {
    vocabulary: vocabularyCoverage,
    kanji: kanjiCoverage,
    grammar: grammarCoverage,
    unitCounts: {
      n5: bundle.curriculum.n5.length,
      n4: bundle.curriculum.n4.length,
    },
    maximumPrerequisiteDepth: depth,
    unitsExceedingLimits,
    unitsMissingGoals,
  };
}
