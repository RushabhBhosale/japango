import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  learningContentCollectionsSchema,
  type LearningContentCollections,
} from "../../src/features/learning-content/schemas";
import type { KanjiRecord, VocabularyRecord } from "./schemas/content-schemas";
import {
  calculateVocabularyKanjiQuestionCoverage,
  effectiveKanjiQuestionTarget,
  vocabularyKanjiQuestionErrors,
} from "./vocabulary-kanji-question-corpus";

function json<T>(relativePath: string): T {
  return JSON.parse(readFileSync(relativePath, "utf8")) as T;
}

const content = json<LearningContentCollections>("assets/generated-content/learning-content/index.json");
const vocabulary = [
  ...json<VocabularyRecord[]>("assets/generated-content/vocabulary/n5.json"),
  ...json<VocabularyRecord[]>("assets/generated-content/vocabulary/n4.json"),
  ...json<VocabularyRecord[]>("assets/generated-content/vocabulary/supplemental.json"),
];
const kanji = [
  ...json<KanjiRecord[]>("assets/generated-content/kanji/n5.json"),
  ...json<KanjiRecord[]>("assets/generated-content/kanji/n4.json"),
];
const phase5Questions = content.questions.filter(
  ({ domain }) => domain === "vocabulary" || domain === "kanji",
);
const phase5QuestionIds = new Set(phase5Questions.map(({ id }) => id));

describe("canonical vocabulary and kanji learning question corpus", () => {
  it("parses the shared Phase 1 schema with deterministic unique IDs", () => {
    expect(learningContentCollectionsSchema.safeParse(content).success).toBe(true);
    expect(content.questions.filter(({ domain }) => domain === "vocabulary")).toHaveLength(10_440);
    expect(content.questions.filter(({ domain }) => domain === "kanji")).toHaveLength(836);
    const ids = [
      ...phase5Questions,
      ...content.questionOptions.filter(({ questionId }) => phase5QuestionIds.has(questionId)),
      ...content.questionTargetRelationships.filter(({ questionId }) => phase5QuestionIds.has(questionId)),
    ].map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every release vocabulary six questions with sense and reading coverage", () => {
    const coverage = calculateVocabularyKanjiQuestionCoverage(content, vocabulary, kanji);
    const releaseTargets = coverage.vocabulary.filter(({ releaseReady }) => releaseReady);
    expect(releaseTargets).toHaveLength(1740);
    expect(releaseTargets.every((row) =>
      row.approvedQuestionIds.length === 6 &&
      row.representedSenseIds.includes("sense-0") &&
      row.representedReadings.includes(row.canonicalReading) &&
      row.status === "pass",
    )).toBe(true);
  }, 30_000);

  it("calculates inventory-bounded kanji targets without inventing vocabulary", () => {
    expect(effectiveKanjiQuestionTarget(0)).toBe(1);
    expect(effectiveKanjiQuestionTarget(1)).toBe(3);
    expect(effectiveKanjiQuestionTarget(2)).toBe(4);
    const coverage = calculateVocabularyKanjiQuestionCoverage(content, vocabulary, kanji);
    const releaseTargets = coverage.kanji.filter(({ releaseReady }) => releaseReady);
    const phase5Targets = releaseTargets.filter(({ kanjiId }) => kanji.find(({ id }) => id === kanjiId)?.confidence !== 0.95);
    expect(releaseTargets).toHaveLength(268);
    expect(phase5Targets).toHaveLength(223);
    expect(phase5Targets.filter(({ inventoryLimitation }) => inventoryLimitation)).toHaveLength(30);
    // Additional vocabulary can improve a kanji's available word inventory
    // without requiring new standalone kanji questions. The learning engine
    // may assess that word directly, so ensure only that no question claims
    // more inventory support than the canonical catalog can provide.
    expect(phase5Targets.every((row) =>
      row.approvedQuestionIds.length <= row.effectiveSupportedCount &&
      (row.status === "pass" || row.status === "gap"),
    )).toBe(true);
  });

  it("uses one domain-matching primary target and exactly one correct option", () => {
    for (const question of phase5Questions) {
      const relationships = content.questionTargetRelationships.filter(({ questionId }) => questionId === question.id);
      const primary = relationships.filter(({ role }) => role === "primary");
      expect(primary).toHaveLength(1);
      expect(primary[0]?.targetType).toBe(question.domain);
      expect(question.responseType).toBe("single-select");
      if (question.responseType === "single-select") expect(question.correctOptionIds).toHaveLength(1);
      const options = content.questionOptions.filter(({ questionId }) => questionId === question.id);
      expect(options).toHaveLength(4);
      expect(new Set(options.map(({ content: optionContent }) => JSON.stringify(optionContent))).size).toBe(4);
    }
  }, 15_000);

  it("grounds kanji supporting words in canonical written forms", () => {
    const vocabularyById = new Map(vocabulary.map((record) => [record.id, record]));
    const kanjiById = new Map(kanji.map((record) => [record.id, record]));
    for (const question of phase5Questions.filter(({ domain }) => domain === "kanji")) {
      const relationships = content.questionTargetRelationships.filter(({ questionId }) => questionId === question.id);
      const primary = relationships.find(({ role, targetType }) => role === "primary" && targetType === "kanji");
      const character = primary ? kanjiById.get(primary.targetId)?.character : undefined;
      for (const relationship of relationships.filter(({ role, targetType }) => role === "supporting" && targetType === "vocabulary")) {
        expect(vocabularyById.get(relationship.targetId)?.writtenForms.some(({ text }) => text.includes(character!))).toBe(true);
      }
    }
  });

  it("preserves Phase 2 and Phase 4 IDs while including narrow Phase 9.6 support sentences", () => {
    const n5Sentences = json<LearningContentCollections>("assets/docs-reference/japango-sentences/sentence-corpus-n5.json");
    const n4Sentences = json<LearningContentCollections>("assets/docs-reference/japango-sentences/sentence-corpus-n4.json");
    const phase10Sentences = content.sentences.filter(({ id }) => id.startsWith("sentence-n4-phase10-"));
    expect(content.sentences).toHaveLength(
      n5Sentences.sentences.length + n4Sentences.sentences.length + 30 + phase10Sentences.length,
    );
    expect(phase10Sentences.length).toBeGreaterThan(0);
    const grammarCorpus = json<{ questions: Array<{ id: string }> }>("assets/docs-reference/japango-questions/grammar-question-corpus.json");
    const generatedIds = new Set(content.questions.map(({ id }) => id));
    expect(grammarCorpus.questions.every(({ id }) => generatedIds.has(id))).toBe(true);
  });

  it("has no exact duplicate prompts and passes Phase 5 validation", () => {
    expect(new Set(phase5Questions.map(({ prompt }) => prompt.text)).size).toBe(phase5Questions.length);
    expect(vocabularyKanjiQuestionErrors(content, vocabulary, kanji)).toEqual([]);
  }, 30_000);
});
