import { z } from "zod";

export const jlptLevelSchema = z.enum(["N5", "N4"]);
export const mappedLevelSchema = z.enum([
  "N5",
  "N4",
  "supplemental",
  "unknown",
]);
export const confidenceSchema = z.number().min(0).max(1);

export const sourceReferenceSchema = z.object({
  sourceId: z.string().min(1),
  sourceRecordId: z.string().min(1).optional(),
});

export const textbookReferenceSchema = z
  .object({
    book: z.string().min(1),
    edition: z.string().nullable(),
    lesson: z.number().int().positive().nullable(),
    page: z.number().int().positive().nullable(),
    confidence: confidenceSchema,
  })
  .superRefine((reference, context) => {
    if (reference.confidence >= 0.8 && (!reference.lesson || !reference.page)) {
      context.addIssue({
        code: "custom",
        message:
          "High-confidence textbook references require both lesson and page.",
      });
    }
  });

const jlptClassificationSchema = z.object({
  level: mappedLevelSchema,
  confidence: confidenceSchema,
  sources: z.array(sourceReferenceSchema),
  conflicts: z.array(z.string()),
});

export const vocabularyRecordSchema = z.object({
  id: z.string().startsWith("vocab-"),
  primaryForm: z.string().min(1),
  writtenForms: z.array(
    z.object({
      text: z.string().min(1),
      primary: z.boolean(),
      common: z.boolean(),
      restrictions: z.array(z.string()),
    }),
  ),
  readings: z
    .array(
      z.object({
        kana: z.string().min(1),
        romaji: z.string().min(1),
        primary: z.boolean(),
        restrictions: z.array(z.string()),
      }),
    )
    .min(1),
  senses: z
    .array(
      z.object({
        definitions: z.array(z.string().min(1)).min(1),
        partsOfSpeech: z.array(z.string()),
        fields: z.array(z.string()),
        dialects: z.array(z.string()),
        usageNotes: z.array(z.string()),
        restrictions: z.array(z.string()),
      }),
    )
    .min(1),
  partOfSpeech: z.array(z.string()),
  conjugationClass: z.string().nullable(),
  transitivity: z.enum(["transitive", "intransitive"]).nullable(),
  common: z.boolean(),
  jlpt: jlptClassificationSchema,
  kanjiIds: z.array(z.string().startsWith("kanji-")),
  relatedVocabularyIds: z.array(z.string().startsWith("vocab-")),
  confusableVocabularyIds: z.array(z.string().startsWith("vocab-")),
  topicTags: z.array(z.string()),
  textbookReferences: z.array(textbookReferenceSchema),
  examples: z.array(z.string()),
  sources: z.array(sourceReferenceSchema).min(1),
  attribution: z.array(z.string().min(1)).min(1),
  confidence: confidenceSchema,
  needsReview: z.boolean(),
  releaseReady: z.boolean(),
});

export const kanjiRecordSchema = z.object({
  id: z.string().startsWith("kanji-"),
  character: z.string().regex(/^\p{Script=Han}$/u),
  unicode: z.string().regex(/^U\+[0-9A-F]{4,6}$/u),
  meanings: z.array(z.string().min(1)).min(1),
  readings: z.object({
    on: z.array(z.string()),
    kun: z.array(z.string()),
    nanori: z.array(z.string()),
  }),
  strokeCount: z.number().int().positive(),
  radicals: z.array(z.string()),
  components: z.array(z.string()),
  grade: z.number().int().positive().nullable(),
  frequencyRank: z.number().int().positive().nullable(),
  jlpt: jlptClassificationSchema,
  vocabularyIds: z.array(z.string().startsWith("vocab-")),
  similarKanjiIds: z.array(z.string().startsWith("kanji-")),
  textbookReferences: z.array(textbookReferenceSchema),
  kanjiVg: z.object({
    svgPath: z.string().nullable(),
    elementIds: z.array(z.string()),
    available: z.boolean(),
  }),
  sources: z.array(sourceReferenceSchema).min(1),
  attribution: z.array(z.string().min(1)).min(1),
  confidence: confidenceSchema,
  needsReview: z.boolean(),
  releaseReady: z.boolean(),
});

export const legacyN5GrammarRecordSchema = z.object({
  id: z.string().startsWith("grammar-"),
  pattern: z.string().min(1),
  alternatePatterns: z.array(z.string()),
  title: z.string().min(1),
  level: z.literal("N5"),
  levelConfidence: confidenceSchema,
  formationRules: z.array(z.string()),
  shortExplanation: z.string().nullable(),
  detailedExplanation: z.string().nullable(),
  usage: z.object({
    intentions: z.array(z.string()),
    register: z.string().nullable(),
    politeness: z.string().nullable(),
    restrictions: z.array(z.string()),
  }),
  prerequisiteGrammarIds: z.array(z.string().startsWith("grammar-")),
  relatedGrammarIds: z.array(z.string().startsWith("grammar-")),
  confusedWithGrammarIds: z.array(z.string().startsWith("grammar-")),
  commonMistakes: z.array(z.string()),
  exampleIds: z.array(z.string()),
  exerciseTemplateIds: z.array(z.string()),
  textbookReferences: z.array(textbookReferenceSchema),
  sources: z.array(sourceReferenceSchema).min(1),
  attribution: z.array(z.string().min(1)).min(1),
  confidence: confidenceSchema,
  needsReview: z.boolean(),
  releaseReady: z.boolean(),
});

export const n4GrammarContentTypeSchema = z.enum([
  "grammar-pattern",
  "conjugation",
  "functional-expression",
  "politeness-form",
  "structural-concept",
]);

export const n4GrammarCategorySchema = z.enum([
  "explanation-and-nominalization",
  "time-and-sequence",
  "giving-and-receiving",
  "aspect-and-completion",
  "conditionals",
  "obligation-permission-and-prohibition",
  "decisions-and-intentions",
  "appearance-inference-and-hearsay",
  "voice-and-valency",
  "purpose-and-change",
  "comparison-and-limitation",
  "functional-expressions",
  "honorific-and-humble-language",
]);

export const reviewedN4TextbookReferenceSchema = z.object({
  source: z.enum(["Genki II", "Minna no Nihongo II"]),
  lesson: z.number().int().positive().nullable(),
  page: z.number().int().positive().nullable(),
  referenceType: z.literal("curriculum-cross-check"),
});

export const reviewedN4GrammarRecordSchema = z
  .object({
    id: z.string().regex(/^grammar-n4-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    pattern: z.string().min(1),
    normalizedPattern: z.string().min(1),
    romaji: z.string().regex(/^[a-z0-9 -]+$/u),
    title: z.string().min(1),
    meanings: z.array(z.string().min(1)).min(1),
    level: z.literal("N4"),
    contentType: n4GrammarContentTypeSchema,
    category: n4GrammarCategorySchema,
    familyId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    alternatePatterns: z.array(z.string().min(1)),
    formation: z
      .array(
        z.object({
          base: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
          structure: z.string().min(1),
        }),
      )
      .min(1),
    prerequisiteGrammarIds: z.array(z.string().startsWith("grammar-")),
    relatedGrammarIds: z.array(z.string().startsWith("grammar-")),
    confusedWithGrammarIds: z.array(z.string().startsWith("grammar-")),
    textbookReferences: z.array(reviewedN4TextbookReferenceSchema),
    editorialSources: z
      .array(
        z.object({
          name: z.string().min(1),
          role: z.enum([
            "canonical-classification",
            "candidate-identification",
            "curriculum-cross-check",
          ]),
        }),
      )
      .min(1),
    confidence: confidenceSchema,
    reviewStatus: z.enum(["approved", "needs-more-review"]),
    needsReview: z.boolean(),
    releaseReady: z.boolean(),
    notes: z.string().min(1).nullable(),
    curriculumOrder: z.number().int().positive(),
    extendsGrammarId: z.string().startsWith("grammar-").nullable(),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.reviewStatus === "approved" && record.needsReview) {
      context.addIssue({
        code: "custom",
        message: "Approved N4 grammar cannot require further review.",
      });
    }
    if (record.reviewStatus === "approved" && !record.releaseReady) {
      context.addIssue({
        code: "custom",
        message: "Approved N4 grammar must be release-ready.",
      });
    }
    if (
      record.reviewStatus === "needs-more-review" &&
      (!record.needsReview || record.releaseReady)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "N4 grammar needing review must set needsReview true and releaseReady false.",
      });
    }
    if (record.releaseReady && record.reviewStatus !== "approved") {
      context.addIssue({
        code: "custom",
        message: "Release-ready N4 grammar must be approved.",
      });
    }
    if (record.releaseReady && record.needsReview) {
      context.addIssue({
        code: "custom",
        message: "Release-ready N4 grammar cannot require further review.",
      });
    }
  });

function normalizedEditorialSurface(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[〜~]/gu, "～")
    .trim()
    .replace(/^～/u, "");
}

export const reviewedN4GrammarSourceSchema = z
  .object({
    schemaVersion: z.literal(1),
    dataset: z.literal("japango-n4-grammar"),
    level: z.literal("N4"),
    editorialStatus: z.literal("manually-curated"),
    grammar: z.array(reviewedN4GrammarRecordSchema),
  })
  .strict()
  .superRefine((source, context) => {
    const ids = new Set<string>();
    const orders = new Set<number>();
    const byId = new Map(source.grammar.map((record) => [record.id, record]));
    const bySurface = new Map<string, typeof source.grammar>();
    for (const [index, record] of source.grammar.entries()) {
      if (ids.has(record.id)) {
        context.addIssue({
          code: "custom",
          path: ["grammar", index, "id"],
          message: `Duplicate reviewed N4 grammar ID: ${record.id}`,
        });
      }
      ids.add(record.id);
      if (orders.has(record.curriculumOrder)) {
        context.addIssue({
          code: "custom",
          path: ["grammar", index, "curriculumOrder"],
          message: `Duplicate N4 curriculum order: ${record.curriculumOrder}`,
        });
      }
      orders.add(record.curriculumOrder);
      const surfaces = new Set(
        [record.pattern, ...record.alternatePatterns].map(
          normalizedEditorialSurface,
        ),
      );
      for (const surface of surfaces) {
        bySurface.set(surface, [...(bySurface.get(surface) ?? []), record]);
      }
      for (const id of [
        ...record.prerequisiteGrammarIds,
        ...record.relatedGrammarIds,
        ...record.confusedWithGrammarIds,
      ]) {
        if (id.startsWith("grammar-n4-") && !byId.has(id)) {
          context.addIssue({
            code: "custom",
            path: ["grammar", index],
            message: `Missing reviewed N4 grammar relationship: ${id}`,
          });
        }
      }
    }
    for (const [surface, records] of bySurface) {
      if (records.length < 2) continue;
      for (const record of records) {
        const otherIds = records
          .filter(({ id }) => id !== record.id)
          .map(({ id }) => id);
        if (!otherIds.every((id) => record.confusedWithGrammarIds.includes(id))) {
          context.addIssue({
            code: "custom",
            message: `Unclassified reviewed N4 surface collision: ${surface}`,
          });
          break;
        }
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      const record = byId.get(id);
      const cyclic = (record?.prerequisiteGrammarIds ?? [])
        .filter((prerequisiteId) => byId.has(prerequisiteId))
        .some(visit);
      visiting.delete(id);
      visited.add(id);
      return cyclic;
    };
    if ([...byId.keys()].some(visit)) {
      context.addIssue({
        code: "custom",
        message: "Reviewed N4 grammar prerequisite graph contains a cycle.",
      });
    }
  });

export const n4GrammarEditorialDecisionLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  dataset: z.literal("japango-n4-grammar-editorial-decisions"),
  sourceCandidateRows: z.literal(131),
  decisions: z.array(
    z.object({
      row: z.number().int().min(1).max(131),
      pattern: z.string().min(1),
      decision: z.enum([
        "approved",
        "merged",
        "rejected",
        "moved-to-vocabulary",
        "unresolved",
      ]),
      reason: z.string().min(1),
      canonicalGrammarId: z.string().startsWith("grammar-n4-").nullable(),
      n5Overlap: z.object({
        classification: z.enum([
          "none",
          "valid-n4-extension",
          "different-formation",
          "different-meaning",
          "duplicate",
          "n5-review-item",
        ]),
        grammarIds: z.array(z.string().startsWith("grammar-")),
      }),
    }),
  ),
  manualAdditions: z.array(
    z.object({
      id: z.string().startsWith("grammar-n4-"),
      pattern: z.string().min(1),
      reason: z.string().min(1),
    }),
  ),
  requiredCoverageAtN5: z.array(
    z.object({
      pattern: z.string().min(1),
      grammarIds: z.array(z.string().startsWith("grammar-")).min(1),
    }),
  ),
}).strict().superRefine((ledger, context) => {
  const rows = ledger.decisions.map(({ row }) => row);
  if (new Set(rows).size !== 131 || rows.some((row, index) => row !== index + 1)) {
    context.addIssue({
      code: "custom",
      path: ["decisions"],
      message: "Editorial decisions must contain each source row 1 through 131 once.",
    });
  }
});

export const grammarRecordSchema = z.union([
  legacyN5GrammarRecordSchema,
  reviewedN4GrammarRecordSchema,
]);

export const textbookCurriculumMappingSchema = z.object({
  sourceBook: z.string().min(1),
  sourceFile: z.string().min(1),
  edition: z.string().nullable(),
  lesson: z.number().int().positive(),
  lessonStartPage: z.number().int().positive(),
  lessonEndPage: z.number().int().positive(),
  lessonHeadingStatus: z.enum(["detected", "inferred"]),
  sourcePages: z.array(z.number().int().positive()),
  grammarIds: z.array(z.string().startsWith("grammar-")),
  vocabularyIds: z.array(z.string().startsWith("vocab-")),
  kanjiIds: z.array(z.string().startsWith("kanji-")),
  canonicalHitOccurrences: z.number().int().nonnegative(),
  unambiguousHitOccurrences: z.number().int().nonnegative(),
  ambiguousHitOccurrences: z.number().int().nonnegative(),
  confidence: confidenceSchema,
  verifiedForSequencing: z.boolean(),
  needsReview: z.boolean(),
  releaseReady: z.boolean(),
});

export const curriculumUnitSchema = z
  .object({
    id: z.string().regex(/^n[45]-unit-\d{3}$/u),
    title: z.string().min(1),
    level: jlptLevelSchema,
    order: z.number().int().positive(),
    kind: z.enum(["learning", "review"]),
    stage: z.enum(["foundation", "recovery", "development", "consolidation"]),
    learningGoals: z.array(z.string().min(1)).min(1),
    grammarIds: z.array(z.string().startsWith("grammar-")),
    vocabularyIds: z.array(z.string().startsWith("vocab-")),
    kanjiIds: z.array(z.string().startsWith("kanji-")),
    kanaFirstVocabularyIds: z.array(z.string().startsWith("vocab-")),
    reviewGrammarIds: z.array(z.string().startsWith("grammar-")),
    reviewVocabularyIds: z.array(z.string().startsWith("vocab-")),
    reviewKanjiIds: z.array(z.string().startsWith("kanji-")),
    prerequisiteUnitIds: z.array(z.string()),
    sourceReferences: z.array(sourceReferenceSchema),
    reviewTargets: z.object({
      grammar: z.number().int().nonnegative(),
      vocabulary: z.number().int().nonnegative(),
      kanji: z.number().int().nonnegative(),
    }),
    recommendedReadingDifficulty: z.number().int().positive().nullable(),
    recommendedListeningDifficulty: z.number().int().positive().nullable(),
    masteryRequirements: z.object({
      minimumAccuracy: confidenceSchema,
      minimumReviews: z.number().int().positive(),
    }),
    confidence: confidenceSchema,
    needsReview: z.boolean(),
    releaseReady: z.boolean(),
  })
  .superRefine((unit, context) => {
    const newContentCount =
      unit.grammarIds.length + unit.vocabularyIds.length + unit.kanjiIds.length;
    const reviewContentCount =
      unit.reviewGrammarIds.length +
      unit.reviewVocabularyIds.length +
      unit.reviewKanjiIds.length;
    if (unit.kind === "review" && newContentCount > 0) {
      context.addIssue({
        code: "custom",
        message: "Review units cannot introduce new content.",
      });
    }
    if (unit.kind === "review" && reviewContentCount === 0) {
      context.addIssue({
        code: "custom",
        message: "Review units require at least one review item.",
      });
    }
    if (
      unit.kanaFirstVocabularyIds.some(
        (id) => !unit.vocabularyIds.includes(id),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Kana-first vocabulary must be introduced by the same unit.",
      });
    }
  });

export const sourceRegistryEntrySchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  localPath: z.string().min(1),
  format: z.string().min(1),
  version: z.string().nullable(),
  licence: z.string().nullable(),
  attributionText: z.string().min(1),
  redistributionNotes: z.string().min(1),
  role: z.enum([
    "canonical",
    "mapping",
    "curriculum-reference",
    "supplemental",
  ]),
  parserVersion: z.string().min(1),
  checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
});

export const sourceRegistrySchema = z.array(sourceRegistryEntrySchema);
export const vocabularyDatasetSchema = z.array(vocabularyRecordSchema);
export const kanjiDatasetSchema = z.array(kanjiRecordSchema);
export const kanjiComponentSchema = z.object({
  id: z.string().startsWith("component-"),
  character: z.string().min(1),
  kanjiIds: z.array(z.string().startsWith("kanji-")),
});
export const kanjiComponentsDatasetSchema = z.array(kanjiComponentSchema);
export const grammarDatasetSchema = z.array(grammarRecordSchema);
export const curriculumDatasetSchema = z.array(curriculumUnitSchema);
export const textbookCurriculumMapSchema = z.array(
  textbookCurriculumMappingSchema,
);

export const contentManifestSchema = z.object({
  contentVersion: z.string().min(1),
  generationTimestamp: z.string().datetime(),
  reproducibleTimestamp: z.boolean(),
  pipelineVersion: z.string().min(1),
  sourceChecksums: z.record(z.string(), z.string().regex(/^sha256:[0-9a-f]{64}$/u)),
  counts: z.object({
    vocabulary: z.object({ n5: z.number().int().nonnegative(), n4: z.number().int().nonnegative(), supplemental: z.number().int().nonnegative() }),
    kanji: z.object({ n5: z.number().int().nonnegative(), n4: z.number().int().nonnegative() }),
    grammar: z.object({ n5: z.number().int().nonnegative(), n4: z.number().int().nonnegative() }),
    curriculumUnits: z.object({ n5: z.number().int().nonnegative(), n4: z.number().int().nonnegative() }),
    learningContent: z.object({
      sentences: z.number().int().nonnegative(),
      readingPassages: z.number().int().nonnegative(),
      listeningSpeakers: z.number().int().nonnegative(),
      listeningActivities: z.number().int().nonnegative(),
      grammarExampleViews: z.number().int().nonnegative(),
      vocabularyExampleViews: z.number().int().nonnegative(),
      kanjiExampleViews: z.number().int().nonnegative(),
      questions: z.number().int().nonnegative(),
      questionOptions: z.number().int().nonnegative(),
      learningItemMetadata: z.number().int().nonnegative(),
      questionTargetRelationships: z.number().int().nonnegative(),
    }),
    assessments: z.object({
      blueprints: z.number().int().nonnegative(),
      presets: z.number().int().nonnegative(),
      bundledExams: z.number().int().nonnegative(),
      sampleSnapshots: z.number().int().nonnegative(),
      questionPlacements: z.number().int().nonnegative(),
      parentPlacements: z.number().int().nonnegative(),
    }),
  }),
  unresolvedCounts: z.record(z.string(), z.number().int().nonnegative()),
  releaseReadyCounts: z.record(z.string(), z.number().int().nonnegative()),
  outputFileChecksums: z.record(z.string(), z.string().regex(/^sha256:[0-9a-f]{64}$/u)),
  compactOutputChecksums: z.record(
    z.string(),
    z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  ),
});

export type VocabularyRecord = z.infer<typeof vocabularyRecordSchema>;
export type KanjiRecord = z.infer<typeof kanjiRecordSchema>;
export type KanjiComponent = z.infer<typeof kanjiComponentSchema>;
export type GrammarRecord = z.infer<typeof grammarRecordSchema>;
export type LegacyN5GrammarRecord = z.infer<typeof legacyN5GrammarRecordSchema>;
export type ReviewedN4GrammarRecord = z.infer<
  typeof reviewedN4GrammarRecordSchema
>;
export type ReviewedN4GrammarSource = z.infer<
  typeof reviewedN4GrammarSourceSchema
>;
export type N4GrammarEditorialDecisionLedger = z.infer<
  typeof n4GrammarEditorialDecisionLedgerSchema
>;
export type CurriculumUnit = z.infer<typeof curriculumUnitSchema>;
export type SourceRegistryEntry = z.infer<typeof sourceRegistryEntrySchema>;
export type TextbookCurriculumMapping = z.infer<
  typeof textbookCurriculumMappingSchema
>;
