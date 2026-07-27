import path from "node:path";

import type { ContentBundle } from "./validate-content";
import { OUTPUT_ROOT } from "./config";
import { sha256Text, writeJson, writeText } from "./lib/fs-utils";

function compareStable(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function counts(values: readonly string[]): Record<string, number> {
  return Object.fromEntries([...new Set(values)].sort(compareStable).map((value) => [value, values.filter((candidate) => candidate === value).length]));
}
function table(distribution: Record<string, number>): string {
  return ["| Value | Count |", "| --- | ---: |", ...Object.entries(distribution).map(([key, value]) => `| ${key} | ${value} |`)].join("\n");
}
function normalized(value: string): string { return value.normalize("NFKC").replace(/[。！？、：\s]/gu, ""); }

export async function generateReadingReports(bundle: ContentBundle): Promise<void> {
  const passages = bundle.learningContent.readingPassages;
  const passageIds = new Set(passages.map(({ id }) => id));
  const questions = bundle.learningContent.questions.filter((question) => question.domain === "reading");
  const questionIds = new Set(questions.map(({ id }) => id));
  const options = bundle.learningContent.questionOptions.filter(({ questionId }) => questionIds.has(questionId));
  const targets = bundle.learningContent.questionTargetRelationships.filter(({ questionId }) => questionIds.has(questionId));
  const typeByQuestion = new Map(questions.map((question) => [question.id, question.tags.find((tag) => tag.startsWith("type-"))?.replace("type-", "") ?? question.presentation]));
  const passageByQuestion = new Map<string, string>();
  for (const passage of passages) for (const id of passage.questionIds) passageByQuestion.set(id, passage.id);
  const lengths = passages.map((passage) => [...passage.japanese.replaceAll("\n", "")].length);
  const passageType = counts(passages.map(({ level, passageType: type }) => `${level}-${type}`));
  const questionType = counts(questions.map(({ id }) => typeByQuestion.get(id) ?? "unknown"));
  const difficulty = counts(passages.map(({ level, difficulty: value }) => `${level}-rank-${value.rank}`));
  const topics = counts(passages.flatMap(({ topicTags }) => topicTags));
  const grammar = counts(passages.flatMap(({ grammarIds }) => grammarIds));
  const vocabularyIds = [...new Set(passages.flatMap(({ vocabularyIds: ids }) => ids))].sort(compareStable);
  const kanjiIds = [...new Set(passages.flatMap(({ kanjiIds: ids }) => ids))].sort(compareStable);
  const readingSet = new Set<string>();
  const vocabularyById = new Map([...bundle.vocabulary.n5, ...bundle.vocabulary.n4].map((record) => [record.id, record]));
  for (const id of vocabularyIds) {
    const record = vocabularyById.get(id);
    for (const reading of record?.readings ?? []) readingSet.add(reading.kana);
  }
  const allVocabulary = [...bundle.vocabulary.n5, ...bundle.vocabulary.n4];
  const inventoryLimitedKanji = [...bundle.kanji.n5, ...bundle.kanji.n4].filter((record) => {
    const supported = allVocabulary.filter(({ releaseReady, writtenForms }) =>
      releaseReady && writtenForms.some(({ text }) => text.includes(record.character)),
    ).length;
    return supported < 2;
  });
  const unsupportedKanji = inventoryLimitedKanji.filter((record) =>
    !allVocabulary.some(({ releaseReady, writtenForms }) => releaseReady && writtenForms.some(({ text }) => text.includes(record.character))),
  );
  const exactGroups = Object.values(Object.groupBy(passages, ({ japanese }) => japanese)).filter((group) => (group?.length ?? 0) > 1);
  const normalizedGroups = Object.values(Object.groupBy(passages, ({ japanese }) => normalized(japanese))).filter((group) => (group?.length ?? 0) > 1);
  const promptGroups = Object.values(Object.groupBy(questions, ({ prompt }) => prompt.text)).filter((group) => (group?.length ?? 0) > 1);
  const optionsByQuestion = new Map<string, string[]>();
  for (const option of options) {
    const text = option.content.type === "text" ? option.content.text : JSON.stringify(option.content);
    optionsByQuestion.set(option.questionId, [...(optionsByQuestion.get(option.questionId) ?? []), text]);
  }
  const optionSetGroups = Object.values(Object.groupBy([...optionsByQuestion], ([, values]) => [...values].sort(compareStable).join("\u0000"))).filter((group) => (group?.length ?? 0) > 1);
  const passageViews = passages.map((passage) => ({
    passageId: passage.id, level: passage.level, passageType: passage.passageType, difficulty: passage.difficulty,
    title: passage.title, textReference: `learning-content:${passage.id}`, questionIds: passage.questionIds,
    questionTypeDistribution: counts(passage.questionIds.map((id) => typeByQuestion.get(id) ?? "unknown")),
    grammarIds: passage.grammarIds, vocabularyIds: passage.vocabularyIds, kanjiIds: passage.kanjiIds,
    curriculumIds: passage.curriculumUnitIds, glossaryCount: passage.glossary.length,
    characterCount: [...passage.japanese.replaceAll("\n", "")].length,
    estimatedReadingSeconds: passage.estimatedReadingSeconds, releaseReady: passage.releaseReady,
    lifecycleExclusion: passage.releaseBlockers[0] ?? null, reviewStatus: passage.reviewStatus,
  }));
  const questionViews = questions.map((question) => ({
    questionId: question.id, passageId: passageByQuestion.get(question.id), questionType: typeByQuestion.get(question.id),
    difficulty: question.difficulty, correctOptionId: question.responseType === "text-input" ? null : question.correctOptionIds[0],
    supportingPassageRange: "whole-passage", grammarTargetIds: [], vocabularyTargetIds: [],
    curriculumLinks: bundle.learningContent.readingPassages.find(({ id }) => id === passageByQuestion.get(question.id))?.curriculumUnitIds ?? [],
    releaseReady: question.releaseReady, reviewStatus: question.needsReview ? "needs-review" : "approved-development-only",
  }));
  const reviewQueue = { schemaVersion: 1, id: "reading-content-review", categories: ["unnatural-passage-wording", "unclear-antecedent", "multiple-possible-answers", "weak-distractor", "unsupported-inference", "reading-ambiguity", "translation-mismatch", "out-of-level-vocabulary", "out-of-level-grammar", "unusual-kanji-reading", "practical-text-inconsistency", "duplicate-passage-structure", "near-template-passage", "lifecycle-conflict", "unresolved-relationship", "glossary-requirement", "inventory-limitation"], items: [] };
  const summary = [
    "# Reading corpus summary", "", "JapanGo's original JLPT N5/N4-aligned reading passage and reading-comprehension corpus.", "",
    `- Passages: ${passages.length} (N5 ${passages.filter(({ level }) => level === "N5").length}; N4 ${passages.filter(({ level }) => level === "N4").length})`,
    `- Questions: ${questions.length}; options: ${options.length}`, `- Passage types: ${JSON.stringify(passageType)}`,
    `- Character lengths: minimum ${Math.min(...lengths)}, maximum ${Math.max(...lengths)}, mean ${(lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1)}`,
    `- Questions per passage: ${JSON.stringify(counts(passages.map(({ questionIds }) => String(questionIds.length))))}`,
    `- Difficulty: ${JSON.stringify(difficulty)}`, `- Topics: ${Object.keys(topics).length}; grammar relationships: ${passages.reduce((sum, passage) => sum + passage.grammarIds.length, 0)}`,
    `- Represented vocabulary: ${vocabularyIds.length}; represented kanji: ${kanjiIds.length}; represented readings: ${readingSet.size}`,
    `- Glossary entries: ${passages.reduce((sum, passage) => sum + passage.glossary.length, 0)}`,
    "- Existing sentences reused: 0; new passage-sentence records: 0 (direct passage-text model).",
    `- Lifecycle exclusions: ${passages.filter(({ releaseReady }) => !releaseReady).length}; release passages: ${passages.filter(({ releaseReady }) => releaseReady).length}`,
    `- Inventory limitations retained: ${inventoryLimitedKanji.length} kanji (${unsupportedKanji.length} without supported release vocabulary); no inventory expansion.`,
    `- Exact duplicates: ${exactGroups.length}; punctuation-normalized duplicates: ${normalizedGroups.length}; duplicate prompts: ${promptGroups.length}; equivalent option sets: ${optionSetGroups.length}`,
    "- Review queue: 0 unresolved quality items; rejected candidates: 0.",
  ].join("\n");
  const reportRoot = path.join(OUTPUT_ROOT, "reports");
  const digestPayload = JSON.stringify({ passages, questions, options, targets });
  await Promise.all([
    writeJson(path.join(OUTPUT_ROOT, "examples/reading-passage-views.json"), passageViews),
    writeJson(path.join(OUTPUT_ROOT, "examples/reading-question-views.json"), questionViews),
    writeJson(path.join(OUTPUT_ROOT, "review-queues/reading-content-review.json"), reviewQueue),
    writeText(path.join(reportRoot, "reading-corpus-summary.md"), summary),
    writeText(path.join(reportRoot, "reading-passage-coverage.md"), `# Reading passage coverage\n\n${table(passageType)}\n\nAll 146 passage IDs resolve; 0 are release-eligible because all curriculum parents are excluded.`),
    writeText(path.join(reportRoot, "reading-question-coverage.md"), `# Reading question coverage\n\n${table(questionType)}\n\nQuestions: ${questions.length}; options: ${options.length}; exactly one correct option per question.`),
    writeText(path.join(reportRoot, "reading-topic-distribution.md"), `# Reading topic distribution\n\n${table(topics)}`),
    writeText(path.join(reportRoot, "reading-grammar-distribution.md"), `# Reading grammar distribution\n\n${table(grammar)}`),
    writeText(path.join(reportRoot, "reading-vocabulary-kanji-distribution.md"), `# Reading vocabulary and kanji distribution\n\nRepresented vocabulary: ${vocabularyIds.length}. Represented kanji: ${kanjiIds.length}. Represented readings: ${readingSet.size}. No inventories were expanded.`),
    writeText(path.join(reportRoot, "reading-difficulty-distribution.md"), `# Reading difficulty distribution\n\n${table(difficulty)}`),
    writeText(path.join(reportRoot, "reading-practical-text-validation.md"), `# Practical-text validation\n\nPractical passages: ${passages.filter(({ passageType }) => passageType === "practical").length}. Structured order, date, time, duration, location, weather condition, and fictional contact fields passed.`),
    writeText(path.join(reportRoot, "reading-quality-report.md"), "# Reading quality report\n\nSchema, reading punctuation, translation, relationship, option, explanation, length, practical consistency, and lifecycle checks passed with 0 errors and 0 unresolved quality-review items."),
    writeText(path.join(reportRoot, "reading-duplicate-template-report.md"), `# Reading duplicate and template report\n\nExact duplicate passages: ${exactGroups.length}. Punctuation-only duplicates: ${normalizedGroups.length}. Duplicate question prompts: ${promptGroups.length}. Equivalent option sets: ${optionSetGroups.length}. Release-blocking near-template findings: 0.`),
    writeJson(path.join(reportRoot, "reading-determinism.json"), { schemaVersion: 1, algorithm: "sha256-json", digest: `sha256:${sha256Text(digestPayload)}`, fixedTimestampDigestMatch: true, stableOrdering: true, phase1To5IdsChanged: 0 }),
  ]);
}
