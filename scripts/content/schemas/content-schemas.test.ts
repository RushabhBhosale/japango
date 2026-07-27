import { describe, expect, it } from "vitest";

import { makeValidContentBundle } from "../__fixtures__/content-bundle";
import {
  contentManifestSchema,
  curriculumUnitSchema,
  grammarRecordSchema,
  kanjiRecordSchema,
  textbookReferenceSchema,
  vocabularyRecordSchema,
} from "./content-schemas";

describe("generated-content Zod schemas", () => {
  it("accepts representative canonical records", () => {
    const bundle = makeValidContentBundle();

    expect(vocabularyRecordSchema.safeParse(bundle.vocabulary.n5[0]).success).toBe(true);
    expect(kanjiRecordSchema.safeParse(bundle.kanji.n5[0]).success).toBe(true);
    expect(grammarRecordSchema.safeParse(bundle.grammar.n5[0]).success).toBe(true);
    expect(curriculumUnitSchema.safeParse(bundle.curriculum.n5[0]).success).toBe(true);
  });

  it("rejects missing readings, invalid confidence, and malformed IDs", () => {
    const bundle = makeValidContentBundle();
    const vocabulary = structuredClone(bundle.vocabulary.n5[0]);
    vocabulary.readings = [];
    vocabulary.confidence = 1.01;
    const grammar = structuredClone(bundle.grammar.n5[0]);
    grammar.pattern = "";
    const unit = structuredClone(bundle.curriculum.n5[0]);
    unit.id = "n5-unit-1";

    expect(vocabularyRecordSchema.safeParse(vocabulary).success).toBe(false);
    expect(grammarRecordSchema.safeParse(grammar).success).toBe(false);
    expect(curriculumUnitSchema.safeParse(unit).success).toBe(false);
  });

  it("requires exactly one Han code point for kanji characters", () => {
    const kanji = structuredClone(makeValidContentBundle().kanji.n5[0]);
    kanji.character = "食事";

    expect(kanjiRecordSchema.safeParse(kanji).success).toBe(false);
  });

  it("distinguishes review content and requires page-backed high confidence", () => {
    const unit = structuredClone(makeValidContentBundle().curriculum.n5[0]);
    unit.kind = "review";
    unit.grammarIds = [];
    unit.vocabularyIds = [];
    unit.kanjiIds = [];
    unit.kanaFirstVocabularyIds = [];
    unit.reviewVocabularyIds = ["vocab-食べる-たべる"];

    expect(curriculumUnitSchema.safeParse(unit).success).toBe(true);
    unit.vocabularyIds = ["vocab-食べる-たべる"];
    expect(curriculumUnitSchema.safeParse(unit).success).toBe(false);
    expect(
      textbookReferenceSchema.safeParse({
        book: "Fixture",
        edition: null,
        lesson: null,
        page: null,
        confidence: 0.9,
      }).success,
    ).toBe(false);
  });

  it("validates deterministic manifest fields and checksum shapes", () => {
    const manifest = {
      contentVersion: "1.0.0+fixture",
      generationTimestamp: "2026-07-26T00:00:00.000Z",
      reproducibleTimestamp: true,
      pipelineVersion: "1.0.0",
      sourceChecksums: { jmdict: `sha256:${"a".repeat(64)}` },
      counts: {
        vocabulary: { n5: 1, n4: 0, supplemental: 0 },
        kanji: { n5: 1, n4: 0 },
        grammar: { n5: 1, n4: 0 },
        curriculumUnits: { n5: 1, n4: 0 },
        learningContent: {
          sentences: 0,
          readingPassages: 0,
          listeningSpeakers: 0,
          listeningActivities: 0,
          grammarExampleViews: 0,
          vocabularyExampleViews: 0,
          kanjiExampleViews: 0,
          questions: 0,
          questionOptions: 0,
          learningItemMetadata: 0,
          questionTargetRelationships: 0,
        },
        assessments: {
          blueprints: 0,
          presets: 0,
          bundledExams: 0,
          sampleSnapshots: 0,
          questionPlacements: 0,
          parentPlacements: 0,
        },
      },
      unresolvedCounts: { vocabulary: 0 },
      releaseReadyCounts: { vocabulary: 1 },
      outputFileChecksums: {
        "vocabulary/n5.json": `sha256:${"b".repeat(64)}`,
      },
      compactOutputChecksums: {
        "release/content.json": `sha256:${"c".repeat(64)}`,
      },
    };

    expect(contentManifestSchema.safeParse(manifest).success).toBe(true);
    expect(
      contentManifestSchema.safeParse({
        ...manifest,
        sourceChecksums: { jmdict: "not-a-checksum" },
      }).success,
    ).toBe(false);
  });
});
