import { describe, expect, it } from "vitest";

import type { LearningContentCollections } from "../../src/features/learning-content/schemas";
import { calculateVocabularyKanjiCoverage } from "./vocabulary-kanji-coverage";
import type { KanjiRecord, VocabularyRecord } from "./schemas/content-schemas";

const emptyContent = (): LearningContentCollections => ({
  schemaVersion: 1,
  sentences: [],
  readingPassages: [],
  listeningSpeakers: [],
  listeningActivities: [],
  grammarExampleViews: [],
  vocabularyExampleViews: [],
  kanjiExampleViews: [],
  questions: [],
  questionOptions: [],
  learningItemMetadata: [],
  questionTargetRelationships: [],
});

const vocabulary = {
  id: "vocab-山-やま",
  primaryForm: "山",
  writtenForms: [{ text: "山", primary: true, common: true, restrictions: [] }],
  readings: [{ kana: "やま", romaji: "yama", primary: true, restrictions: [] }],
  senses: [{ definitions: ["mountain"], partsOfSpeech: ["noun"], fields: [], dialects: [], usageNotes: [], restrictions: [] }],
  partOfSpeech: ["noun"],
  conjugationClass: null,
  transitivity: null,
  common: true,
  jlpt: { level: "N5", confidence: 0.99, sources: [], conflicts: [] },
  kanjiIds: ["kanji-山"],
  relatedVocabularyIds: [],
  confusableVocabularyIds: [],
  topicTags: [],
  textbookReferences: [],
  examples: [],
  sources: [{ sourceId: "jmdict", sourceRecordId: "1" }],
  attribution: ["test"],
  confidence: 0.99,
  needsReview: false,
  releaseReady: true,
} satisfies VocabularyRecord;

const kanji = {
  id: "kanji-山",
  character: "山",
  unicode: "U+5C71",
  meanings: ["mountain"],
  readings: { on: ["サン"], kun: ["やま"], nanori: [] },
  strokeCount: 3,
  radicals: [],
  components: [],
  grade: 1,
  frequencyRank: 1,
  jlpt: { level: "N5", confidence: 0.99, sources: [], conflicts: [] },
  vocabularyIds: [vocabulary.id],
  similarKanjiIds: [],
  textbookReferences: [],
  kanjiVg: { svgPath: null, elementIds: [], available: false },
  sources: [{ sourceId: "kanjidic2", sourceRecordId: "山" }],
  attribution: ["test"],
  confidence: 0.99,
  needsReview: false,
  releaseReady: true,
} satisfies KanjiRecord;

describe("Phase 3 vocabulary and kanji coverage", () => {
  it("requires both a primary relationship and two approved sentences", () => {
    const content = emptyContent();
    const result = calculateVocabularyKanjiCoverage(content, [vocabulary], [kanji]);
    expect(result.vocabulary[0]).toMatchObject({
      approvedSentenceIds: [],
      approvedPrimarySentenceIds: [],
      requiredMinimum: 2,
      coverageStatus: "gap",
    });
  });

  it("reports kanji diversity as structurally infeasible when only one canonical word exists", () => {
    const result = calculateVocabularyKanjiCoverage(emptyContent(), [vocabulary], [kanji]);
    expect(result.kanji[0]).toMatchObject({
      availableCanonicalVocabularyIds: [vocabulary.id],
      inventoryFeasible: false,
      coverageStatus: "gap",
    });
  });
});
