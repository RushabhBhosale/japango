import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  learningContentCollectionsSchema,
  type LearningContentCollections,
} from "../../src/features/learning-content/schemas";
import { grammarCoverage, sentenceCorpusErrors } from "./sentence-corpus";
import type {
  CurriculumUnit,
  GrammarRecord,
  KanjiRecord,
  VocabularyRecord,
} from "./schemas/content-schemas";

function json<T>(relativePath: string): T {
  return JSON.parse(readFileSync(relativePath, "utf8")) as T;
}

const n5 = json<LearningContentCollections>(
  "assets/docs-reference/japango-sentences/sentence-corpus-n5.json",
);
const n4 = json<LearningContentCollections>(
  "assets/docs-reference/japango-sentences/sentence-corpus-n4.json",
);
const grammar = [
  ...json<GrammarRecord[]>("assets/generated-content/grammar/n5.json"),
  ...json<GrammarRecord[]>("assets/generated-content/grammar/n4.json"),
];
const units = [
  ...json<CurriculumUnit[]>("assets/generated-content/curriculum/units-n5.json"),
  ...json<CurriculumUnit[]>("assets/generated-content/curriculum/units-n4.json"),
];
const vocabulary = [
  ...json<VocabularyRecord[]>("assets/generated-content/vocabulary/n5.json"),
  ...json<VocabularyRecord[]>("assets/generated-content/vocabulary/n4.json"),
  ...json<VocabularyRecord[]>("assets/generated-content/vocabulary/supplemental.json"),
];
const kanji = [
  ...json<KanjiRecord[]>("assets/generated-content/kanji/n5.json"),
  ...json<KanjiRecord[]>("assets/generated-content/kanji/n4.json"),
];
const content = learningContentCollectionsSchema.parse({
  schemaVersion: 1,
  sentences: [...n5.sentences, ...n4.sentences].sort((a, b) =>
    a.id.localeCompare(b.id, "en"),
  ),
  grammarExampleViews: [...n5.grammarExampleViews, ...n4.grammarExampleViews].sort(
    (a, b) => a.id.localeCompare(b.id, "en"),
  ),
  vocabularyExampleViews: [
    ...n5.vocabularyExampleViews,
    ...n4.vocabularyExampleViews,
  ].sort((a, b) => a.id.localeCompare(b.id, "en")),
  kanjiExampleViews: [...n5.kanjiExampleViews, ...n4.kanjiExampleViews].sort(
    (a, b) => a.id.localeCompare(b.id, "en"),
  ),
  questions: [],
  questionOptions: [],
  learningItemMetadata: [
    ...n5.learningItemMetadata,
    ...n4.learningItemMetadata,
  ].sort((a, b) => a.id.localeCompare(b.id, "en")),
  questionTargetRelationships: [],
});

describe("canonical grammar sentence corpus", () => {
  it("parses the Phase 1 schemas and uses stable, unique IDs", () => {
    expect(learningContentCollectionsSchema.safeParse(n5).success).toBe(true);
    expect(learningContentCollectionsSchema.safeParse(n4).success).toBe(true);
    expect(n5.sentences).toHaveLength(372);
    expect(n4.sentences).toHaveLength(444);
    const ids = content.sentences.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^sentence-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id))).toBe(true);
  });

  it("gives every sentence exactly one primary grammar relationship", () => {
    const focusCounts = new Map<string, number>();
    for (const view of content.grammarExampleViews) {
      if (view.role === "focus") {
        focusCounts.set(view.sentenceId, (focusCounts.get(view.sentenceId) ?? 0) + 1);
      }
    }
    expect(content.sentences.every(({ id }) => focusCounts.get(id) === 1)).toBe(true);
    expect(content.grammarExampleViews.every(({ role }) => role === "focus")).toBe(true);
  });

  it("resolves grammar, vocabulary, kanji, and curriculum relationships", () => {
    const grammarIds = new Set(grammar.map(({ id }) => id));
    const vocabularyIds = new Set(vocabulary.map(({ id }) => id));
    const kanjiIds = new Set(kanji.map(({ id }) => id));
    const unitIds = new Set(units.map(({ id }) => id));
    expect(content.grammarExampleViews.every(({ grammarId }) => grammarIds.has(grammarId))).toBe(true);
    expect(content.vocabularyExampleViews.every(({ vocabularyId }) => vocabularyIds.has(vocabularyId))).toBe(true);
    expect(content.kanjiExampleViews.every(({ kanjiId }) => kanjiIds.has(kanjiId))).toBe(true);
    expect(content.sentences.every(({ curriculumUnitIds }) =>
      curriculumUnitIds.length > 0 && curriculumUnitIds.every((id) => unitIds.has(id)),
    )).toBe(true);
  });

  it("meets approved primary coverage for all N5 and release-ready N4 grammar", () => {
    const rows = grammarCoverage(content, grammar);
    expect(rows).toHaveLength(235);
    expect(rows.every(({ status }) => status === "pass")).toBe(true);
    expect(rows.filter(({ level }) => level === "N5").every(({ approvedPrimaryCount }) => approvedPrimaryCount >= 3)).toBe(true);
    expect(rows.filter(({ level }) => level === "N4").every(({ approvedPrimaryCount }) => approvedPrimaryCount >= 4)).toBe(true);
  });

  it("keeps readings kana-only, translations present, and release profiles separate", () => {
    expect(content.sentences.every(({ reading }) => !/\p{Script=Han}/u.test(reading))).toBe(true);
    expect(content.sentences.every(({ english }) => english.trim().length > 0)).toBe(true);
    expect(n5.sentences.every(({ releaseReady }) => !releaseReady)).toBe(true);
    expect(n4.sentences.every(({ releaseReady }) => releaseReady)).toBe(true);
    expect(content.questions).toEqual([]);
  });

  it("has no exact or punctuation-only duplicates", () => {
    const exact = content.sentences.map(({ japanese }) => japanese);
    const normalized = exact.map((value) =>
      value.normalize("NFKC").replace(/[。！？!?、,\s]/gu, ""),
    );
    expect(new Set(exact).size).toBe(exact.length);
    expect(new Set(normalized).size).toBe(normalized.length);
  });

  it("covers diverse contexts, registers, sentence types, and N4 contrasts", () => {
    const contexts = new Set(content.sentences.flatMap(({ context }) => context.settingTags));
    const registers = new Set(content.sentences.map(({ register }) => register));
    const sentenceTypes = new Set(content.sentences.map(({ sentenceType }) => sentenceType));
    expect(contexts.size).toBeGreaterThanOrEqual(12);
    expect(registers).toEqual(new Set(["honorific", "humble", "plain", "polite"]));
    expect(sentenceTypes.size).toBeGreaterThanOrEqual(7);
    const n4ContrastGrammar = new Set(
      n4.sentences
        .filter(({ tags }) => tags.includes("contrast-aware"))
        .map(({ id }) => n4.grammarExampleViews.find(({ sentenceId }) => sentenceId === id)?.grammarId),
    );
    expect(n4ContrastGrammar.size).toBe(111);
  });

  it("passes corpus-specific validation and remains deterministic after cloning", () => {
    expect(sentenceCorpusErrors(content, { grammar, curriculumUnits: units })).toEqual([]);
    expect(JSON.stringify(structuredClone(content))).toBe(JSON.stringify(content));
  });
});
