import { readFile } from "node:fs/promises";
import path from "node:path";

import { OUTPUT_ROOT, PIPELINE_VERSION, SOURCE_PATHS } from "./config";
import { pathExists, sha256File, writeText } from "./lib/fs-utils";
import {
  n4GrammarEditorialDecisionLedgerSchema,
  type ReviewedN4GrammarRecord,
} from "./schemas/content-schemas";
import type { ValidationResult } from "./validate-content";

interface DeterminismVerification {
  pipelineVersion: string;
  sourceChecksum: string;
  fullDigest: string;
  compactDigest: string;
  matched: boolean;
}

function countBy<T>(
  values: readonly T[],
  key: (value: T) => string,
): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = key(value);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].sort(([left], [right]) => left.localeCompare(right, "en"));
}

function tableRows(rows: readonly [string, number][]): string {
  return rows.map(([label, count]) => `| ${label} | ${count} |`).join("\n");
}

function recordList(records: readonly ReviewedN4GrammarRecord[]): string {
  return records.length === 0
    ? "- None."
    : records
        .map((record) => `- \`${record.id}\` — ${record.pattern}`)
        .join("\n");
}

export async function generateN4GrammarCurationReport(
  records: readonly ReviewedN4GrammarRecord[],
  validation: ValidationResult,
): Promise<void> {
  const ledger = n4GrammarEditorialDecisionLedgerSchema.parse(
    JSON.parse(
      await readFile(SOURCE_PATHS.n4GrammarEditorialDecisions, "utf8"),
    ) as unknown,
  );
  const reportPath = path.join(
    OUTPUT_ROOT,
    "reports/n4-grammar-curation-report.md",
  );
  const verificationPath = path.join(
    OUTPUT_ROOT,
    "reports/n4-grammar-determinism.json",
  );
  let determinism: DeterminismVerification | null = null;
  if (await pathExists(verificationPath)) {
    determinism = JSON.parse(
      await readFile(verificationPath, "utf8"),
    ) as DeterminismVerification;
    if (
      determinism.pipelineVersion !== PIPELINE_VERSION ||
      determinism.sourceChecksum !==
      (await sha256File(SOURCE_PATHS.reviewedN4Grammar))
    ) {
      determinism = null;
    }
  }

  const decisionCounts = new Map(countBy(ledger.decisions, ({ decision }) => decision));
  const overlapCounts = new Map(
    countBy(ledger.decisions, ({ n5Overlap }) => n5Overlap.classification),
  );
  const n5OverlapTotal = ledger.decisions.filter(
    ({ n5Overlap }) => n5Overlap.classification !== "none",
  ).length;
  const approvedRecords = records.filter(
    ({ reviewStatus }) => reviewStatus === "approved",
  );
  const genki = approvedRecords.filter(({ textbookReferences }) =>
    textbookReferences.some(({ source }) => source === "Genki II"),
  );
  const minna = approvedRecords.filter(({ textbookReferences }) =>
    textbookReferences.some(({ source }) => source === "Minna no Nihongo II"),
  );
  const genkiIds = new Set(genki.map(({ id }) => id));
  const minnaIds = new Set(minna.map(({ id }) => id));
  const missingGenki = approvedRecords.filter(({ id }) => !genkiIds.has(id));
  const missingMinna = approvedRecords.filter(({ id }) => !minnaIds.has(id));
  const rejected = ledger.decisions.filter(({ decision }) => decision === "rejected");
  const merged = ledger.decisions.filter(({ decision }) => decision === "merged");
  const moved = ledger.decisions.filter(
    ({ decision }) => decision === "moved-to-vocabulary",
  );
  const unresolved = ledger.decisions.filter(
    ({ decision }) => decision === "unresolved",
  );
  const decisionList = (
    decisions: typeof ledger.decisions,
  ): string =>
    decisions
      .map(
        ({ row, pattern, reason, canonicalGrammarId }) =>
          `- Row ${row}, \`${pattern}\`${canonicalGrammarId ? ` → \`${canonicalGrammarId}\`` : ""}: ${reason}`,
      )
      .join("\n") || "- None.";
  const validationPassed = validation.errors.length === 0;

  const report = `# JapanGo N4 grammar curation report

This is **JapanGo's manually curated JLPT N4-aligned grammar curriculum**. It is an editorial curriculum, not an official or fixed JLPT grammar list. The source contains original classification metadata and concise formation summaries; it copies no textbook explanations, examples, exercises, or answer material.

## Editorial result

| Measure | Count |
| --- | ---: |
| Supplied candidate rows inspected | ${ledger.sourceCandidateRows} |
| Candidate-derived canonical records | ${decisionCounts.get("approved") ?? 0} |
| Manual coverage additions | ${ledger.manualAdditions.length} |
| Reviewed source records | ${records.length} |
| Approved canonical records | ${approvedRecords.length} |
| Rejected or N5-place rows | ${decisionCounts.get("rejected") ?? 0} |
| Merged variant rows | ${decisionCounts.get("merged") ?? 0} |
| Rows moved to vocabulary | ${decisionCounts.get("moved-to-vocabulary") ?? 0} |
| Unresolved rows | ${decisionCounts.get("unresolved") ?? 0} |
| Candidate rows with an N5 relationship | ${n5OverlapTotal} |
| Candidate rows classified as valid N4 extensions | ${overlapCounts.get("valid-n4-extension") ?? 0} |
| Approved records with \`extendsGrammarId\` | ${approvedRecords.filter(({ extendsGrammarId }) => extendsGrammarId !== null).length} |

The six manual additions are ${ledger.manualAdditions.map(({ pattern }) => `\`${pattern}\``).join(", ")}. Required prerequisite/review coverage already canonical at N5 is not duplicated in N4: ${ledger.requiredCoverageAtN5.map(({ pattern }) => `\`${pattern}\``).join(", ")}.

## N5 overlap classification

| Classification | Candidate rows |
| --- | ---: |
${tableRows(countBy(ledger.decisions, ({ n5Overlap }) => n5Overlap.classification))}

N5 overlap is intentionally broader than exact surface collision: it also records related formations and learning-objective extensions. Exact duplicates and N5 review items are excluded from canonical N4. Same-surface different-meaning records remain only when their semantic relationships are explicit.

## Category counts

| Category | Records |
| --- | ---: |
${tableRows(countBy(approvedRecords, ({ category }) => category))}

## Content-type counts

| Content type | Records |
| --- | ---: |
${tableRows(countBy(approvedRecords, ({ contentType }) => contentType))}

## Grammar-family counts

| Family | Records |
| --- | ---: |
${tableRows(countBy(approvedRecords, ({ familyId }) => familyId))}

## Rejected or N5-place rows

${decisionList(rejected)}

## Merged variants

${decisionList(merged)}

## Moved to vocabulary

${decisionList(moved)}

## Unresolved

${decisionList(unresolved)}

Unresolved rows remain explicit non-release records in \`grammar/n4.json\` and the development bundle. They are excluded from the production bundle and curriculum units. OCR-only candidates remain a separate review report and cannot override the manual source.

## Textbook coverage metadata

| Cross-check | Records with a bounded reference | Records without one |
| --- | ---: | ---: |
| Genki II | ${genki.length} | ${missingGenki.length} |
| Minna no Nihongo II | ${minna.length} | ${missingMinna.length} |

A missing reference means “not confirmed in the bounded reviewed OCR metadata,” not proof that a book omits the grammar point. Page and lesson values are curriculum cross-check metadata only.

### Not confirmed in Genki II metadata

${recordList(missingGenki)}

### Not confirmed in Minna no Nihongo II metadata

${recordList(missingMinna)}

## Validation

- Schema and cross-reference validation: **${validationPassed ? "passed" : "failed"}**.
- Errors: ${validation.errors.length}.
- Warnings: ${validation.warnings.length}.
- Canonical ordering: curriculum order, category, normalized pattern, then ID.
- Approved/readiness invariant: approved records are \`needsReview: false\` and \`releaseReady: true\`.
- Grammar prerequisite graph: ${validation.errors.some((error) => error.startsWith("Grammar prerequisite cycle:")) ? "failed" : "acyclic"}.

## Deterministic build

${determinism?.matched
    ? `- Two fixed-timestamp builds: **matched**.\n- Core generated-content digest (excluding the manifest and the two self-referential determinism report files): \`${determinism.fullDigest}\`.\n- Compact-content digest: \`${determinism.compactDigest}\`.\n- Reviewed-source checksum: \`${determinism.sourceChecksum}\`.`
    : "- Two fixed-timestamp digest comparison: pending the final acceptance run. Canonical sorting and stable JSON serialization are active."}
`;
  await writeText(reportPath, report);
}
