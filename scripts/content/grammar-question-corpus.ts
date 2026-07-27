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
import type { CurriculumUnit, GrammarRecord } from "./schemas/content-schemas";

const canonicalGrammarQuestionCorpusSchema = z
  .object({
    schemaVersion: z.literal(1),
    fixedTimestamp: z.literal("2026-07-26T00:00:00.000Z"),
    questions: z.array(questionSchema),
    questionOptions: z.array(questionOptionSchema),
    learningItemMetadata: z.array(learningItemMetadataSchema),
    questionTargetRelationships: z.array(questionTargetRelationshipSchema),
  })
  .strict();

export const GRAMMAR_QUESTION_REQUIRED_MINIMUM = 8;

export interface GrammarQuestionCoverageRow {
  grammarId: string;
  level: "N5" | "N4";
  pattern: string;
  releaseReady: boolean;
  approvedExampleSentenceIds: string[];
  curriculumUnitIds: string[];
  approvedQuestionIds: string[];
  recognitionCount: number;
  meaningCount: number;
  usageCount: number;
  contextApplicationCount: number;
  requiredMinimum: number;
  status: "pass" | "gap" | "lifecycle-exclusion";
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareStable);
}

function questionCategory(question: Question): string | undefined {
  return question.tags.find((tag) =>
    ["recognition", "meaning", "usage", "context-application"].includes(tag),
  );
}

export function calculateGrammarQuestionCoverage(
  content: LearningContentCollections,
  grammar: readonly GrammarRecord[],
  curriculumUnits: readonly CurriculumUnit[],
): GrammarQuestionCoverageRow[] {
  const sentenceById = new Map(content.sentences.map((sentence) => [sentence.id, sentence]));
  const questionById = new Map(content.questions.map((question) => [question.id, question]));
  const questionsByGrammar = new Map<string, Question[]>();
  for (const relationship of content.questionTargetRelationships) {
    if (relationship.targetType !== "grammar" || relationship.role !== "primary") continue;
    const question = questionById.get(relationship.questionId);
    if (!question) continue;
    questionsByGrammar.set(relationship.targetId, [
      ...(questionsByGrammar.get(relationship.targetId) ?? []),
      question,
    ]);
  }
  return grammar
    .map((record): GrammarQuestionCoverageRow => {
      const approvedQuestions = (questionsByGrammar.get(record.id) ?? []).filter(
        ({ releaseReady }) => releaseReady,
      );
      const categoryCount = (category: string) =>
        approvedQuestions.filter((question) => questionCategory(question) === category).length;
      const recognitionCount = categoryCount("recognition");
      const meaningCount = categoryCount("meaning");
      const usageCount = categoryCount("usage");
      const contextApplicationCount = categoryCount("context-application");
      const pass =
        approvedQuestions.length >= GRAMMAR_QUESTION_REQUIRED_MINIMUM &&
        recognitionCount >= 2 &&
        meaningCount >= 2 &&
        usageCount >= 2 &&
        contextApplicationCount >= 2;
      return {
        grammarId: record.id,
        level: record.level,
        pattern: record.pattern,
        releaseReady: record.releaseReady,
        approvedExampleSentenceIds: sorted(
          content.grammarExampleViews
            .filter(
              (view) =>
                view.grammarId === record.id &&
                view.role === "focus" &&
                sentenceById.get(view.sentenceId)?.reviewStatus === "approved",
            )
            .map(({ sentenceId }) => sentenceId),
        ),
        curriculumUnitIds: sorted(
          curriculumUnits
            .filter(({ grammarIds, reviewGrammarIds }) =>
              [...grammarIds, ...reviewGrammarIds].includes(record.id),
            )
            .map(({ id }) => id),
        ),
        approvedQuestionIds: sorted(approvedQuestions.map(({ id }) => id)),
        recognitionCount,
        meaningCount,
        usageCount,
        contextApplicationCount,
        requiredMinimum: GRAMMAR_QUESTION_REQUIRED_MINIMUM,
        status: !record.releaseReady ? "lifecycle-exclusion" : pass ? "pass" : "gap",
      };
    })
    .sort((left, right) => compareStable(left.grammarId, right.grammarId));
}

export async function writeGrammarQuestionGapReport(
  coverage: readonly GrammarQuestionCoverageRow[],
  stage: "pre-generation" | "final",
): Promise<void> {
  const releaseTargets = coverage.filter(({ releaseReady }) => releaseReady);
  const report = [
    "# Grammar learning question coverage",
    "",
    `Audit stage: ${stage}.`,
    "",
    `- Canonical grammar records: ${coverage.length}`,
    `- Release targets: ${releaseTargets.length}`,
    `- Lifecycle exclusions: ${coverage.length - releaseTargets.length}`,
    `- Release-target gaps: ${releaseTargets.filter(({ status }) => status === "gap").length}`,
    "",
    "| Grammar ID | Level | Pattern | Release | Examples | Curriculum units | Questions | Recognition | Meaning | Usage | Context | Required | Status |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
    ...coverage.map((row) =>
      `| ${row.grammarId} | ${row.level} | ${row.pattern.replaceAll("|", "\\|")} | ${row.releaseReady ? "ready" : "excluded"} | ${row.approvedExampleSentenceIds.length} | ${row.curriculumUnitIds.length} | ${row.approvedQuestionIds.length} | ${row.recognitionCount} | ${row.meaningCount} | ${row.usageCount} | ${row.contextApplicationCount} | ${row.requiredMinimum} | ${row.status} |`,
    ),
  ].join("\n");
  await Promise.all([
    writeText(path.join(OUTPUT_ROOT, "reports/grammar-question-coverage.md"), report),
    writeJson(path.join(OUTPUT_ROOT, `reports/grammar-question-coverage-${stage}.json`), coverage),
  ]);
}

export function grammarQuestionErrors(
  content: LearningContentCollections,
  grammar: readonly GrammarRecord[],
  curriculumUnits: readonly CurriculumUnit[],
): string[] {
  const errors: string[] = [];
  // Phase 4 validates only its release-ready N4 corpus. Phase 9 development-only
  // N5 questions have their own lifecycle-aware audit and must not be treated as
  // release corpus failures while N5 grammar remains editorially gated.
  const grammarQuestions = content.questions.filter(({ domain, releaseReady }) => domain === "grammar" && releaseReady);
  const questionById = new Map(grammarQuestions.map((question) => [question.id, question]));
  const optionsByQuestion = new Map<string, typeof content.questionOptions>();
  for (const option of content.questionOptions) {
    optionsByQuestion.set(option.questionId, [
      ...(optionsByQuestion.get(option.questionId) ?? []),
      option,
    ]);
  }
  const primaryByQuestion = new Map<string, typeof content.questionTargetRelationships>();
  for (const relationship of content.questionTargetRelationships) {
    if (relationship.role !== "primary") continue;
    primaryByQuestion.set(relationship.questionId, [
      ...(primaryByQuestion.get(relationship.questionId) ?? []),
      relationship,
    ]);
  }
  const prompts = new Map<string, string[]>();
  for (const question of grammarQuestions) {
    prompts.set(question.prompt.text, [...(prompts.get(question.prompt.text) ?? []), question.id]);
    const primary = primaryByQuestion.get(question.id) ?? [];
    if (
      primary.length !== 1 ||
      primary[0]?.targetType !== "grammar"
    ) {
      errors.push(`${question.id} must have exactly one primary grammar target`);
    }
    if (!question.explanation?.includes("Common mistake:")) {
      errors.push(`${question.id} lacks a common-mistake teaching note`);
    }
    const options = optionsByQuestion.get(question.id) ?? [];
    if (options.length !== 4) errors.push(`${question.id} must have exactly four options`);
    const optionContents = options.map(({ content }) => JSON.stringify(content));
    if (new Set(optionContents).size !== optionContents.length) {
      errors.push(`${question.id} contains duplicate option content`);
    }
    if (options.some(({ feedback }) => !feedback)) {
      errors.push(`${question.id} has an option without distractor/correct-answer feedback`);
    }
  }
  for (const [prompt, ids] of prompts) {
    if (ids.length > 1) errors.push(`Duplicate question wording in ${ids.join(", ")}: ${prompt}`);
  }
  for (const row of calculateGrammarQuestionCoverage(content, grammar, curriculumUnits)) {
    if (row.releaseReady && row.status !== "pass") {
      errors.push(`${row.grammarId} has incomplete grammar question coverage`);
    }
    if (!row.releaseReady && row.approvedQuestionIds.length > 0) {
      errors.push(`${row.grammarId} is lifecycle-excluded but has release questions`);
    }
  }
  for (const question of grammarQuestions) {
    if (!questionById.has(question.id)) errors.push(`Missing question ${question.id}`);
  }
  return [...new Set(errors)].sort(compareStable);
}

export async function loadGrammarQuestionCorpus(
  content: LearningContentCollections,
  grammar: readonly GrammarRecord[],
  curriculumUnits: readonly CurriculumUnit[],
): Promise<LearningContentCollections> {
  const canonical = canonicalGrammarQuestionCorpusSchema.parse(
    await readJson<unknown>(SOURCE_PATHS.grammarQuestionCorpus),
  );
  const combined = learningContentCollectionsSchema.parse({
    ...content,
    questions: [...content.questions, ...canonical.questions].sort((left, right) => compareStable(left.id, right.id)),
    questionOptions: [...content.questionOptions, ...canonical.questionOptions].sort(
      (left, right) =>
        compareStable(left.questionId, right.questionId) ||
        left.position - right.position ||
        compareStable(left.id, right.id),
    ),
    learningItemMetadata: [...content.learningItemMetadata, ...canonical.learningItemMetadata].sort(
      (left, right) => compareStable(left.id, right.id),
    ),
    questionTargetRelationships: [
      ...content.questionTargetRelationships,
      ...canonical.questionTargetRelationships,
    ].sort((left, right) => compareStable(left.id, right.id)),
  });
  const errors = grammarQuestionErrors(combined, grammar, curriculumUnits);
  if (errors.length > 0) {
    throw new Error(`Grammar question corpus contains ${errors.length} error(s):\n${errors.slice(0, 25).join("\n")}`);
  }
  return combined;
}

if (isDirectExecution(import.meta.url)) {
  runCli(async () => {
    const [content, n5Grammar, n4Grammar, n5Units, n4Units] = await Promise.all([
      readJson<LearningContentCollections>(path.join(OUTPUT_ROOT, "learning-content/index.json")),
      readJson<GrammarRecord[]>(path.join(OUTPUT_ROOT, "grammar/n5.json")),
      readJson<GrammarRecord[]>(path.join(OUTPUT_ROOT, "grammar/n4.json")),
      readJson<CurriculumUnit[]>(path.join(OUTPUT_ROOT, "curriculum/units-n5.json")),
      readJson<CurriculumUnit[]>(path.join(OUTPUT_ROOT, "curriculum/units-n4.json")),
    ]);
    const coverage = calculateGrammarQuestionCoverage(
      content,
      [...n5Grammar, ...n4Grammar],
      [...n5Units, ...n4Units],
    );
    await writeGrammarQuestionGapReport(coverage, "pre-generation");
    console.log(
      `Grammar question baseline written: ${coverage.filter(({ status }) => status === "gap").length} release-target gaps; ${coverage.filter(({ status }) => status === "lifecycle-exclusion").length} lifecycle exclusions.`,
    );
  });
}
