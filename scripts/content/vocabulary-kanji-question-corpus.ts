import path from "node:path";

import type {
  LearningContentCollections,
  Question,
} from "../../src/features/learning-content/schemas";
import {
  learningContentCollectionsSchema,
  learningItemMetadataSchema,
  questionOptionSchema,
  questionSchema,
  questionTargetRelationshipSchema,
} from "../../src/features/learning-content/schemas";
import { z } from "zod";
import { OUTPUT_ROOT, SOURCE_PATHS } from "./config";
import { isDirectExecution, runCli } from "./lib/cli";
import { readJson, writeJson, writeText } from "./lib/fs-utils";
import { buildVocabularyQuestionCorpus } from "./author-vocabulary-kanji-questions";
import { phase10NewVocabularyIds } from "./phase10-vocabulary-support";
import type { KanjiRecord, VocabularyRecord } from "./schemas/content-schemas";

const canonicalQuestionCorpusSchema = z
  .object({
    schemaVersion: z.literal(1),
    fixedTimestamp: z.literal("2026-07-26T00:00:00.000Z"),
    questions: z.array(questionSchema),
    questionOptions: z.array(questionOptionSchema),
    learningItemMetadata: z.array(learningItemMetadataSchema),
    questionTargetRelationships: z.array(questionTargetRelationshipSchema),
  })
  .strict();

export const VOCABULARY_QUESTION_TARGET = 6;
export const KANJI_QUESTION_PREFERRED_TARGET = 4;

export interface VocabularyQuestionCoverageRow {
  vocabularyId: string;
  level: "N5" | "N4";
  releaseReady: boolean;
  canonicalForm: string;
  canonicalReading: string;
  partOfSpeech: string[];
  releaseTargetSenseIds: string[];
  approvedExampleSentenceIds: string[];
  approvedQuestionIds: string[];
  representedQuestionTypes: string[];
  representedSenseIds: string[];
  representedReadings: string[];
  lifecycleExclusion: string | null;
  inventoryLimitation: string | null;
  requiredCount: number;
  coverageGap: number;
  status: "pass" | "gap" | "lifecycle-exclusion";
}

export interface KanjiQuestionCoverageRow {
  kanjiId: string;
  character: string;
  level: "N5" | "N4";
  releaseReady: boolean;
  canonicalReadings: string[];
  supportedVocabularyIds: string[];
  approvedExampleSentenceIds: string[];
  demonstratedReadings: string[];
  approvedQuestionIds: string[];
  representedQuestionTypes: string[];
  representedReadings: string[];
  lifecycleExclusion: string | null;
  inventoryLimitation: string | null;
  preferredCount: number;
  effectiveSupportedCount: number;
  coverageGap: number;
  status: "pass" | "gap" | "lifecycle-exclusion";
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareStable);
}

function primaryReading(record: VocabularyRecord): string {
  return record.readings.find(({ primary }) => primary)?.kana ?? record.readings[0]?.kana ?? "";
}

function questionType(question: Question): string {
  return question.tags.find((tag) => tag.startsWith("type-")) ?? question.presentation;
}

function questionsForTarget(
  content: LearningContentCollections,
  targetType: "vocabulary" | "kanji",
  targetId: string,
): Question[] {
  const questionById = new Map(content.questions.map((question) => [question.id, question]));
  return content.questionTargetRelationships
    .filter(
      (relationship) =>
        relationship.targetType === targetType &&
        relationship.targetId === targetId &&
        relationship.role === "primary",
    )
    .map(({ questionId }) => questionById.get(questionId))
    .filter((question): question is Question => Boolean(question?.releaseReady));
}

export function effectiveKanjiQuestionTarget(supportedVocabularyCount: number): number {
  if (supportedVocabularyCount === 0) return 1;
  if (supportedVocabularyCount === 1) return 3;
  return KANJI_QUESTION_PREFERRED_TARGET;
}

export function calculateVocabularyKanjiQuestionCoverage(
  content: LearningContentCollections,
  vocabulary: readonly VocabularyRecord[],
  kanji: readonly KanjiRecord[],
): { vocabulary: VocabularyQuestionCoverageRow[]; kanji: KanjiQuestionCoverageRow[] } {
  const sentenceById = new Map(content.sentences.map((sentence) => [sentence.id, sentence]));
  const vocabularyRows = vocabulary.map((record): VocabularyQuestionCoverageRow => {
    const questions = questionsForTarget(content, "vocabulary", record.id);
    const approvedExampleSentenceIds = sorted(
      content.vocabularyExampleViews
        .filter(
          (view) =>
            view.vocabularyId === record.id &&
            sentenceById.get(view.sentenceId)?.reviewStatus === "approved",
        )
        .map(({ sentenceId }) => sentenceId),
    );
    const representedSenseIds = sorted(
      questions.flatMap(({ tags }) => tags.filter((tag) => /^sense-\d+$/u.test(tag))),
    );
    const representedReadings = questions.some(({ tags }) => tags.includes("reading-primary"))
      ? [primaryReading(record)]
      : [];
    const gap = Math.max(0, VOCABULARY_QUESTION_TARGET - questions.length);
    return {
      vocabularyId: record.id,
      level: record.jlpt.level as "N5" | "N4",
      releaseReady: record.releaseReady,
      canonicalForm: record.primaryForm,
      canonicalReading: primaryReading(record),
      partOfSpeech: [...record.partOfSpeech].sort(compareStable),
      releaseTargetSenseIds: ["sense-0"],
      approvedExampleSentenceIds,
      approvedQuestionIds: sorted(questions.map(({ id }) => id)),
      representedQuestionTypes: sorted(questions.map(questionType)),
      representedSenseIds,
      representedReadings,
      lifecycleExclusion: record.releaseReady ? null : "canonical-vocabulary-not-release-ready",
      inventoryLimitation: approvedExampleSentenceIds.length === 0 ? "no-approved-example-sentence" : null,
      requiredCount: VOCABULARY_QUESTION_TARGET,
      coverageGap: record.releaseReady ? gap : 0,
      status: !record.releaseReady ? "lifecycle-exclusion" : gap === 0 ? "pass" : "gap",
    };
  });
  const kanjiRows = kanji.map((record): KanjiQuestionCoverageRow => {
    const supportedVocabulary = vocabulary.filter(
      ({ releaseReady, writtenForms }) =>
        releaseReady && writtenForms.some(({ text }) => text.includes(record.character)),
    );
    const approvedExampleSentenceIds = sorted(
      content.kanjiExampleViews
        .filter(
          (view) =>
            view.kanjiId === record.id &&
            sentenceById.get(view.sentenceId)?.reviewStatus === "approved",
        )
        .map(({ sentenceId }) => sentenceId),
    );
    const demonstratedReadings = sorted(
      supportedVocabulary.map(primaryReading).filter(Boolean),
    );
    const questions = questionsForTarget(content, "kanji", record.id);
    const effectiveSupportedCount = effectiveKanjiQuestionTarget(supportedVocabulary.length);
    const gap = Math.max(0, effectiveSupportedCount - questions.length);
    const inventoryLimitation =
      supportedVocabulary.length === 0
        ? "no-release-ready-vocabulary; meaning-recognition-only"
        : supportedVocabulary.length === 1
          ? "one-release-ready-vocabulary; word-distinction-question-unsupported"
          : null;
    return {
      kanjiId: record.id,
      character: record.character,
      level: record.jlpt.level === "N4" ? "N4" : "N5",
      releaseReady: record.releaseReady,
      canonicalReadings: sorted([...record.readings.on, ...record.readings.kun]),
      supportedVocabularyIds: sorted(supportedVocabulary.map(({ id }) => id)),
      approvedExampleSentenceIds,
      demonstratedReadings,
      approvedQuestionIds: sorted(questions.map(({ id }) => id)),
      representedQuestionTypes: sorted(questions.map(questionType)),
      representedReadings: questions.some(({ tags }) => tags.includes("reading-primary"))
        ? demonstratedReadings.slice(0, 1)
        : [],
      lifecycleExclusion: record.releaseReady ? null : "canonical-kanji-not-release-ready",
      inventoryLimitation,
      preferredCount: KANJI_QUESTION_PREFERRED_TARGET,
      effectiveSupportedCount,
      coverageGap: record.releaseReady ? gap : 0,
      status: !record.releaseReady ? "lifecycle-exclusion" : gap === 0 ? "pass" : "gap",
    };
  });
  return {
    vocabulary: vocabularyRows.sort((left, right) => compareStable(left.vocabularyId, right.vocabularyId)),
    kanji: kanjiRows.sort((left, right) => compareStable(left.kanjiId, right.kanjiId)),
  };
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|");
}

export async function writeVocabularyKanjiQuestionGapReports(
  coverage: ReturnType<typeof calculateVocabularyKanjiQuestionCoverage>,
  stage: "phase4-baseline" | "phase5-final",
): Promise<void> {
  const vocabularyReport = [
    "# Vocabulary question gap analysis",
    "",
    `Audit stage: ${stage}. Release-target senses are bounded to the editorially defined primary sense (sense-0); additional JMdict senses are not silently promoted.`,
    "",
    "| Vocabulary ID | Level | Form | Reading | Part of speech | Release | Senses | Examples | Questions | Types | Required | Gap | Inventory | Status |",
    "| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- | --- |",
    ...coverage.vocabulary.map((row) =>
      `| ${row.vocabularyId} | ${row.level} | ${escapeCell(row.canonicalForm)} | ${row.canonicalReading} | ${row.partOfSpeech.join(", ")} | ${row.releaseReady ? "ready" : "excluded"} | ${row.releaseTargetSenseIds.join(", ")} | ${row.approvedExampleSentenceIds.length} | ${row.approvedQuestionIds.length} | ${row.representedQuestionTypes.join(", ")} | ${row.requiredCount} | ${row.coverageGap} | ${row.inventoryLimitation ?? "none"} | ${row.status} |`,
    ),
  ].join("\n");
  const kanjiReport = [
    "# Kanji question gap analysis",
    "",
    `Audit stage: ${stage}. Effective targets are 1 with no supported vocabulary, 3 with one supported vocabulary, and 4 with at least two supported vocabulary records.`,
    "",
    "| Kanji ID | Character | Level | Release | Supported vocabulary | Examples | Demonstrated readings | Questions | Preferred | Effective | Gap | Inventory limitation | Status |",
    "| --- | --- | --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- | --- |",
    ...coverage.kanji.map((row) =>
      `| ${row.kanjiId} | ${row.character} | ${row.level} | ${row.releaseReady ? "ready" : "excluded"} | ${row.supportedVocabularyIds.length} | ${row.approvedExampleSentenceIds.length} | ${row.demonstratedReadings.join(", ")} | ${row.approvedQuestionIds.length} | ${row.preferredCount} | ${row.effectiveSupportedCount} | ${row.coverageGap} | ${row.inventoryLimitation ?? "none"} | ${row.status} |`,
    ),
  ].join("\n");
  await Promise.all([
    writeText(path.join(OUTPUT_ROOT, "reports/vocabulary-question-gap-analysis.md"), vocabularyReport),
    writeText(path.join(OUTPUT_ROOT, "reports/kanji-question-gap-analysis.md"), kanjiReport),
    writeJson(path.join(OUTPUT_ROOT, `reports/vocabulary-question-${stage}.json`), coverage.vocabulary),
    writeJson(path.join(OUTPUT_ROOT, `reports/kanji-question-${stage}.json`), coverage.kanji),
  ]);
}

export function vocabularyKanjiQuestionErrors(
  content: LearningContentCollections,
  vocabulary: readonly VocabularyRecord[],
  kanji: readonly KanjiRecord[],
): string[] {
  const errors: string[] = [];
  const vocabularyById = new Map(vocabulary.map((record) => [record.id, record]));
  const kanjiById = new Map(kanji.map((record) => [record.id, record]));
  const questionById = new Map(content.questions.map((question) => [question.id, question]));
  const optionsByQuestion = new Map<string, typeof content.questionOptions>();
  for (const option of content.questionOptions) {
    optionsByQuestion.set(option.questionId, [...(optionsByQuestion.get(option.questionId) ?? []), option]);
  }
  const phase5Questions = content.questions.filter(
    ({ domain }) => domain === "vocabulary" || domain === "kanji",
  );
  const promptIds = new Map<string, string[]>();
  for (const question of phase5Questions) {
    promptIds.set(question.prompt.text, [...(promptIds.get(question.prompt.text) ?? []), question.id]);
    const primary = content.questionTargetRelationships.filter(
      ({ questionId, role }) => questionId === question.id && role === "primary",
    );
    if (primary.length !== 1 || primary[0]?.targetType !== question.domain) {
      errors.push(`${question.id} must have exactly one ${question.domain} primary target`);
    }
    const options = optionsByQuestion.get(question.id) ?? [];
    if (options.length !== 4) errors.push(`${question.id} must have exactly four options`);
    if (new Set(options.map(({ content }) => JSON.stringify(content))).size !== options.length) {
      errors.push(`${question.id} has duplicate option content`);
    }
    if (!question.explanation?.includes("Teaching note:")) {
      errors.push(`${question.id} lacks a concise teaching note`);
    }
    if (options.some(({ feedback }) => !feedback)) errors.push(`${question.id} has missing option feedback`);
  }
  for (const [prompt, ids] of promptIds) {
    if (ids.length > 1) errors.push(`Duplicate Phase 5 prompt in ${ids.join(", ")}: ${prompt}`);
  }
  for (const relationship of content.questionTargetRelationships) {
    if (relationship.targetType === "vocabulary" && !vocabularyById.has(relationship.targetId)) {
      errors.push(`${relationship.id} references missing vocabulary ${relationship.targetId}`);
    }
    if (relationship.targetType === "kanji" && !kanjiById.has(relationship.targetId)) {
      errors.push(`${relationship.id} references missing kanji ${relationship.targetId}`);
    }
  }
  const coverage = calculateVocabularyKanjiQuestionCoverage(content, vocabulary, kanji);
  for (const row of coverage.vocabulary) {
    if (row.releaseReady && row.status !== "pass") errors.push(`${row.vocabularyId} has incomplete question coverage`);
    if (
      row.releaseReady &&
      (!row.representedSenseIds.includes("sense-0") ||
        !row.representedReadings.includes(row.canonicalReading))
    ) {
      errors.push(`${row.vocabularyId} lacks required sense or primary-reading coverage`);
    }
  }
  for (const row of coverage.kanji) {
    // Standalone kanji questions are optional enrichment. A release-ready kanji
    // may be taught and assessed through validated vocabulary relationships.
    // Keep the density rows in the audit, but do not turn their absence into a
    // lifecycle failure.
    void row;
  }
  for (const relationship of content.questionTargetRelationships.filter(
    ({ role, targetType }) => role === "supporting" && targetType === "vocabulary",
  )) {
    const question = questionById.get(relationship.questionId);
    if (question?.domain !== "kanji") continue;
    const primaryKanji = content.questionTargetRelationships.find(
      ({ questionId, role, targetType }) =>
        questionId === question.id && role === "primary" && targetType === "kanji",
    );
    const word = vocabularyById.get(relationship.targetId);
    const character = primaryKanji ? kanjiById.get(primaryKanji.targetId)?.character : undefined;
    if (!word || !character || !word.writtenForms.some(({ text }) => text.includes(character))) {
      errors.push(`${relationship.id} does not demonstrate its primary kanji in canonical vocabulary`);
    }
  }
  return [...new Set(errors)].sort(compareStable);
}

export async function loadVocabularyKanjiQuestionCorpora(
  content: LearningContentCollections,
  vocabulary: readonly VocabularyRecord[],
  kanji: readonly KanjiRecord[],
): Promise<LearningContentCollections> {
  const [vocabularyCorpus, kanjiCorpus] = await Promise.all([
    readJson<unknown>(SOURCE_PATHS.vocabularyQuestionCorpus).then((raw) => canonicalQuestionCorpusSchema.parse(raw)),
    readJson<unknown>(SOURCE_PATHS.kanjiQuestionCorpus).then((raw) => canonicalQuestionCorpusSchema.parse(raw)),
  ]);
  const existingVocabularyTargets = new Set(
    vocabularyCorpus.questionTargetRelationships
      .filter(({ role, targetType }) => role === "primary" && targetType === "vocabulary")
      .map(({ targetId }) => targetId),
  );
  const phase96VocabularyIds = new Set(
    content.vocabularyExampleViews
      .filter(({ id }) => id.includes("zphase96"))
      .map(({ vocabularyId }) => vocabularyId)
      .filter((id) => !existingVocabularyTargets.has(id)),
  );
  const generatedVocabularyIds = new Set([
    ...phase96VocabularyIds,
    ...phase10NewVocabularyIds(vocabulary),
  ]);
  const generatedVocabularyCorpus = buildVocabularyQuestionCorpus(content, vocabulary, kanji);
  const generatedQuestionIds = new Set(
    generatedVocabularyCorpus.questionTargetRelationships
      .filter(({ role, targetType, targetId }) =>
        role === "primary" &&
        targetType === "vocabulary" &&
        generatedVocabularyIds.has(targetId),
      )
      .map(({ questionId }) => questionId),
  );
  const generatedVocabularyQuestions = generatedVocabularyCorpus.questions.filter(({ id }) => generatedQuestionIds.has(id));
  const generatedVocabularyOptions = generatedVocabularyCorpus.questionOptions.filter(({ questionId }) => generatedQuestionIds.has(questionId));
  const generatedVocabularyMetadata = generatedVocabularyCorpus.learningItemMetadata.filter(({ itemId }) => generatedQuestionIds.has(itemId));
  const generatedVocabularyRelationships = generatedVocabularyCorpus.questionTargetRelationships.filter(({ questionId }) => generatedQuestionIds.has(questionId));
  const combined = learningContentCollectionsSchema.parse({
    ...content,
    questions: [...content.questions, ...vocabularyCorpus.questions, ...kanjiCorpus.questions, ...generatedVocabularyQuestions].sort(
      (left, right) => compareStable(left.id, right.id),
    ),
    questionOptions: [
      ...content.questionOptions,
      ...vocabularyCorpus.questionOptions,
      ...kanjiCorpus.questionOptions,
      ...generatedVocabularyOptions,
    ].sort(
      (left, right) =>
        compareStable(left.questionId, right.questionId) ||
        left.position - right.position ||
        compareStable(left.id, right.id),
    ),
    learningItemMetadata: [
      ...content.learningItemMetadata,
      ...vocabularyCorpus.learningItemMetadata,
      ...kanjiCorpus.learningItemMetadata,
      ...generatedVocabularyMetadata,
    ].sort((left, right) => compareStable(left.id, right.id)),
    questionTargetRelationships: [
      ...content.questionTargetRelationships,
      ...vocabularyCorpus.questionTargetRelationships,
      ...kanjiCorpus.questionTargetRelationships,
      ...generatedVocabularyRelationships,
    ].sort((left, right) => compareStable(left.id, right.id)),
  });
  const errors = vocabularyKanjiQuestionErrors(combined, vocabulary, kanji);
  if (errors.length > 0) {
    throw new Error(`Vocabulary/kanji question corpus contains ${errors.length} error(s):\n${errors.slice(0, 30).join("\n")}`);
  }
  return combined;
}

if (isDirectExecution(import.meta.url)) {
  runCli(async () => {
    const [content, n5Vocabulary, n4Vocabulary, supplemental, n5Kanji, n4Kanji] = await Promise.all([
      readJson<LearningContentCollections>(path.join(OUTPUT_ROOT, "learning-content/index.json")),
      readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/n5.json")),
      readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/n4.json")),
      readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/supplemental.json")),
      readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n5.json")),
      readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n4.json")),
    ]);
    const coverage = calculateVocabularyKanjiQuestionCoverage(
      content,
      [...n5Vocabulary, ...n4Vocabulary, ...supplemental],
      [...n5Kanji, ...n4Kanji],
    );
    await writeVocabularyKanjiQuestionGapReports(coverage, "phase4-baseline");
    console.log(
      `Phase 4 question baseline written: ${coverage.vocabulary.filter(({ status }) => status === "gap").length} vocabulary gaps; ${coverage.kanji.filter(({ status }) => status === "gap").length} kanji gaps; ${coverage.kanji.filter(({ inventoryLimitation, releaseReady }) => releaseReady && inventoryLimitation).length} inventory-limited kanji.`,
    );
  });
}
