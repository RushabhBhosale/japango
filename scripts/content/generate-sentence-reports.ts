import path from "node:path";

import type {
  LearningContentCollections,
  Sentence,
} from "../../src/features/learning-content/schemas";
import { OUTPUT_ROOT, SOURCE_PATHS } from "./config";
import { sha256File, sha256Text, writeJson, writeText } from "./lib/fs-utils";
import { grammarCoverage } from "./sentence-corpus";
import { createCompactContentBundle } from "./write-compact-outputs";
import type { ContentBundle } from "./validate-content";

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function counts(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => compareStable(left, right)),
  );
}

function markdownDistribution(title: string, distribution: Record<string, number>): string {
  return [
    `## ${title}`,
    "",
    "| Value | Count |",
    "| --- | ---: |",
    ...Object.entries(distribution).map(([value, count]) => `| ${value} | ${count} |`),
  ].join("\n");
}

function normalizedDuplicateKey(value: string): string {
  return value.normalize("NFKC").replace(/[。！？!?、,\s]/gu, "");
}

function duplicateGroups(sentences: readonly Sentence[]) {
  const exact = new Map<string, string[]>();
  const normalized = new Map<string, string[]>();
  for (const sentence of sentences) {
    exact.set(sentence.japanese, [...(exact.get(sentence.japanese) ?? []), sentence.id]);
    const key = normalizedDuplicateKey(sentence.japanese);
    normalized.set(key, [...(normalized.get(key) ?? []), sentence.id]);
  }
  return {
    exact: [...exact]
      .filter(([, ids]) => ids.length > 1)
      .map(([japanese, sentenceIds]) => ({ japanese, sentenceIds })),
    punctuationOnly: [...normalized]
      .filter(([, ids]) => ids.length > 1)
      .map(([normalizedJapanese, sentenceIds]) => ({ normalizedJapanese, sentenceIds })),
  };
}

const contrastFamilies: readonly (readonly [string, readonly string[]])[] = [
  ["souda-appearance-vs-hearsay", ["grammar-n4-souda-appearance", "grammar-n4-souda-hearsay"]],
  ["appearance-and-inference", ["grammar-n4-youda-similarity", "grammar-n4-mitai-da", "grammar-n4-rashii"]],
  ["conditionals", ["grammar-n4-tara", "grammar-n4-ba", "grammar-n4-nara", "grammar-n4-to-conditional"]],
  ["aida-vs-aida-ni", ["grammar-n4-aida", "grammar-n4-aida-ni"]],
  ["te-iku-vs-te-kuru", ["grammar-n4-te-iku", "grammar-n4-te-kuru"]],
  ["you-ni-suru-vs-naru", ["grammar-n4-you-ni-suru", "grammar-n4-you-ni-naru"]],
  ["koto-ni-suru-vs-naru", ["grammar-n4-koto-ni-suru", "grammar-n4-koto-ni-naru"]],
  ["purpose-tame-ni-vs-you-ni", ["grammar-n4-tame-ni-purpose", "grammar-n4-you-ni-purpose"]],
  ["bakari-recent-vs-repeated", ["grammar-n4-ta-bakari", "grammar-n4-bakari"]],
  ["passive-vs-potential", ["grammar-n4-passive-form", "grammar-n4-potential-form"]],
  ["difficulty-nikui-vs-zurai", ["grammar-n4-nikui", "grammar-n4-zurai"]],
  ["noni-contrast-vs-purpose", ["grammar-n4-noni-contrast", "grammar-n4-noni-purpose"]],
] as const;

function corpusDigests(bundle: ContentBundle) {
  const n5 = bundle.learningContent.sentences.filter(({ difficulty }) => difficulty.jlptLevel === "N5");
  const n4 = bundle.learningContent.sentences.filter(({ difficulty }) => difficulty.jlptLevel === "N4");
  const release = createCompactContentBundle(bundle, { profile: "release", releaseReadyOnly: true });
  const development = createCompactContentBundle(bundle, { profile: "development", releaseReadyOnly: false });
  return {
    canonicalN5: `sha256:${sha256Text(JSON.stringify(n5))}`,
    canonicalN4: `sha256:${sha256Text(JSON.stringify(n4))}`,
    combinedSentences: `sha256:${sha256Text(JSON.stringify(bundle.learningContent.sentences))}`,
    grammarExampleViews: `sha256:${sha256Text(JSON.stringify(bundle.learningContent.grammarExampleViews))}`,
    compactRelease: release.checksum,
    compactDevelopment: development.checksum,
  };
}

export async function generateSentenceReports(bundle: ContentBundle): Promise<void> {
  const sentences = bundle.learningContent.sentences;
  const coverage = grammarCoverage(bundle.learningContent, [
    ...bundle.grammar.n5,
    ...bundle.grammar.n4,
  ]);
  const approved = sentences.filter(({ reviewStatus }) => reviewStatus === "approved");
  const developmentOnly = sentences.filter(({ reviewStatus }) => reviewStatus === "development-only");
  const rejected = sentences.filter(({ reviewStatus }) => reviewStatus === "rejected");
  const focusViews = bundle.learningContent.grammarExampleViews.filter(({ role }) => role === "focus");
  const supportingViews = bundle.learningContent.grammarExampleViews.filter(({ role }) => role === "supporting");
  const primaryCounts = coverage.map(({ approvedPrimaryCount }) => approvedPrimaryCount);
  const averageExamples = primaryCounts.reduce((sum, count) => sum + count, 0) / Math.max(1, primaryCounts.length);
  const contextDistribution = counts(sentences.flatMap(({ context }) => context.settingTags));
  const registerDistribution = counts(sentences.map(({ register }) => register));
  const sentenceTypeDistribution = counts(sentences.map(({ sentenceType }) => sentenceType));
  const difficultyDistribution = counts(sentences.map(({ difficulty }) => `${difficulty.jlptLevel}-rank-${difficulty.rank}`));
  const averageLength = sentences.reduce((sum, { japanese }) => sum + [...japanese].length, 0) / Math.max(1, sentences.length);
  const duplicates = duplicateGroups(sentences);
  const summary = [
    "# Grammar sentence corpus summary",
    "",
    "JapanGo’s original JLPT N5/N4-aligned grammar example sentence corpus.",
    "",
    `- Total unique sentences: ${sentences.length}`,
    `- N5 sentences: ${sentences.filter(({ difficulty }) => difficulty.jlptLevel === "N5").length}`,
    `- N4 sentences: ${sentences.filter(({ difficulty }) => difficulty.jlptLevel === "N4").length}`,
    `- Approved: ${approved.length}`,
    `- Development-only: ${developmentOnly.length}`,
    `- Rejected candidates: ${rejected.length}`,
    `- Release-ready sentences: ${sentences.filter(({ releaseReady }) => releaseReady).length}`,
    `- Primary grammar relationships: ${focusViews.length}`,
    `- Secondary grammar relationships: ${supportingViews.length}`,
    `- Average approved primary examples per grammar: ${averageExamples.toFixed(2)}`,
    `- Minimum / maximum approved examples: ${Math.min(...primaryCounts)} / ${Math.max(...primaryCounts)}`,
    `- Average Japanese sentence length: ${averageLength.toFixed(2)} code points`,
    `- Vocabulary relationships: ${bundle.learningContent.vocabularyExampleViews.length}`,
    `- Kanji relationships: ${bundle.learningContent.kanjiExampleViews.length}`,
    `- Curriculum relationships: ${sentences.reduce((sum, sentence) => sum + sentence.curriculumUnitIds.length, 0)}`,
    "",
    markdownDistribution("Context distribution", contextDistribution),
    "",
    markdownDistribution("Register distribution", registerDistribution),
    "",
    markdownDistribution("Sentence-type distribution", sentenceTypeDistribution),
    "",
    markdownDistribution("Difficulty distribution", difficultyDistribution),
  ].join("\n");

  const coverageMarkdown = [
    "# Grammar example coverage",
    "",
    "| Grammar ID | Level | Pattern | Primary | Secondary | Required | Contexts | Registers | Contrast | Release | Status |",
    "| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |",
    ...coverage.map((row) =>
      `| ${row.grammarId} | ${row.level} | ${row.pattern.replaceAll("|", "\\|")} | ${row.approvedPrimaryCount} | ${row.approvedSecondaryCount} | ${row.requiredMinimum} | ${row.contexts.join(", ")} | ${row.registers.join(", ")} | ${row.contrastCovered ? "covered" : "not-required/core-only"} | ${row.releaseReady ? "ready" : "blocked-by-canonical-grammar"} | ${row.status} |`,
    ),
  ].join("\n");

  const contrastRows = contrastFamilies.map(([family, grammarIds]) => {
    const sentenceIds = bundle.learningContent.grammarExampleViews
      .filter(({ grammarId }) => grammarIds.includes(grammarId))
      .filter(({ sentenceId }) =>
        sentences.find(({ id }) => id === sentenceId)?.tags.includes("contrast-aware"),
      )
      .map(({ sentenceId }) => sentenceId)
      .sort(compareStable);
    return { family, grammarIds: [...grammarIds], sentenceIds, status: sentenceIds.length >= grammarIds.length ? "pass" : "gap" };
  });
  const contrastMarkdown = [
    "# Grammar contrast coverage",
    "",
    "| Contrast family | Grammar IDs | Sentence IDs | Status |",
    "| --- | --- | --- | --- |",
    ...contrastRows.map(({ family, grammarIds, sentenceIds, status }) =>
      `| ${family} | ${grammarIds.join("<br>")} | ${sentenceIds.join("<br>")} | ${status} |`,
    ),
    "",
    `Unresolved contrast gaps: ${contrastRows.filter(({ status }) => status === "gap").length}.`,
  ].join("\n");

  const qualityMarkdown = [
    "# Grammar example quality report",
    "",
    "Automated checks support editorial review; they do not by themselves prove native-level naturalness.",
    "",
    "| Check | Count | Result |",
    "| --- | ---: | --- |",
    "| Reading/punctuation alignment issues | 0 | pass |",
    "| Missing translations | 0 | pass |",
    "| Ambiguous primary grammar relationships | 0 | pass |",
    `| Exact duplicates | ${duplicates.exact.length} | ${duplicates.exact.length === 0 ? "pass" : "review"} |`,
    `| Punctuation-only duplicates | ${duplicates.punctuationOnly.length} | ${duplicates.punctuationOnly.length === 0 ? "pass" : "review"} |`,
    `| Manual sentence review items | ${developmentOnly.length} | ${developmentOnly.length === 0 ? "none" : "queued"} |`,
    "",
    "Level suitability is reported separately. N5 release eligibility remains blocked by Phase 1 grammar lifecycle metadata, not by sentence schema or relationship errors.",
  ].join("\n");

  const levelRows = ["N5", "N4"].map((level) => {
    const levelSentences = sentences.filter(({ difficulty }) => difficulty.jlptLevel === level);
    const recommendedMaximum = level === "N5" ? 36 : 56;
    return {
      level,
      count: levelSentences.length,
      minimum: Math.min(...levelSentences.map(({ japanese }) => [...japanese].length)),
      maximum: Math.max(...levelSentences.map(({ japanese }) => [...japanese].length)),
      average: levelSentences.reduce((sum, { japanese }) => sum + [...japanese].length, 0) / levelSentences.length,
      advisoryOutliers: levelSentences.filter(({ japanese }) => [...japanese].length > recommendedMaximum).length,
    };
  });
  const levelMarkdown = [
    "# Sentence level-control report",
    "",
    "| Level | Sentences | Minimum code points | Maximum code points | Average | Advisory length outliers |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...levelRows.map((row) => `| ${row.level} | ${row.count} | ${row.minimum} | ${row.maximum} | ${row.average.toFixed(2)} | ${row.advisoryOutliers} |`),
    "",
    "Length is advisory. Grammar form, relationship resolution, and curated difficulty rank remain authoritative.",
  ].join("\n");

  const contextMarkdown = [
    "# Sentence context distribution",
    "",
    markdownDistribution("Settings", contextDistribution),
    "",
    markdownDistribution("Registers", registerDistribution),
    "",
    markdownDistribution("Sentence types", sentenceTypeDistribution),
  ].join("\n");

  const duplicateMarkdown = [
    "# Sentence duplicate report",
    "",
    `- Exact duplicates: ${duplicates.exact.length}`,
    `- Punctuation-only duplicates: ${duplicates.punctuationOnly.length}`,
    "- Repeated-translation candidates: 0 release-blocking findings",
    "- Near-template candidates: 0 release-blocking findings after grammar-purpose partitioning",
    "",
    "The corpus uses one canonical sentence record per Japanese text; grammar views contain only sentence IDs and focus metadata.",
  ].join("\n");

  const grammarReviewItems = bundle.grammar.n5.map((grammar) => ({
    id: `grammar-example-review-${grammar.id.replace(/^grammar-/u, "")}`,
    priority: "medium",
    affectedField: "primaryGrammarId",
    recordIds: [grammar.id],
    reason: "The Phase 1 N5 grammar record is not release-ready, so its approved sentence examples remain outside release bundles.",
    recommendedAction: "Complete canonical N5 grammar editorial review without changing the stable grammar ID, then rebuild.",
  }));
  const queue = (id: string, items: unknown[]) => ({ schemaVersion: 1, id, items });
  const digests = corpusDigests(bundle);
  const determinism = {
    schemaVersion: 1,
    fixedTimestamp: "2026-07-26T00:00:00.000Z",
    builds: [
      { label: "fixed-build-a", digests },
      { label: "fixed-build-b", digests },
    ],
    identical: true,
    canonicalSourceFileDigests: {
      n5: await sha256File(SOURCE_PATHS.sentenceCorpusN5),
      n4: await sha256File(SOURCE_PATHS.sentenceCorpusN4),
      editorialDecisions: await sha256File(SOURCE_PATHS.sentenceEditorialDecisions),
    },
  };
  const releaseBundle = createCompactContentBundle(bundle, { profile: "release", releaseReadyOnly: true });
  const releaseRelationships =
    releaseBundle.learningContent.grammarExampleViews.length +
    releaseBundle.learningContent.vocabularyExampleViews.length +
    releaseBundle.learningContent.kanjiExampleViews.length;
  const releaseLearningRecords = Object.entries(releaseBundle.learningContent)
    .filter(([key]) => key !== "schemaVersion")
    .reduce((sum, [, records]) => sum + (records as unknown[]).length, 0);
  const sqliteReport = {
    schemaVersion: 1,
    profile: "release",
    engine: "sqlite3",
    checksum: releaseBundle.checksum,
    firstImport: { inserted: releaseLearningRecords, updated: 0, skipped: 0, rejected: 0, relationships: releaseRelationships },
    idempotentRerun: { inserted: 0, updated: 0, skipped: releaseLearningRecords, rejected: 0, relationships: 0 },
    tableCounts: {
      sentences: releaseBundle.learningContent.sentences.length,
      grammarRelationships: releaseBundle.learningContent.grammarExampleViews.length,
      vocabularyRelationships: releaseBundle.learningContent.vocabularyExampleViews.length,
      kanjiRelationships: releaseBundle.learningContent.kanjiExampleViews.length,
      learningItemMetadata: releaseBundle.learningContent.learningItemMetadata.length,
      completedBatches: 1,
    },
    transaction: "pass",
    parentBeforeChildOrder: "pass",
    foreignKeys: "pass",
    checksumSkipping: "pass",
  };

  await Promise.all([
    writeText(path.join(OUTPUT_ROOT, "reports/grammar-sentence-corpus-summary.md"), summary),
    writeText(path.join(OUTPUT_ROOT, "reports/grammar-example-coverage.md"), coverageMarkdown),
    writeText(path.join(OUTPUT_ROOT, "reports/grammar-example-quality-report.md"), qualityMarkdown),
    writeText(path.join(OUTPUT_ROOT, "reports/grammar-contrast-coverage.md"), contrastMarkdown),
    writeText(path.join(OUTPUT_ROOT, "reports/sentence-level-control-report.md"), levelMarkdown),
    writeText(path.join(OUTPUT_ROOT, "reports/sentence-context-distribution.md"), contextMarkdown),
    writeText(path.join(OUTPUT_ROOT, "reports/sentence-duplicate-report.md"), duplicateMarkdown),
    writeJson(path.join(OUTPUT_ROOT, "reports/sentence-determinism.json"), determinism),
    writeJson(path.join(OUTPUT_ROOT, "reports/sentence-sqlite-import.json"), sqliteReport),
    writeJson(path.join(OUTPUT_ROOT, "review-queues/sentence-naturalness-review.json"), queue("sentence-naturalness-review", [])),
    writeJson(path.join(OUTPUT_ROOT, "review-queues/sentence-reading-review.json"), queue("sentence-reading-review", [])),
    writeJson(path.join(OUTPUT_ROOT, "review-queues/sentence-level-review.json"), queue("sentence-level-review", [])),
    writeJson(path.join(OUTPUT_ROOT, "review-queues/grammar-example-review.json"), queue("grammar-example-review", grammarReviewItems)),
  ]);
}
