import path from "node:path";

import { OUTPUT_ROOT, TEXTBOOKS } from "./config";
import { writeJson, writeText } from "./lib/fs-utils";
import type { GrammarMergeArtifacts } from "./merge-grammar";
import type { KanjiMergeArtifacts } from "./merge-kanji";
import type { VocabularyMergeArtifacts } from "./merge-vocabulary";
import type { VocabularyMatchResult } from "./types";
import type { ContentBundle, ValidationResult } from "./validate-content";

export interface ReportArtifacts {
  vocabulary: VocabularyMergeArtifacts;
  kanji: KanjiMergeArtifacts;
  grammar: GrammarMergeArtifacts;
  vocabularyMatches: readonly VocabularyMatchResult[];
  ocrConflicts: readonly unknown[];
  validation: ValidationResult;
}

function percentage(numerator: number, denominator: number): string {
  return denominator === 0 ? "n/a" : `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function compactVocabularyResult(result: VocabularyMatchResult): unknown {
  return {
    candidate: result.candidate,
    status: result.status,
    reason: result.reason,
    candidateSequences: result.matches.map((match) => ({
      sequence: match.sequence,
      matchMethod: match.matchMethod,
      form: match.written,
      reading: match.reading,
    })),
  };
}

export function unresolvedCounts(artifacts: ReportArtifacts): Record<string, number> {
  return {
    unmatchedVocabulary: artifacts.vocabulary.unmatched.length,
    ambiguousVocabulary: artifacts.vocabulary.ambiguous.length,
    unmatchedKanji: artifacts.kanji.unmatched.length,
    unmatchedGrammar: artifacts.grammar.unmatched.length,
    jlptLevelConflicts:
      artifacts.vocabulary.levelConflicts.length + artifacts.kanji.levelConflicts.length,
    textbookOcrConflicts: artifacts.ocrConflicts.length,
    lowConfidence:
      artifacts.vocabulary.lowConfidence.length +
      artifacts.kanji.lowConfidence.length +
      artifacts.grammar.lowConfidence.length,
    missingReferences: artifacts.kanji.missingReferences.length,
    validationErrors: artifacts.validation.errors.length,
    validationWarnings: artifacts.validation.warnings.length,
  };
}

export async function generateReports(
  bundle: ContentBundle,
  artifacts: ReportArtifacts,
): Promise<void> {
  const reports = path.join(OUTPUT_ROOT, "reports");
  const duplicateRecords = [
    ...artifacts.vocabulary.duplicates,
    ...artifacts.grammar.duplicates,
  ];
  const levelConflicts = [
    ...artifacts.vocabulary.levelConflicts,
    ...artifacts.kanji.levelConflicts,
  ];
  const lowConfidence = [
    ...artifacts.vocabulary.lowConfidence,
    ...artifacts.kanji.lowConfidence,
    ...artifacts.grammar.lowConfidence,
  ];
  const missingReferences = [...artifacts.kanji.missingReferences];

  await Promise.all([
    writeJson(
      path.join(reports, "unmatched-vocabulary.json"),
      artifacts.vocabulary.unmatched.map((item) =>
        compactVocabularyResult(item as VocabularyMatchResult),
      ),
    ),
    writeJson(path.join(reports, "unmatched-kanji.json"), artifacts.kanji.unmatched),
    writeJson(path.join(reports, "unmatched-grammar.json"), artifacts.grammar.unmatched),
    writeJson(
      path.join(reports, "ambiguous-vocabulary.json"),
      artifacts.vocabulary.ambiguous.map((item) =>
        "candidate" in (item as object)
          ? compactVocabularyResult(item as VocabularyMatchResult)
          : item,
      ),
    ),
    writeJson(path.join(reports, "duplicate-records.json"), duplicateRecords),
    writeJson(path.join(reports, "jlpt-level-conflicts.json"), levelConflicts),
    writeJson(path.join(reports, "textbook-ocr-conflicts.json"), artifacts.ocrConflicts),
    writeJson(path.join(reports, "low-confidence-records.json"), lowConfidence),
    writeJson(path.join(reports, "missing-references.json"), missingReferences),
    writeJson(path.join(reports, "validation-results.json"), artifacts.validation),
  ]);

  const matchedVocabulary = artifacts.vocabularyMatches.filter(
    (result) => result.status === "matched",
  ).length;
  const mappedKanji = bundle.kanji.n5.length + bundle.kanji.n4.length;
  const kanjiCandidates =
    mappedKanji + artifacts.kanji.unmatched.length + artifacts.kanji.missingReferences.length;
  const counts = unresolvedCounts(artifacts);
  const ocrRows = TEXTBOOKS.map((book) => {
    const mappings = bundle.textbookMap.filter(
      (mapping) => mapping.sourceBook === book.displayName,
    );
    const candidates = mappings.reduce(
      (total, mapping) => total + mapping.canonicalHitOccurrences,
      0,
    );
    const matched = mappings.reduce(
      (total, mapping) => total + mapping.unambiguousHitOccurrences,
      0,
    );
    const status = mappings.length > 0 ? "Cached OCR candidates; review required" : "Not run";
    return `| ${book.displayName} | ${status} | ${candidates} | ${matched} | ${percentage(matched, candidates)} |`;
  }).join("\n");
  const summary = `# JapanGo content summary

This report describes the generated source-backed snapshot. It does **not** claim complete or pedagogically reviewed JLPT coverage.

## Generated records

| Content | N5 | N4 | Supplemental |
|---|---:|---:|---:|
| Vocabulary | ${bundle.vocabulary.n5.length} | ${bundle.vocabulary.n4.length} | ${bundle.vocabulary.supplemental.length} |
| Kanji | ${bundle.kanji.n5.length} | ${bundle.kanji.n4.length} | — |
| Grammar | ${bundle.grammar.n5.length} | ${bundle.grammar.n4.length} | — |
| Curriculum units | ${bundle.curriculum.n5.length} | ${bundle.curriculum.n4.length} | — |

## Canonical matching

- JMdict strict form-and-reading match rate: ${matchedVocabulary}/${artifacts.vocabularyMatches.length} (${percentage(matchedVocabulary, artifacts.vocabularyMatches.length)}).
- KANJIDIC2 match rate for selected JLPT kanji: ${mappedKanji}/${kanjiCandidates} (${percentage(mappedKanji, kanjiCandidates)}).
- Grammar: legacy N5 mappings remain review-only; N4 records come from JapanGo's manually curated, release-ready editorial source.
- Examples from the JMdict Yomitan bundle were excluded because their separate provenance and redistribution terms were not supplied.

## Textbook OCR canonical-hit ambiguity

All six PDFs are image-only. The completed cached OCR was read without reprocessing. The extractor retains canonical-token hits inside reviewed lesson windows and every placement remains review-required. Zero-match OCR tokens were not retained by the legacy extraction, so this table is **not an OCR match-rate measurement**.

| Book | OCR status | Canonical-hit occurrences | Unambiguous hits | Unambiguous share |
|---|---|---:|---:|---:|
${ocrRows}

## Unresolved and review counts

${Object.entries(counts).map(([label, count]) => `- ${label}: ${count}`).join("\n")}

- Duplicate/conflicting mapping records: ${duplicateRecords.length}.
- JLPT-level conflicts: ${levelConflicts.length}.
- Missing source information: licences/provenance for the JLPT vocabulary CSV and Kotoba Brew N5 CSV; a complete local KANJIDIC2/JMdict licence copy; textbook OCR metadata.

## Validation

- Errors: ${artifacts.validation.errors.length}.
- Warnings: ${artifacts.validation.warnings.length}.
${artifacts.validation.warnings.map((warning) => `- ${warning}`).join("\n") || "- None."}

## Recommended manual-review priorities

1. Confirm provenance and redistribution terms for the JLPT vocabulary, JLPT kanji, and Kotoba Brew mappings before publication.
2. Maintain the reviewed N4 grammar source and its deterministic editorial decision ledger as project-owned canonical metadata.
3. Review ambiguous and unmatched vocabulary by Japanese form and kana reading, never by English gloss alone.
4. Work through the reduced lesson/identity review queue; rerun OCR only for a specifically identified unreadable page.
5. Editorially review grammar identity collisions and add original JapanGo formation rules, explanations, and prerequisites.
6. Treat generated curriculum units as deterministic staging only; they are not release-ready until textbook comparison and pedagogy review are complete.
`;
  await writeText(path.join(reports, "content-summary.md"), summary);

  const licenceReport = `# Source licence and attribution report

## Publish-blocking review

- **JLPT vocabulary CSV:** no local licence, upstream URL, version, or attribution file was supplied. Mapping-derived publication requires provenance review.
- **Kotoba Brew grammar CSV:** no local licence, version, attribution, or recoverable link targets were supplied. Grammar-derived publication requires permission/terms review.
- **JLPT kanji mapping:** the README attributes kanjiapi.dev, EDRDG dictionary files, and Jonathan Waller's JLPT resources, but does not bundle complete upstream terms. Review the composite terms.
- **JMdict/KANJIDIC2:** the authoritative EDRDG licence is CC BY-SA 4.0 and requires clear acknowledgement for significant extracts, including a Sources/About screen in smartphone apps. The local snapshot does not bundle the full licence, so retain a copy/link and an update procedure: https://www.edrdg.org/edrdg/licence.html.

## KanjiVG

Every inspected SVG embeds Creative Commons Attribution-ShareAlike 3.0 terms. The project site confirms the same licence. Attribution to KanjiVG/Ulrich Apel and a link to https://kanjivg.tagaini.net/ are required; ShareAlike may apply to component/stroke derivations.

## Textbooks

The six PDFs are copyrighted private references only. PDFs, OCR page text, explanations, dialogues, passages, exercises, answers, examples, transcripts, and images must not be committed or redistributed. Final output may retain only limited book/edition/lesson/page and canonical-ID mapping metadata.

## Excluded content

JMdict-bundle example sentences were excluded from generated vocabulary because the bundle contains no separate example identifiers, provenance, or redistribution licence metadata.

The JMdict Yomitan release confirms that its released dictionaries inherit JMdict's CC BY-SA 4.0 licence, while its importer code is MIT: https://github.com/yomidevs/jmdict-yomitan. This pipeline redistributes no importer code and excludes the unattributed example sentences.
`;
  await writeText(path.join(reports, "licence-report.md"), licenceReport);
}
