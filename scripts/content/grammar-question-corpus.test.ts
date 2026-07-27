import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  learningContentCollectionsSchema,
  type LearningContentCollections,
} from "../../src/features/learning-content/schemas";
import {
  calculateGrammarQuestionCoverage,
  grammarQuestionErrors,
} from "./grammar-question-corpus";
import type { CurriculumUnit, GrammarRecord } from "./schemas/content-schemas";

function json<T>(relativePath: string): T {
  return JSON.parse(readFileSync(relativePath, "utf8")) as T;
}

const content = json<LearningContentCollections>(
  "assets/generated-content/learning-content/index.json",
);
const phase8Bridge = (id: string): boolean => id.includes("grammar-n5-bridge");
const phase4Content: LearningContentCollections = {
  ...content,
  questions: content.questions.filter(({ id }) => !phase8Bridge(id)),
  questionOptions: content.questionOptions.filter(({ id }) => !phase8Bridge(id)),
  questionTargetRelationships: content.questionTargetRelationships.filter(({ id }) => !phase8Bridge(id)),
  learningItemMetadata: content.learningItemMetadata.filter(({ id }) => !phase8Bridge(id)),
};
const grammarQuestions = phase4Content.questions.filter(({ domain }) => domain === "grammar");
const grammarQuestionIds = new Set(grammarQuestions.map(({ id }) => id));
const grammarOptions = content.questionOptions.filter(({ questionId }) => grammarQuestionIds.has(questionId));
const grammar = [
  ...json<GrammarRecord[]>("assets/generated-content/grammar/n5.json"),
  ...json<GrammarRecord[]>("assets/generated-content/grammar/n4.json"),
];
const units = [
  ...json<CurriculumUnit[]>("assets/generated-content/curriculum/units-n5.json"),
  ...json<CurriculumUnit[]>("assets/generated-content/curriculum/units-n4.json"),
];

describe("canonical grammar learning question corpus", () => {
  it("parses the Phase 1 schema with stable unique IDs", () => {
    expect(learningContentCollectionsSchema.safeParse(content).success).toBe(true);
    expect(grammarQuestions).toHaveLength(888);
    expect(grammarOptions).toHaveLength(3552);
    const ids = [
      ...grammarQuestions,
      ...grammarOptions,
      ...content.questionTargetRelationships.filter(({ questionId }) => grammarQuestionIds.has(questionId)),
    ].map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every release-target grammar eight questions in the required distribution", () => {
    const coverage = calculateGrammarQuestionCoverage(phase4Content, grammar, units);
    const releaseTargets = coverage.filter(({ releaseReady }) => releaseReady);
    expect(releaseTargets).toHaveLength(111);
    expect(releaseTargets.every((row) =>
      row.approvedQuestionIds.length === 8 &&
      row.recognitionCount === 2 &&
      row.meaningCount === 2 &&
      row.usageCount === 2 &&
      row.contextApplicationCount === 2 &&
      row.status === "pass",
    )).toBe(true);
  });

  it("preserves lifecycle exclusions without generating release questions for them", () => {
    const coverage = calculateGrammarQuestionCoverage(phase4Content, grammar, units);
    const excluded = coverage.filter(({ status }) => status === "lifecycle-exclusion");
    expect(excluded).toHaveLength(126);
    expect(excluded.every(({ approvedQuestionIds }) => approvedQuestionIds.length === 0)).toBe(true);
  });

  it("uses exactly one primary grammar target and same-level release distractors", () => {
    const grammarById = new Map(grammar.map((record) => [record.id, record]));
    for (const question of grammarQuestions) {
      const relationships = phase4Content.questionTargetRelationships.filter(
        ({ questionId }) => questionId === question.id,
      );
      const primary = relationships.filter(({ role }) => role === "primary");
      expect(primary).toHaveLength(1);
      expect(primary[0]).toMatchObject({ targetType: "grammar" });
      const distractors = relationships.filter(({ role }) => role === "distractor-source");
      expect(distractors).toHaveLength(3);
      expect(distractors.every(({ targetId }) => {
        const record = grammarById.get(targetId);
        return record?.releaseReady && record.level === question.difficulty.jlptLevel;
      })).toBe(true);
    }
  });

  it("reuses approved sentences and creates no new sentence records", () => {
    const n5 = json<LearningContentCollections>(
      "assets/docs-reference/japango-sentences/sentence-corpus-n5.json",
    );
    const n4 = json<LearningContentCollections>(
      "assets/docs-reference/japango-sentences/sentence-corpus-n4.json",
    );
    expect(content.sentences).toHaveLength(n5.sentences.length + n4.sentences.length);
    const sentenceById = new Map(content.sentences.map((sentence) => [sentence.id, sentence]));
    expect(content.questions.every((question) =>
      question.stimulusReferences.every(
        (stimulus) => stimulus.type !== "sentence" || sentenceById.get(stimulus.id)?.reviewStatus === "approved",
      ),
    )).toBe(true);
  });

  it("has unique prompts, distinct options, feedback, and teaching explanations", () => {
    expect(new Set(grammarQuestions.map(({ prompt }) => prompt.text)).size).toBe(grammarQuestions.length);
    for (const question of grammarQuestions) {
      const options = phase4Content.questionOptions.filter(({ questionId }) => questionId === question.id);
      expect(options).toHaveLength(4);
      expect(new Set(options.map(({ content: optionContent }) => JSON.stringify(optionContent))).size).toBe(4);
      expect(options.every(({ feedback }) => Boolean(feedback))).toBe(true);
      expect(question.explanation).toContain("Common mistake:");
    }
  });

  it("passes Phase 4 validation and deterministic cloning", () => {
    expect(grammarQuestionErrors(phase4Content, grammar, units)).toEqual([]);
    expect(JSON.stringify(structuredClone(grammarQuestions))).toBe(JSON.stringify(grammarQuestions));
  });
});
