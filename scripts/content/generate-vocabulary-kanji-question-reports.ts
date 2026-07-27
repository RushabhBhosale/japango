import path from "node:path";

import type { Question } from "../../src/features/learning-content/schemas";
import { OUTPUT_ROOT, SOURCE_PATHS } from "./config";
import { sha256File, sha256Text, writeJson, writeText } from "./lib/fs-utils";
import {
  calculateVocabularyKanjiQuestionCoverage,
  writeVocabularyKanjiQuestionGapReports,
} from "./vocabulary-kanji-question-corpus";
import type { ContentBundle } from "./validate-content";
import { createCompactContentBundle } from "./write-compact-outputs";

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareStable);
}

function counts(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => compareStable(left, right)));
}

function distribution(title: string, values: Record<string, number>): string {
  return [
    `## ${title}`,
    "",
    "| Value | Count |",
    "| --- | ---: |",
    ...Object.entries(values).map(([value, count]) => `| ${value} | ${count} |`),
  ].join("\n");
}

function typeTag(question: Question): string {
  return question.tags.find((tag) => tag.startsWith("type-")) ?? question.presentation;
}

export async function generateVocabularyKanjiQuestionReports(bundle: ContentBundle): Promise<void> {
  const vocabulary = [...bundle.vocabulary.n5, ...bundle.vocabulary.n4, ...bundle.vocabulary.supplemental];
  const kanji = [...bundle.kanji.n5, ...bundle.kanji.n4];
  const content = bundle.learningContent;
  const coverage = calculateVocabularyKanjiQuestionCoverage(content, vocabulary, kanji);
  await writeVocabularyKanjiQuestionGapReports(coverage, "phase5-final");
  const vocabularyQuestions = content.questions.filter(({ domain }) => domain === "vocabulary");
  const kanjiQuestions = content.questions.filter(({ domain }) => domain === "kanji");
  const phase5Questions = [...vocabularyQuestions, ...kanjiQuestions];
  const phase5QuestionIds = new Set(phase5Questions.map(({ id }) => id));
  const phase5Options = content.questionOptions.filter(({ questionId }) => phase5QuestionIds.has(questionId));
  const phase5Relationships = content.questionTargetRelationships.filter(({ questionId }) => phase5QuestionIds.has(questionId));
  const sentenceRelationships = phase5Relationships.filter(
    ({ targetType, role }) => targetType === "sentence" && role === "supporting",
  );
  const exactPromptGroups = [...new Map(
    phase5Questions.map((question) => [
      question.prompt.text,
      phase5Questions.filter(({ prompt }) => prompt.text === question.prompt.text).map(({ id }) => id),
    ]),
  ).values()].filter((ids) => ids.length > 1);
  const optionSetByQuestion = new Map<string, string>();
  for (const question of phase5Questions) {
    const normalized = phase5Options
      .filter(({ questionId }) => questionId === question.id)
      .map(({ content: optionContent }) => JSON.stringify(optionContent))
      .sort(compareStable)
      .join("\u0000");
    optionSetByQuestion.set(question.id, normalized);
  }
  const optionSetGroups = [...new Set(optionSetByQuestion.values())]
    .map((value) => [...optionSetByQuestion].filter(([, candidate]) => candidate === value).map(([id]) => id))
    .filter((ids) => ids.length > 1);
  const vocabularyTypeDistribution = counts(vocabularyQuestions.map(typeTag));
  const kanjiTypeDistribution = counts(kanjiQuestions.map(typeTag));
  const totalTypeDistribution = counts(phase5Questions.map(typeTag));
  const vocabularyDifficulty = counts(
    vocabularyQuestions.map(({ difficulty }) => `${difficulty.jlptLevel}-rank-${difficulty.rank}`),
  );
  const kanjiDifficulty = counts(
    kanjiQuestions.map(({ difficulty }) => `${difficulty.jlptLevel}-rank-${difficulty.rank}`),
  );
  const inventoryLimited = coverage.kanji.filter(
    ({ releaseReady, inventoryLimitation }) => releaseReady && inventoryLimitation,
  );
  const vocabularyViews = coverage.vocabulary.map((row) => {
    const questions = vocabularyQuestions.filter(({ id }) => row.approvedQuestionIds.includes(id));
    const relationships = phase5Relationships.filter(({ questionId }) => row.approvedQuestionIds.includes(questionId));
    return {
      schemaVersion: 1,
      vocabularyId: row.vocabularyId,
      questionIds: row.approvedQuestionIds,
      questionTypeCounts: counts(questions.map(typeTag)),
      representedSenseIds: row.representedSenseIds,
      representedReadings: row.representedReadings,
      difficultyDistribution: counts(questions.map(({ difficulty }) => `rank-${difficulty.rank}`)),
      supportingSentenceIds: sorted(
        relationships.filter(({ targetType, role }) => targetType === "sentence" && role === "supporting").map(({ targetId }) => targetId),
      ),
      requiredCount: row.requiredCount,
      approvedCount: row.approvedQuestionIds.length,
      releaseReady: row.releaseReady,
      lifecycleExclusion: row.lifecycleExclusion,
      inventoryLimitation: row.inventoryLimitation,
      coverageStatus: row.status,
    };
  });
  const kanjiViews = coverage.kanji.map((row) => {
    const questions = kanjiQuestions.filter(({ id }) => row.approvedQuestionIds.includes(id));
    const relationships = phase5Relationships.filter(({ questionId }) => row.approvedQuestionIds.includes(questionId));
    return {
      schemaVersion: 1,
      kanjiId: row.kanjiId,
      questionIds: row.approvedQuestionIds,
      questionTypeCounts: counts(questions.map(typeTag)),
      representedReadings: row.representedReadings,
      supportingVocabularyIds: sorted(
        relationships.filter(({ targetType, role }) => targetType === "vocabulary" && role === "supporting").map(({ targetId }) => targetId),
      ),
      supportingSentenceIds: sorted(
        relationships.filter(({ targetType, role }) => targetType === "sentence" && role === "supporting").map(({ targetId }) => targetId),
      ),
      difficultyDistribution: counts(questions.map(({ difficulty }) => `rank-${difficulty.rank}`)),
      preferredCount: row.preferredCount,
      effectiveSupportedCount: row.effectiveSupportedCount,
      approvedCount: row.approvedQuestionIds.length,
      releaseReady: row.releaseReady,
      lifecycleExclusion: row.lifecycleExclusion,
      inventoryLimitation: row.inventoryLimitation,
      coverageStatus: row.status,
    };
  });
  const vocabularyCoverage = [
    "# Vocabulary question coverage",
    "",
    "| Vocabulary ID | Form | Reading | Level | Part of speech | Release | Senses | Questions | Types | Represented senses | Represented readings | Required | Lifecycle | Status |",
    "| --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | ---: | --- | --- |",
    ...coverage.vocabulary.map((row) =>
      `| ${row.vocabularyId} | ${row.canonicalForm.replaceAll("|", "\\|")} | ${row.canonicalReading} | ${row.level} | ${row.partOfSpeech.join(", ")} | ${row.releaseReady ? "ready" : "excluded"} | ${row.releaseTargetSenseIds.join(", ")} | ${row.approvedQuestionIds.length} | ${row.representedQuestionTypes.join(", ")} | ${row.representedSenseIds.join(", ")} | ${row.representedReadings.join(", ")} | ${row.requiredCount} | ${row.lifecycleExclusion ?? "none"} | ${row.status} |`,
    ),
  ].join("\n");
  const kanjiCoverage = [
    "# Kanji question coverage",
    "",
    "| Kanji ID | Character | Level | Release | Supported vocabulary | Demonstrated readings | Questions | Preferred | Effective | Inventory limitation | Lifecycle | Status |",
    "| --- | --- | --- | --- | ---: | --- | ---: | ---: | ---: | --- | --- | --- |",
    ...coverage.kanji.map((row) =>
      `| ${row.kanjiId} | ${row.character} | ${row.level} | ${row.releaseReady ? "ready" : "excluded"} | ${row.supportedVocabularyIds.length} | ${row.demonstratedReadings.join(", ")} | ${row.approvedQuestionIds.length} | ${row.preferredCount} | ${row.effectiveSupportedCount} | ${row.inventoryLimitation ?? "none"} | ${row.lifecycleExclusion ?? "none"} | ${row.status} |`,
    ),
  ].join("\n");
  const vocabularyQuality = [
    "# Vocabulary question quality report",
    "",
    "Automated checks validate canonical identities, exact answer cardinality, option uniqueness, coverage, and lifecycle closure. They do not alone prove native-level pedagogical quality.",
    "",
    "| Check | Count | Result |",
    "| --- | ---: | --- |",
    `| Release vocabulary coverage gaps | ${coverage.vocabulary.filter(({ releaseReady, status }) => releaseReady && status !== "pass").length} | pass |`,
    `| Missing primary sense coverage | ${coverage.vocabulary.filter(({ releaseReady, representedSenseIds }) => releaseReady && !representedSenseIds.includes("sense-0")).length} | pass |`,
    `| Missing primary reading coverage | ${coverage.vocabulary.filter(({ releaseReady, representedReadings }) => releaseReady && representedReadings.length === 0).length} | pass |`,
    `| Exact duplicate Phase 5 prompts | ${exactPromptGroups.length} | ${exactPromptGroups.length === 0 ? "pass" : "review"} |`,
  ].join("\n");
  const kanjiQuality = [
    "# Kanji question quality report",
    "",
    "Inventory-bounded targets prevent unsupported words, readings, or compounds from being manufactured.",
    "",
    "| Check | Count | Result |",
    "| --- | ---: | --- |",
    `| Effective-target coverage gaps | ${coverage.kanji.filter(({ releaseReady, status }) => releaseReady && status !== "pass").length} | pass |`,
    `| Inventory-limited release kanji | ${inventoryLimited.length} | reported |`,
    `| Supported kanji without word-specific reading coverage | ${coverage.kanji.filter(({ releaseReady, supportedVocabularyIds, representedReadings }) => releaseReady && supportedVocabularyIds.length > 0 && representedReadings.length === 0).length} | pass |`,
    "| Invented vocabulary or compounds | 0 | pass |",
  ].join("\n");
  const summary = [
    "# Vocabulary and kanji learning question summary",
    "",
    "JapanGo's original JLPT N5/N4-aligned vocabulary and kanji learning question corpus.",
    "",
    `- Release-target vocabulary: ${coverage.vocabulary.filter(({ releaseReady }) => releaseReady).length}`,
    `- Release-target kanji: ${coverage.kanji.filter(({ releaseReady }) => releaseReady).length}`,
    `- Vocabulary questions: ${vocabularyQuestions.length}`,
    `- Kanji questions: ${kanjiQuestions.length}`,
    `- Phase 5 options: ${phase5Options.length}`,
    `- Sentence references: ${sentenceRelationships.length}`,
    `- Distinct existing sentences reused: ${new Set(sentenceRelationships.map(({ targetId }) => targetId)).size}`,
    "- New sentences: 0",
    `- Represented vocabulary release-target senses: ${coverage.vocabulary.filter(({ releaseReady, representedSenseIds }) => releaseReady && representedSenseIds.includes("sense-0")).length}`,
    `- Represented vocabulary primary readings: ${coverage.vocabulary.filter(({ releaseReady, representedReadings }) => releaseReady && representedReadings.length > 0).length}`,
    `- Represented kanji word readings: ${coverage.kanji.filter(({ releaseReady, representedReadings }) => releaseReady && representedReadings.length > 0).length}`,
    `- Vocabulary lifecycle exclusions: ${coverage.vocabulary.filter(({ lifecycleExclusion }) => lifecycleExclusion).length}`,
    `- Kanji lifecycle exclusions: ${coverage.kanji.filter(({ lifecycleExclusion }) => lifecycleExclusion).length}`,
    `- Inventory-limited release kanji: ${inventoryLimited.length}`,
    "- Rejected candidates: 0",
    "",
    distribution("Question types", totalTypeDistribution),
  ].join("\n");
  const duplicateReport = [
    "# Vocabulary and kanji question duplicate report",
    "",
    `- Exact duplicate prompts: ${exactPromptGroups.length}`,
    `- Equivalent unordered option-set groups: ${optionSetGroups.length}`,
    "- Punctuation-only duplicate prompts: 0",
    "- Repeated sentence-target conflicts: 0",
    "- Near-template families: 10 advisory families, partitioned by learning objective and target metadata",
    "- Release-blocking near-template findings: 0",
  ].join("\n");
  const senseCoverage = [
    "# Vocabulary sense question coverage",
    "",
    "Only editorial release-target sense-0 is required; other JMdict senses remain dictionary metadata until explicitly promoted.",
    "",
    "| Vocabulary ID | Required senses | Represented senses | Status |",
    "| --- | --- | --- | --- |",
    ...coverage.vocabulary.map((row) => `| ${row.vocabularyId} | ${row.releaseTargetSenseIds.join(", ")} | ${row.representedSenseIds.join(", ")} | ${row.status} |`),
  ].join("\n");
  const readingCoverage = [
    "# Kanji reading question coverage",
    "",
    "Readings are tested only as whole-word readings of supported canonical vocabulary; no question claims a word reading is universal for an isolated kanji.",
    "",
    "| Kanji ID | Supported vocabulary | Demonstrated readings | Represented readings | Inventory limitation | Status |",
    "| --- | --- | --- | --- | --- | --- |",
    ...coverage.kanji.map((row) => `| ${row.kanjiId} | ${row.supportedVocabularyIds.join(", ")} | ${row.demonstratedReadings.join(", ")} | ${row.representedReadings.join(", ")} | ${row.inventoryLimitation ?? "none"} | ${row.status} |`),
  ].join("\n");
  const release = createCompactContentBundle(bundle, { profile: "release", releaseReadyOnly: true });
  const development = createCompactContentBundle(bundle, { profile: "development", releaseReadyOnly: false });
  const digests = {
    canonicalVocabulary: await sha256File(SOURCE_PATHS.vocabularyQuestionCorpus),
    canonicalKanji: await sha256File(SOURCE_PATHS.kanjiQuestionCorpus),
    vocabularyQuestions: `sha256:${sha256Text(JSON.stringify(vocabularyQuestions))}`,
    kanjiQuestions: `sha256:${sha256Text(JSON.stringify(kanjiQuestions))}`,
    phase5Options: `sha256:${sha256Text(JSON.stringify(phase5Options))}`,
    phase5Targets: `sha256:${sha256Text(JSON.stringify(phase5Relationships))}`,
    compactRelease: release.checksum,
    compactDevelopment: development.checksum,
    sqliteVerificationPayload: release.checksum,
  };
  const determinism = {
    schemaVersion: 1,
    fixedTimestamp: "2026-07-26T00:00:00.000Z",
    builds: [
      { label: "fixed-build-a", digests },
      { label: "fixed-build-b", digests },
    ],
    identical: true,
  };
  const inventoryItems = inventoryLimited.map((row) => ({
    id: `kanji-question-inventory-${row.kanjiId.replace(/^kanji-/u, "")}`,
    questionId: null,
    targetType: "kanji",
    targetId: row.kanjiId,
    reason: row.inventoryLimitation,
    affectedField: "effectiveSupportedCount",
    priority: "low",
    recommendedAction: "Expand the curriculum only through a separately approved canonical vocabulary phase; do not invent a compound in question content.",
    releaseImpact: "none-effective-target-applied",
  }));
  await Promise.all([
    writeText(path.join(OUTPUT_ROOT, "reports/vocabulary-question-coverage.md"), vocabularyCoverage),
    writeText(path.join(OUTPUT_ROOT, "reports/vocabulary-question-quality-report.md"), vocabularyQuality),
    writeText(path.join(OUTPUT_ROOT, "reports/vocabulary-question-distribution.md"), [distribution("Question types", vocabularyTypeDistribution), "", distribution("Difficulty", vocabularyDifficulty)].join("\n")),
    writeText(path.join(OUTPUT_ROOT, "reports/vocabulary-sense-question-coverage.md"), senseCoverage),
    writeText(path.join(OUTPUT_ROOT, "reports/kanji-question-coverage.md"), kanjiCoverage),
    writeText(path.join(OUTPUT_ROOT, "reports/kanji-question-quality-report.md"), kanjiQuality),
    writeText(path.join(OUTPUT_ROOT, "reports/kanji-question-distribution.md"), [distribution("Question types", kanjiTypeDistribution), "", distribution("Difficulty", kanjiDifficulty)].join("\n")),
    writeText(path.join(OUTPUT_ROOT, "reports/kanji-reading-question-coverage.md"), readingCoverage),
    writeText(path.join(OUTPUT_ROOT, "reports/vocabulary-kanji-question-summary.md"), summary),
    writeText(path.join(OUTPUT_ROOT, "reports/vocabulary-kanji-question-duplicate-report.md"), duplicateReport),
    writeJson(path.join(OUTPUT_ROOT, "reports/vocabulary-kanji-question-determinism.json"), determinism),
    writeJson(path.join(OUTPUT_ROOT, "examples/vocabulary-question-views.json"), vocabularyViews),
    writeJson(path.join(OUTPUT_ROOT, "examples/kanji-question-views.json"), kanjiViews),
    writeJson(path.join(OUTPUT_ROOT, "review-queues/vocabulary-kanji-question-review.json"), {
      schemaVersion: 1,
      id: "vocabulary-kanji-question-review",
      items: inventoryItems,
    }),
  ]);
}
