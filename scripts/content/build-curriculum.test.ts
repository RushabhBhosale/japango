import { describe, expect, it } from "vitest";

import { makeValidContentBundle } from "./__fixtures__/content-bundle";
import {
  buildCurriculumUnits,
  CURRICULUM_UNIT_LIMITS,
  textbookRanks,
} from "./build-curriculum";
import type {
  GrammarRecord,
  KanjiRecord,
  TextbookCurriculumMapping,
  VocabularyRecord,
} from "./schemas/content-schemas";

function vocabularyRecords(count: number, level: "N5" | "N4"): VocabularyRecord[] {
  const base = makeValidContentBundle().vocabulary.n5[0];
  return Array.from({ length: count }, (_, index) => ({
    ...structuredClone(base),
    id: `vocab-${level.toLowerCase()}-${String(index).padStart(3, "0")}`,
    primaryForm: `${level}-word-${index}`,
    kanjiIds: index === 0 ? [`kanji-${level.toLowerCase()}-000`] : [],
    jlpt: { ...structuredClone(base.jlpt), level },
  }));
}

function kanjiRecords(count: number, level: "N5" | "N4"): KanjiRecord[] {
  const base = makeValidContentBundle().kanji.n5[0];
  return Array.from({ length: count }, (_, index) => ({
    ...structuredClone(base),
    id: `kanji-${level.toLowerCase()}-${String(index).padStart(3, "0")}`,
    jlpt: { ...structuredClone(base.jlpt), level },
    vocabularyIds: [],
  }));
}

function grammarRecords(count: number, level: "N5" | "N4"): GrammarRecord[] {
  const base = makeValidContentBundle().grammar.n5[0];
  if (level === "N5") {
    return Array.from({ length: count }, (_, index) => ({
      ...structuredClone(base),
      id: `grammar-n5-${String(index).padStart(3, "0")}`,
      pattern: `N5-pattern-${index}`,
      title: `N5 pattern ${index}`,
      prerequisiteGrammarIds:
        index === 1 ? ["grammar-n5-000"] : [],
    }));
  }
  return Array.from({ length: count }, (_, index) => ({
    id: `grammar-n4-${String(index).padStart(3, "0")}`,
    pattern: `～fixture-${index}`,
    normalizedPattern: `fixture-${index}`,
    romaji: `fixture ${index}`,
    title: `N4 pattern ${index}`,
    meanings: [`fixture meaning ${index}`],
    level: "N4" as const,
    contentType: "grammar-pattern" as const,
    category: "time-and-sequence" as const,
    familyId: `fixture-${index}`,
    alternatePatterns: [],
    formation: [{ base: "plain-form", structure: `Fixture ${index}` }],
    prerequisiteGrammarIds:
      index === 1 ? ["grammar-n4-000"] : [],
    relatedGrammarIds: [],
    confusedWithGrammarIds: [],
    textbookReferences: [],
    editorialSources: [
      {
        name: "Fixture manual curation",
        role: "canonical-classification" as const,
      },
    ],
    confidence: 1,
    reviewStatus: "approved" as const,
    needsReview: false,
    releaseReady: true,
    notes: null,
    curriculumOrder: index + 1,
    extendsGrammarId: null,
  }));
}

describe("deterministic curriculum staging", () => {
  it("uses the bounded textbook map as a deterministic ranking hint", () => {
    const mapping = (lesson: number, page: number, id: string): TextbookCurriculumMapping => ({
      sourceBook: "Fixture",
      sourceFile: "fixture.pdf",
      edition: null,
      lesson,
      lessonStartPage: page,
      lessonEndPage: page + 4,
      lessonHeadingStatus: "detected",
      sourcePages: [page],
      grammarIds: [],
      vocabularyIds: [id],
      kanjiIds: [],
      canonicalHitOccurrences: 1,
      unambiguousHitOccurrences: 1,
      ambiguousHitOccurrences: 0,
      confidence: 0.7,
      verifiedForSequencing: true,
      needsReview: true,
      releaseReady: false,
    });
    const ranks = textbookRanks([
      mapping(2, 40, "vocab-late"),
      mapping(1, 10, "vocab-early"),
    ]);

    expect(ranks.get("vocab-early")).toBeLessThan(ranks.get("vocab-late") ?? 0);
  });

  it("covers every item once while respecting maxima and grammar prerequisites", () => {
    const curriculum = buildCurriculumUnits(
      {
        n5: vocabularyRecords(64, "N5"),
        n4: vocabularyRecords(61, "N4"),
      },
      { n5: kanjiRecords(15, "N5"), n4: kanjiRecords(17, "N4") },
      { n5: grammarRecords(10, "N5"), n4: grammarRecords(5, "N4") },
      [],
    );
    const units = [...curriculum.n5, ...curriculum.n4];
    for (const unit of units) {
      const limits = CURRICULUM_UNIT_LIMITS[unit.level];
      expect(unit.vocabularyIds.length).toBeLessThanOrEqual(limits.vocabulary);
      expect(unit.kanjiIds.length).toBeLessThanOrEqual(limits.kanji);
      expect(unit.grammarIds.length).toBeLessThanOrEqual(limits.grammar);
      expect(unit.learningGoals.length).toBeGreaterThan(0);
      expect(unit.needsReview).toBe(true);
      expect(unit.releaseReady).toBe(false);
    }
    const introduced = units.flatMap((unit) => [
      ...unit.vocabularyIds,
      ...unit.kanjiIds,
      ...unit.grammarIds,
    ]);
    expect(new Set(introduced).size).toBe(introduced.length);
    const prerequisiteUnit = curriculum.n5.find((unit) =>
      unit.grammarIds.includes("grammar-n5-000"),
    );
    const dependentUnit = curriculum.n5.find((unit) =>
      unit.grammarIds.includes("grammar-n5-001"),
    );
    expect(prerequisiteUnit?.order).toBeLessThan(dependentUnit?.order ?? 0);
    expect(curriculum.n4[0].prerequisiteUnitIds).toContain(
      curriculum.n5.at(-1)?.id,
    );
  });

  it("creates 42 N5 grammar-bounded units and marks same-unit kanji vocabulary kana-first", () => {
    const curriculum = buildCurriculumUnits(
      { n5: vocabularyRecords(598, "N5"), n4: vocabularyRecords(554, "N4") },
      { n5: kanjiRecords(79, "N5"), n4: kanjiRecords(166, "N4") },
      { n5: grammarRecords(125, "N5"), n4: [] },
      [],
    );

    expect(curriculum.n5).toHaveLength(42);
    expect(curriculum.n4).toHaveLength(21);
    const firstVocabularyUnit = curriculum.n5.find((unit) =>
      unit.vocabularyIds.includes("vocab-n5-000"),
    );
    expect(firstVocabularyUnit?.kanaFirstVocabularyIds).toContain(
      "vocab-n5-000",
    );
  });

  it("uses reviewed N4 curriculum order before IDs and places prerequisites earlier", () => {
    const n4 = grammarRecords(5, "N4").reverse();
    const curriculum = buildCurriculumUnits(
      { n5: [], n4: [] },
      { n5: [], n4: [] },
      { n5: [], n4 },
      [],
    );
    const introduced = curriculum.n4.flatMap(({ grammarIds }) => grammarIds);

    expect(introduced).toEqual([
      "grammar-n4-000",
      "grammar-n4-001",
      "grammar-n4-002",
      "grammar-n4-003",
      "grammar-n4-004",
    ]);
    const prerequisiteUnit = curriculum.n4.find(({ grammarIds }) =>
      grammarIds.includes("grammar-n4-000"),
    );
    const dependentUnit = curriculum.n4.find(({ grammarIds }) =>
      grammarIds.includes("grammar-n4-001"),
    );
    expect(prerequisiteUnit?.order).toBeLessThan(dependentUnit?.order ?? 0);
  });
});
