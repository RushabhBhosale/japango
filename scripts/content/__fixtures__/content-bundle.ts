import type { SourceRegistryEntry } from "../schemas/content-schemas";
import { createEmptyLearningContentCollections } from "../../../src/features/learning-content/schemas";
import type { ContentBundle } from "../validate-content";

function sourceRegistryEntry(id: string): SourceRegistryEntry {
  return {
    id,
    displayName: id,
    localPath: `fixtures/${id}`,
    format: "fixture",
    version: null,
    licence: null,
    attributionText: `${id} fixture attribution`,
    redistributionNotes: "Unit-test fixture only.",
    role: id === "jmdict" || id === "kanjidic2" ? "canonical" : "mapping",
    parserVersion: "test",
    checksum: `sha256:${"a".repeat(64)}`,
  };
}

export function makeValidContentBundle(): ContentBundle {
  return {
    vocabulary: {
      n5: [
        {
          id: "vocab-食べる-たべる",
          primaryForm: "食べる",
          writtenForms: [
            {
              text: "食べる",
              primary: true,
              common: true,
              restrictions: [],
            },
          ],
          readings: [
            {
              kana: "たべる",
              romaji: "taberu",
              primary: true,
              restrictions: [],
            },
          ],
          senses: [
            {
              definitions: ["to eat"],
              partsOfSpeech: ["ichidan-verb", "transitive-verb"],
              fields: [],
              dialects: [],
              usageNotes: [],
              restrictions: [],
            },
          ],
          partOfSpeech: ["ichidan-verb", "transitive-verb"],
          conjugationClass: "ichidan",
          transitivity: "transitive",
          common: true,
          jlpt: {
            level: "N5",
            confidence: 0.99,
            sources: [
              {
                sourceId: "jlpt-vocabulary",
                sourceRecordId: "row-2",
              },
            ],
            conflicts: [],
          },
          kanjiIds: ["kanji-食"],
          relatedVocabularyIds: [],
          confusableVocabularyIds: [],
          topicTags: [],
          textbookReferences: [],
          examples: [],
          sources: [
            { sourceId: "jmdict", sourceRecordId: "1358280" },
            {
              sourceId: "jlpt-vocabulary",
              sourceRecordId: "row-2",
            },
          ],
          attribution: ["JMdict fixture attribution."],
          confidence: 0.99,
          needsReview: false,
          releaseReady: true,
        },
      ],
      n4: [],
      supplemental: [],
    },
    kanji: {
      n5: [
        {
          id: "kanji-食",
          character: "食",
          unicode: "U+98DF",
          meanings: ["eat", "food"],
          readings: {
            on: ["ショク"],
            kun: ["た.べる"],
            nanori: [],
          },
          strokeCount: 9,
          radicals: ["classical:184"],
          components: [],
          grade: 2,
          frequencyRank: 328,
          jlpt: {
            level: "N5",
            confidence: 0.98,
            sources: [
              { sourceId: "jlpt-kanji", sourceRecordId: "食" },
            ],
            conflicts: [],
          },
          vocabularyIds: ["vocab-食べる-たべる"],
          similarKanjiIds: [],
          textbookReferences: [],
          kanjiVg: {
            svgPath: null,
            elementIds: [],
            available: false,
          },
          sources: [
            { sourceId: "kanjidic2", sourceRecordId: "食" },
            { sourceId: "jlpt-kanji", sourceRecordId: "食" },
          ],
          attribution: ["KANJIDIC2 fixture attribution."],
          confidence: 0.98,
          needsReview: false,
          releaseReady: true,
        },
      ],
      n4: [],
      components: [],
    },
    grammar: {
      n5: [
        {
          id: "grammar-desu",
          pattern: "です",
          alternatePatterns: [],
          title: "Copula",
          level: "N5",
          levelConfidence: 0.9,
          formationRules: [],
          shortExplanation: null,
          detailedExplanation: null,
          usage: {
            intentions: [],
            register: null,
            politeness: null,
            restrictions: [],
          },
          prerequisiteGrammarIds: [],
          relatedGrammarIds: [],
          confusedWithGrammarIds: [],
          commonMistakes: [],
          exampleIds: [],
          exerciseTemplateIds: [],
          textbookReferences: [],
          sources: [
            {
              sourceId: "kotoba-brew-grammar-n5",
              sourceRecordId: "row-3",
            },
          ],
          attribution: ["Grammar fixture attribution."],
          confidence: 0.8,
          needsReview: true,
          releaseReady: false,
        },
      ],
      n4: [],
    },
    curriculum: {
      n5: [
        {
          id: "n5-unit-001",
          title: "Fixture foundation",
          level: "N5",
          order: 1,
          kind: "learning",
          stage: "foundation",
          learningGoals: ["Recognize the fixture content."],
          grammarIds: ["grammar-desu"],
          vocabularyIds: ["vocab-食べる-たべる"],
          kanjiIds: ["kanji-食"],
          kanaFirstVocabularyIds: ["vocab-食べる-たべる"],
          reviewGrammarIds: [],
          reviewVocabularyIds: [],
          reviewKanjiIds: [],
          prerequisiteUnitIds: [],
          sourceReferences: [
            { sourceId: "jlpt-vocabulary" },
            { sourceId: "jlpt-kanji" },
            { sourceId: "kotoba-brew-grammar-n5" },
          ],
          reviewTargets: {
            grammar: 1,
            vocabulary: 1,
            kanji: 1,
          },
          recommendedReadingDifficulty: 1,
          recommendedListeningDifficulty: 1,
          masteryRequirements: {
            minimumAccuracy: 0.8,
            minimumReviews: 2,
          },
          confidence: 0.8,
          needsReview: true,
          releaseReady: false,
        },
      ],
      n4: [],
    },
    learningContent: createEmptyLearningContentCollections(),
    assessments: { schemaVersion: 1, blueprints: [], presets: [], bundledExams: [], sampleSnapshots: [] },
    textbookMap: [],
    sourceRegistry: [
      sourceRegistryEntry("jmdict"),
      sourceRegistryEntry("kanjidic2"),
      sourceRegistryEntry("jlpt-vocabulary"),
      sourceRegistryEntry("jlpt-kanji"),
      sourceRegistryEntry("kotoba-brew-grammar-n5"),
    ],
  };
}
