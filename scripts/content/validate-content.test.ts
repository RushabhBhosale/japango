import { describe, expect, it } from "vitest";

import { makeValidContentBundle } from "./__fixtures__/content-bundle";
import {
  duplicateValues,
  prerequisiteCycles,
  validateContentBundle,
} from "./validate-content";

describe("duplicate and prerequisite validation", () => {
  it("returns each duplicate once in deterministic order", () => {
    expect(duplicateValues(["b", "a", "b", "a", "a", "c"])).toEqual([
      "a",
      "b",
    ]);
  });

  it("detects multi-node and self-referential prerequisite cycles", () => {
    expect(
      prerequisiteCycles([
        { id: "a", prerequisiteUnitIds: ["b"] },
        { id: "b", prerequisiteUnitIds: ["c"] },
        { id: "c", prerequisiteUnitIds: ["a"] },
        { id: "d", prerequisiteUnitIds: ["d"] },
      ]),
    ).toEqual([
      ["a", "b", "c", "a"],
      ["d", "d"],
    ]);
    expect(
      prerequisiteCycles([
        { id: "a", prerequisiteUnitIds: [] },
        { id: "b", prerequisiteUnitIds: ["a"] },
      ]),
    ).toEqual([]);
  });
});

describe("content-bundle reference validation", () => {
  it("accepts a minimal fully linked canonical bundle", async () => {
    const result = await validateContentBundle(makeValidContentBundle());

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      "N4 grammar output is empty because no N4 grammar mapping source was supplied.",
      "Textbook curriculum mapping is empty because no local OCR cache is available.",
    ]);
  });

  it("reports duplicate generated IDs", async () => {
    const bundle = makeValidContentBundle();
    bundle.vocabulary.n4.push(structuredClone(bundle.vocabulary.n5[0]));

    const result = await validateContentBundle(bundle);

    expect(result.errors).toContain(
      "Duplicate generated ID: vocab-食べる-たべる",
    );
  });

  it("reports broken cross-record and source references", async () => {
    const bundle = makeValidContentBundle();
    bundle.vocabulary.n5[0].kanjiIds = ["kanji-missing"];
    bundle.kanji.n5[0].vocabularyIds = ["vocab-missing"];
    bundle.grammar.n5[0].relatedGrammarIds = ["grammar-missing"];
    bundle.curriculum.n5[0].prerequisiteUnitIds = ["n5-unit-999"];
    bundle.curriculum.n5[0].sourceReferences.push({
      sourceId: "missing-source",
    });

    const result = await validateContentBundle(bundle);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        "vocab-食べる-たべる references missing kanji kanji-missing",
        "kanji-食 references missing vocabulary vocab-missing",
        "grammar-desu references missing grammar grammar-missing",
        "n5-unit-001 references missing prerequisite unit n5-unit-999",
        "n5-unit-001 references unknown source missing-source",
      ]),
    );
  });

  it("validates future learning metadata against canonical item IDs", async () => {
    const bundle = makeValidContentBundle();
    bundle.learningContent.learningItemMetadata.push({
      schemaVersion: 1,
      id: "learning-item-grammar-test-placeholder",
      itemType: "grammar",
      itemId: "grammar-missing",
      reviewable: true,
      skills: [],
      availableModes: [],
      estimatedReviewSeconds: null,
      tags: ["test-placeholder"],
      confidence: 0.5,
      needsReview: true,
      releaseReady: false,
    });

    const result = await validateContentBundle(bundle);

    expect(result.errors).toContain(
      "learning-item-grammar-test-placeholder references missing grammar grammar-missing",
    );
  });

  it("rejects a curriculum cycle through the complete bundle validator", async () => {
    const bundle = makeValidContentBundle();
    const secondUnit = structuredClone(bundle.curriculum.n5[0]);
    secondUnit.id = "n5-unit-002";
    secondUnit.order = 2;
    secondUnit.prerequisiteUnitIds = ["n5-unit-001"];
    bundle.curriculum.n5[0].prerequisiteUnitIds = ["n5-unit-002"];
    bundle.curriculum.n5.push(secondUnit);

    const result = await validateContentBundle(bundle);

    expect(result.errors).toContain(
      "Curriculum prerequisite cycle: n5-unit-001 -> n5-unit-002 -> n5-unit-001",
    );
  });

  it("rejects release-ready records with unresolved confidence", async () => {
    const bundle = makeValidContentBundle();
    bundle.vocabulary.n5[0].confidence = 0.5;
    bundle.vocabulary.n5[0].needsReview = true;

    const result = await validateContentBundle(bundle);

    expect(result.errors).toContain(
      "vocab-食べる-たべる is release-ready despite unresolved or low-confidence data",
    );
  });

  it("rejects unit-size overflow and duplicate new-content assignments", async () => {
    const bundle = makeValidContentBundle();
    bundle.curriculum.n5[0].vocabularyIds = Array.from(
      { length: 26 },
      () => bundle.vocabulary.n5[0].id,
    );
    const second = structuredClone(bundle.curriculum.n5[0]);
    second.id = "n5-unit-002";
    second.order = 2;
    second.vocabularyIds = [bundle.vocabulary.n5[0].id];
    second.kanaFirstVocabularyIds = [bundle.vocabulary.n5[0].id];
    second.grammarIds = [];
    second.kanjiIds = [];
    second.prerequisiteUnitIds = ["n5-unit-001"];
    bundle.curriculum.n5.push(second);

    const result = await validateContentBundle(bundle);

    expect(result.errors).toContain(
      "n5-unit-001 introduces 26 vocabulary items (maximum 25)",
    );
    expect(result.errors).toContain(
      "vocab-食べる-たべる is introduced as new content in multiple units: n5-unit-001, n5-unit-002",
    );
  });

  it("requires kana-first marking when required kanji is not earlier", async () => {
    const bundle = makeValidContentBundle();
    bundle.curriculum.n5[0].kanaFirstVocabularyIds = [];

    const result = await validateContentBundle(bundle);

    expect(result.errors).toContain(
      "n5-unit-001 introduces vocab-食べる-たべる before required kanji without kana-first marking",
    );
  });

  it("rejects later N4 prerequisites", async () => {
    const bundle = makeValidContentBundle();
    const first = structuredClone(bundle.curriculum.n5[0]);
    first.id = "n4-unit-001";
    first.level = "N4";
    first.order = 1;
    first.prerequisiteUnitIds = ["n4-unit-002"];
    first.grammarIds = [];
    first.vocabularyIds = [];
    first.kanjiIds = [];
    first.kanaFirstVocabularyIds = [];
    const second = structuredClone(first);
    second.id = "n4-unit-002";
    second.order = 2;
    second.prerequisiteUnitIds = ["n5-unit-001"];
    bundle.curriculum.n4.push(first, second);

    const result = await validateContentBundle(bundle);

    expect(result.errors).toContain(
      "n4-unit-001 depends on later or invalid N4 unit n4-unit-002",
    );
  });

  it("rejects OCR-only release grammar and unsupported high-confidence mapping", async () => {
    const bundle = makeValidContentBundle();
    bundle.grammar.n5[0].sources = [{ sourceId: "textbook-genki-i" }];
    bundle.grammar.n5[0].confidence = 0.95;
    bundle.grammar.n5[0].needsReview = false;
    bundle.grammar.n5[0].releaseReady = true;
    bundle.textbookMap.push({
      sourceBook: "Genki I",
      sourceFile: "genki-1.pdf",
      edition: "Third Edition",
      lesson: 1,
      lessonStartPage: 44,
      lessonEndPage: 63,
      lessonHeadingStatus: "inferred",
      sourcePages: [],
      grammarIds: [],
      vocabularyIds: [],
      kanjiIds: [],
      canonicalHitOccurrences: 0,
      unambiguousHitOccurrences: 0,
      ambiguousHitOccurrences: 0,
      confidence: 0.9,
      verifiedForSequencing: false,
      needsReview: true,
      releaseReady: false,
    });

    const result = await validateContentBundle(bundle);

    expect(result.errors).toContain(
      "grammar-desu is OCR-only grammar marked release-ready",
    );
    expect(result.errors).toContain(
      "Genki I lesson 1 claims high confidence without a detected heading and source pages",
    );
  });
});
