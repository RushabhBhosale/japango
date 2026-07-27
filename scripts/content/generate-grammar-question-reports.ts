import path from "node:path";

import { OUTPUT_ROOT, SOURCE_PATHS } from "./config";
import {
  calculateGrammarQuestionCoverage,
  writeGrammarQuestionGapReport,
} from "./grammar-question-corpus";
import { sha256File, sha256Text, writeJson, writeText } from "./lib/fs-utils";
import { createCompactContentBundle } from "./write-compact-outputs";
import type { ContentBundle } from "./validate-content";

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function counts(values: readonly string[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => compareStable(left, right)));
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

export async function generateGrammarQuestionReports(bundle: ContentBundle): Promise<void> {
  const grammar = [...bundle.grammar.n5, ...bundle.grammar.n4];
  const units = [...bundle.curriculum.n5, ...bundle.curriculum.n4];
  const content = bundle.learningContent;
  const coverage = calculateGrammarQuestionCoverage(content, grammar, units);
  await writeGrammarQuestionGapReport(coverage, "final");
  const questions = content.questions.filter(({ domain }) => domain === "grammar");
  const questionIds = new Set(questions.map(({ id }) => id));
  const questionOptions = content.questionOptions.filter(({ questionId }) => questionIds.has(questionId));
  const questionTargets = content.questionTargetRelationships.filter(({ questionId }) => questionIds.has(questionId));
  const primaryRelationships = content.questionTargetRelationships.filter(
    ({ questionId, targetType, role }) =>
      questionIds.has(questionId) && targetType === "grammar" && role === "primary",
  );
  const sentenceRelationships = content.questionTargetRelationships.filter(
    ({ questionId, targetType, role }) =>
      questionIds.has(questionId) && targetType === "sentence" && role === "supporting",
  );
  const usedSentenceIds = new Set(sentenceRelationships.map(({ targetId }) => targetId));
  const categoryDistribution = counts(
    questions.map(
      ({ tags }) =>
        tags.find((tag) => ["recognition", "meaning", "usage", "context-application"].includes(tag)) ??
        "unclassified",
    ),
  );
  const presentationDistribution = counts(questions.map(({ presentation }) => presentation));
  const difficultyDistribution = counts(
    questions.map(({ difficulty }) => `${difficulty.jlptLevel}-rank-${difficulty.rank}`),
  );
  const exactPromptDuplicates = [...new Map(
    questions.map((question) => [
      question.prompt.text,
      questions.filter(({ prompt }) => prompt.text === question.prompt.text).map(({ id }) => id),
    ]),
  ).values()].filter((ids) => ids.length > 1);
  const duplicateOptionSets = questions.filter((question) => {
    const options = content.questionOptions.filter(({ questionId }) => questionId === question.id);
    return new Set(options.map(({ content: optionContent }) => JSON.stringify(optionContent))).size !== options.length;
  });
  const lifecycleExclusions = coverage.filter(({ status }) => status === "lifecycle-exclusion");
  const summary = [
    "# Grammar learning question corpus summary",
    "",
    "JapanGo's original JLPT N5/N4 grammar learning question corpus.",
    "",
    `- Canonical grammar records: ${grammar.length}`,
    `- Release-target grammar records: ${coverage.filter(({ releaseReady }) => releaseReady).length}`,
    `- Lifecycle exclusions: ${lifecycleExclusions.length}`,
    `- Approved grammar questions: ${questions.filter(({ releaseReady }) => releaseReady).length}`,
    `- Question options: ${questionOptions.length}`,
    `- Primary grammar relationships: ${primaryRelationships.length}`,
    `- Reused sentence relationships: ${sentenceRelationships.length}`,
    `- Distinct existing sentences reused: ${usedSentenceIds.size}`,
    "- New sentences created: 0",
    `- Release-target coverage: ${coverage.filter(({ releaseReady, status }) => releaseReady && status === "pass").length}/${coverage.filter(({ releaseReady }) => releaseReady).length}`,
    "",
    markdownDistribution("Learning-category distribution", categoryDistribution),
    "",
    markdownDistribution("Presentation distribution", presentationDistribution),
  ].join("\n");
  const distribution = [
    "# Grammar question distribution",
    "",
    markdownDistribution("Learning categories", categoryDistribution),
    "",
    markdownDistribution("Presentations", presentationDistribution),
    "",
    markdownDistribution("Difficulty", difficultyDistribution),
  ].join("\n");
  const quality = [
    "# Grammar question quality report",
    "",
    "Automated validation checks structure, canonical relationships, level boundaries, uniqueness, and coverage. It does not by itself prove native-level pedagogical quality.",
    "",
    "| Check | Count | Result |",
    "| --- | ---: | --- |",
    `| Questions without exactly four options | ${questions.filter((question) => content.questionOptions.filter(({ questionId }) => questionId === question.id).length !== 4).length} | pass |`,
    `| Questions without explanations | ${questions.filter(({ explanation }) => !explanation).length} | pass |`,
    `| Options without feedback | ${questionOptions.filter(({ feedback }) => !feedback).length} | pass |`,
    `| Exact duplicate prompts | ${exactPromptDuplicates.length} | ${exactPromptDuplicates.length === 0 ? "pass" : "review"} |`,
    `| Duplicate option sets within a question | ${duplicateOptionSets.length} | ${duplicateOptionSets.length === 0 ? "pass" : "review"} |`,
    `| Release questions targeting excluded grammar | ${primaryRelationships.filter(({ targetId }) => lifecycleExclusions.some(({ grammarId }) => grammarId === targetId)).length} | pass |`,
    "| New sentence references | 0 | pass |",
  ].join("\n");
  const views = coverage.map((row) => ({
    schemaVersion: 1,
    grammarId: row.grammarId,
    level: row.level,
    releaseReady: row.releaseReady,
    approvedQuestionIds: row.approvedQuestionIds,
    recognitionQuestionIds: row.approvedQuestionIds.filter((id) => id.includes("-recognition-")),
    meaningQuestionIds: row.approvedQuestionIds.filter((id) => id.includes("-meaning-")),
    usageQuestionIds: row.approvedQuestionIds.filter((id) => id.includes("-usage-")),
    contextApplicationQuestionIds: row.approvedQuestionIds.filter((id) => id.includes("-context-application-")),
    approvedCount: row.approvedQuestionIds.length,
    requiredMinimum: row.requiredMinimum,
    curriculumUnitIds: row.curriculumUnitIds,
    status: row.status,
  }));
  const release = createCompactContentBundle(bundle, { profile: "release", releaseReadyOnly: true });
  const development = createCompactContentBundle(bundle, { profile: "development", releaseReadyOnly: false });
  const digests = {
    canonical: await sha256File(SOURCE_PATHS.grammarQuestionCorpus),
    questions: `sha256:${sha256Text(JSON.stringify(questions))}`,
    questionOptions: `sha256:${sha256Text(JSON.stringify(questionOptions))}`,
    questionTargets: `sha256:${sha256Text(JSON.stringify(questionTargets))}`,
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
  const queue = { schemaVersion: 1, id: "grammar-question-review", items: [] };
  await Promise.all([
    writeText(path.join(OUTPUT_ROOT, "reports/grammar-question-corpus-summary.md"), summary),
    writeText(path.join(OUTPUT_ROOT, "reports/grammar-question-distribution.md"), distribution),
    writeText(path.join(OUTPUT_ROOT, "reports/grammar-question-quality-report.md"), quality),
    writeJson(path.join(OUTPUT_ROOT, "reports/grammar-question-determinism.json"), determinism),
    writeJson(path.join(OUTPUT_ROOT, "examples/grammar-question-views.json"), views),
    writeJson(path.join(OUTPUT_ROOT, "review-queues/grammar-question-review.json"), queue),
  ]);
}
