import path from "node:path";

import {
  learningContentCollectionsSchema,
  type LearningContentCollections,
} from "../../src/features/learning-content/schemas";
import { assessmentCollectionsSchema, type AssessmentCollections } from "../../src/features/assessment/platform-schemas";
import { AssessmentEngine } from "../../src/features/assessment/assessment-engine";
import { contentVersionForSources } from "./content-version";
import { PIPELINE_VERSION } from "./config";

import { CURRICULUM_UNIT_LIMITS } from "./build-curriculum";
import { OUTPUT_ROOT, PROJECT_ROOT } from "./config";
import { isDirectExecution, runCli } from "./lib/cli";
import { pathExists, readJson, writeJson } from "./lib/fs-utils";
import { learningContentRelationshipErrors } from "./validate-learning-content";
import {
  curriculumDatasetSchema,
  grammarDatasetSchema,
  kanjiComponentsDatasetSchema,
  kanjiDatasetSchema,
  sourceRegistrySchema,
  textbookCurriculumMapSchema,
  vocabularyDatasetSchema,
  type CurriculumUnit,
  type GrammarRecord,
  type LegacyN5GrammarRecord,
  type KanjiRecord,
  type KanjiComponent,
  type SourceRegistryEntry,
  type TextbookCurriculumMapping,
  type ReviewedN4GrammarRecord,
  type VocabularyRecord,
} from "./schemas/content-schemas";

export interface ContentBundle {
  vocabulary: {
    n5: VocabularyRecord[];
    n4: VocabularyRecord[];
    supplemental: VocabularyRecord[];
  };
  kanji: { n5: KanjiRecord[]; n4: KanjiRecord[]; components: KanjiComponent[] };
  grammar: {
    n5: LegacyN5GrammarRecord[];
    n4: ReviewedN4GrammarRecord[];
  };
  curriculum: { n5: CurriculumUnit[]; n4: CurriculumUnit[] };
  learningContent: LearningContentCollections;
  assessments: AssessmentCollections;
  textbookMap: TextbookCurriculumMapping[];
  sourceRegistry: SourceRegistryEntry[];
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

export function prerequisiteCycles(
  units: readonly Pick<CurriculumUnit, "id" | "prerequisiteUnitIds">[],
): string[][] {
  const prerequisites = new Map(
    units.map((unit) => [unit.id, unit.prerequisiteUnitIds] as const),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[][] = [];

  const visit = (id: string, pathStack: string[]): void => {
    if (visiting.has(id)) {
      const start = pathStack.indexOf(id);
      cycles.push([...pathStack.slice(start), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisite of prerequisites.get(id) ?? []) {
      if (prerequisites.has(prerequisite)) visit(prerequisite, [...pathStack, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of prerequisites.keys()) visit(id, []);
  return cycles;
}

function addSchemaErrors(
  label: string,
  result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } },
  errors: string[],
): void {
  if (result.success || !result.error) return;
  for (const issue of result.error.issues) {
    errors.push(`${label}.${issue.path.join(".")}: ${issue.message}`);
  }
}

function sourceReferences(record: unknown): Array<{ sourceId: string }> {
  if (!record || typeof record !== "object") return [];
  if ((record as { level?: unknown }).level === "N4") {
    return [{ sourceId: "japango-n4-grammar-reviewed" }];
  }
  const sources = (record as { sources?: unknown }).sources;
  return Array.isArray(sources)
    ? sources.filter(
        (source): source is { sourceId: string } =>
          Boolean(source) &&
          typeof source === "object" &&
          typeof (source as { sourceId?: unknown }).sourceId === "string",
      )
    : [];
}

function containsOcrCanonicalField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsOcrCanonicalField);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => /(?:raw.*ocr|ocr.*text|ocrCandidate)/iu.test(key) || containsOcrCanonicalField(child),
  );
}

function isOcrOnlyGrammar(record: GrammarRecord): boolean {
  if (record.level === "N4") return false;
  return (
    record.sources.length > 0 &&
    record.sources.every(({ sourceId }) => sourceId.startsWith("textbook-"))
  );
}

function normalizedGrammarSurface(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[〜~]/gu, "～")
    .trim()
    .replace(/^～/u, "");
}

export function grammarPrerequisiteCycles(
  records: readonly Pick<GrammarRecord, "id" | "prerequisiteGrammarIds">[],
): string[][] {
  const nodes = records.map((record) => ({
    id: record.id,
    prerequisiteUnitIds: record.prerequisiteGrammarIds,
  }));
  return prerequisiteCycles(nodes);
}

function itemLevel(
  id: string,
  vocabularyById: ReadonlyMap<string, VocabularyRecord>,
  kanjiById: ReadonlyMap<string, KanjiRecord>,
  grammarById: ReadonlyMap<string, GrammarRecord>,
): "N5" | "N4" | null {
  const vocabulary = vocabularyById.get(id);
  if (vocabulary?.jlpt.level === "N5" || vocabulary?.jlpt.level === "N4") {
    return vocabulary.jlpt.level;
  }
  const kanji = kanjiById.get(id);
  if (kanji?.jlpt.level === "N5" || kanji?.jlpt.level === "N4") {
    return kanji.jlpt.level;
  }
  return grammarById.get(id)?.level ?? null;
}

export async function validateContentBundle(
  bundle: ContentBundle,
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  addSchemaErrors("vocabulary.n5", vocabularyDatasetSchema.safeParse(bundle.vocabulary.n5), errors);
  addSchemaErrors("vocabulary.n4", vocabularyDatasetSchema.safeParse(bundle.vocabulary.n4), errors);
  addSchemaErrors(
    "vocabulary.supplemental",
    vocabularyDatasetSchema.safeParse(bundle.vocabulary.supplemental),
    errors,
  );
  addSchemaErrors("kanji.n5", kanjiDatasetSchema.safeParse(bundle.kanji.n5), errors);
  addSchemaErrors("kanji.n4", kanjiDatasetSchema.safeParse(bundle.kanji.n4), errors);
  addSchemaErrors(
    "kanji.components",
    kanjiComponentsDatasetSchema.safeParse(bundle.kanji.components),
    errors,
  );
  addSchemaErrors("grammar.n5", grammarDatasetSchema.safeParse(bundle.grammar.n5), errors);
  addSchemaErrors("grammar.n4", grammarDatasetSchema.safeParse(bundle.grammar.n4), errors);
  addSchemaErrors("curriculum.n5", curriculumDatasetSchema.safeParse(bundle.curriculum.n5), errors);
  addSchemaErrors("curriculum.n4", curriculumDatasetSchema.safeParse(bundle.curriculum.n4), errors);
  addSchemaErrors(
    "textbookMap",
    textbookCurriculumMapSchema.safeParse(bundle.textbookMap),
    errors,
  );
  addSchemaErrors("sourceRegistry", sourceRegistrySchema.safeParse(bundle.sourceRegistry), errors);
  const learningContentResult = learningContentCollectionsSchema.safeParse(
    bundle.learningContent,
  );
  addSchemaErrors("learningContent", learningContentResult, errors);
  addSchemaErrors("assessments", assessmentCollectionsSchema.safeParse(bundle.assessments), errors);
  const assessmentEngine = new AssessmentEngine({ learningContent: bundle.learningContent, contentVersion: contentVersionForSources(bundle.sourceRegistry), pipelineVersion: PIPELINE_VERSION, unresolvedTargetIds: bundle.grammar.n4.filter(({ needsReview }) => needsReview).map(({ id }) => id) });
  if (bundle.assessments.blueprints.length > 0 && bundle.assessments.bundledExams.filter(({ level }) => level === "N5").length !== 5) errors.push("Phase 8 requires exactly five bundled N5 exams");
  if (bundle.assessments.blueprints.length > 0 && bundle.assessments.bundledExams.filter(({ level }) => level === "N4").length !== 5) errors.push("Phase 8 requires exactly five bundled N4 exams");
  for (const snapshot of [...bundle.assessments.bundledExams, ...bundle.assessments.sampleSnapshots]) {
    errors.push(...assessmentEngine.validateAssessment(snapshot).map((error) => `${snapshot.id}: ${error}`));
    if (snapshot.releaseReady || snapshot.lifecycleMode !== "development") errors.push(`${snapshot.id} must remain development-only`);
  }

  const vocabulary = [
    ...bundle.vocabulary.n5,
    ...bundle.vocabulary.n4,
    ...bundle.vocabulary.supplemental,
  ];
  const kanji = [...bundle.kanji.n5, ...bundle.kanji.n4];
  const grammar = [...bundle.grammar.n5, ...bundle.grammar.n4];
  const units = [...bundle.curriculum.n5, ...bundle.curriculum.n4];
  const allIds = [...vocabulary, ...kanji, ...grammar, ...units].map(({ id }) => id);
  for (const id of duplicateValues(allIds)) errors.push(`Duplicate generated ID: ${id}`);
  for (const id of duplicateValues(bundle.sourceRegistry.map(({ id }) => id))) {
    errors.push(`Duplicate source registry ID: ${id}`);
  }

  const sourceIds = new Set(bundle.sourceRegistry.map(({ id }) => id));
  for (const record of [...vocabulary, ...kanji, ...grammar]) {
    for (const reference of sourceReferences(record)) {
      if (!sourceIds.has(reference.sourceId)) {
        errors.push(`${record.id} references unknown source ${reference.sourceId}`);
      }
    }
    if (record.releaseReady && (record.confidence < 0.9 || record.needsReview)) {
      errors.push(`${record.id} is release-ready despite unresolved or low-confidence data`);
    }
    if (containsOcrCanonicalField(record)) {
      errors.push(`${record.id} contains OCR-only data in canonical output`);
    }
  }

  const kanjiIds = new Set(kanji.map(({ id }) => id));
  const vocabularyIds = new Set(vocabulary.map(({ id }) => id));
  const grammarIds = new Set(grammar.map(({ id }) => id));
  const unitIds = new Set(units.map(({ id }) => id));
  const vocabularyById = new Map(vocabulary.map((record) => [record.id, record]));
  const kanjiById = new Map(kanji.map((record) => [record.id, record]));
  const grammarById = new Map(grammar.map((record) => [record.id, record]));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  if (learningContentResult.success) {
    errors.push(
      ...learningContentRelationshipErrors(learningContentResult.data, {
        vocabulary,
        kanji,
        grammar,
        curriculumUnits: units,
        sourceIds,
      }),
    );
  }
  for (const record of vocabulary) {
    if (!record.sources.some(({ sourceId }) => sourceId === "jmdict")) {
      errors.push(`${record.id} has no JMdict verification source`);
    }
    for (const id of record.kanjiIds) {
      if (!kanjiIds.has(id)) errors.push(`${record.id} references missing kanji ${id}`);
    }
  }
  for (const record of kanji) {
    if (!record.sources.some(({ sourceId }) => sourceId === "kanjidic2")) {
      errors.push(`${record.id} has no KANJIDIC2 verification source`);
    }
    for (const id of record.vocabularyIds) {
      if (!vocabularyIds.has(id)) errors.push(`${record.id} references missing vocabulary ${id}`);
    }
    if (record.kanjiVg.available) {
      if (!record.kanjiVg.svgPath) {
        errors.push(`${record.id} marks KanjiVG available without a path`);
      } else if (!(await pathExists(path.join(PROJECT_ROOT, record.kanjiVg.svgPath)))) {
        errors.push(`${record.id} KanjiVG path does not exist: ${record.kanjiVg.svgPath}`);
      }
    }
  }
  for (const record of grammar) {
    for (const id of [
      ...record.prerequisiteGrammarIds,
      ...record.relatedGrammarIds,
      ...record.confusedWithGrammarIds,
    ]) {
      if (!grammarIds.has(id)) errors.push(`${record.id} references missing grammar ${id}`);
    }
    if (record.level === "N4" && record.extendsGrammarId) {
      const extended = grammarById.get(record.extendsGrammarId);
      if (!extended) {
        errors.push(
          `${record.id} extends missing grammar ${record.extendsGrammarId}`,
        );
      } else if (extended.level !== "N5") {
        errors.push(`${record.id} may only extend an N5 grammar record`);
      }
    }
    if (
      record.level === "N5" &&
      record.prerequisiteGrammarIds.some(
        (id) => grammarById.get(id)?.level === "N4",
      )
    ) {
      errors.push(`${record.id} cannot depend on N4 grammar`);
    }
    if (record.releaseReady && isOcrOnlyGrammar(record)) {
      errors.push(`${record.id} is OCR-only grammar marked release-ready`);
    }
  }

  for (const cycle of grammarPrerequisiteCycles(grammar)) {
    errors.push(`Grammar prerequisite cycle: ${cycle.join(" -> ")}`);
  }

  const sortedN4 = [...bundle.grammar.n4].sort(
    (left, right) =>
      (left.level === "N4" ? left.curriculumOrder : 0) -
        (right.level === "N4" ? right.curriculumOrder : 0) ||
      (left.level === "N4" ? left.category : "").localeCompare(
        right.level === "N4" ? right.category : "",
        "en",
      ) ||
      (left.level === "N4" ? left.normalizedPattern : "").localeCompare(
        right.level === "N4" ? right.normalizedPattern : "",
        "ja",
      ) ||
      left.id.localeCompare(right.id, "en"),
  );
  if (
    sortedN4.map(({ id }) => id).join("\n") !==
    bundle.grammar.n4.map(({ id }) => id).join("\n")
  ) {
    errors.push(
      "N4 grammar must be sorted by curriculumOrder, category, normalizedPattern, and ID",
    );
  }

  const n4ByNormalizedPattern = new Map<string, GrammarRecord[]>();
  for (const record of bundle.grammar.n4) {
    if (record.level !== "N4") continue;
    const surfaces = new Set(
      [record.pattern, ...record.alternatePatterns].map(
        normalizedGrammarSurface,
      ),
    );
    for (const surface of surfaces) {
      n4ByNormalizedPattern.set(surface, [
        ...(n4ByNormalizedPattern.get(surface) ?? []),
        record,
      ]);
    }
  }
  for (const [surface, records] of n4ByNormalizedPattern) {
    if (records.length < 2) continue;
    for (const record of records) {
      const otherIds = records
        .filter(({ id }) => id !== record.id)
        .map(({ id }) => id);
      if (
        !otherIds.every((id) => record.confusedWithGrammarIds.includes(id))
      ) {
        errors.push(
          `Same-surface N4 grammar ${surface} must link distinct meanings through confusedWithGrammarIds`,
        );
        break;
      }
    }
  }

  const n5IdsBySurface = new Map<string, string[]>();
  for (const record of bundle.grammar.n5) {
    if (record.level !== "N5") continue;
    for (const surface of [record.pattern, ...record.alternatePatterns]) {
      const key = normalizedGrammarSurface(surface);
      n5IdsBySurface.set(key, [
        ...(n5IdsBySurface.get(key) ?? []),
        record.id,
      ]);
    }
  }
  for (const record of bundle.grammar.n4) {
    if (record.level !== "N4") continue;
    const collisions = new Set<string>();
    for (const surface of [record.pattern, ...record.alternatePatterns]) {
      for (const id of n5IdsBySurface.get(normalizedGrammarSurface(surface)) ?? []) {
        collisions.add(id);
      }
    }
    if (
      collisions.size > 0 &&
      ![...collisions].some(
        (id) =>
          record.extendsGrammarId === id ||
          record.relatedGrammarIds.includes(id) ||
          record.confusedWithGrammarIds.includes(id),
      )
    ) {
      errors.push(
        `${record.id} duplicates an N5 surface without an explicit extension or semantic relationship`,
      );
    }
  }

  const introductionUnitByItem = new Map<string, CurriculumUnit>();
  const newAssignments = new Map<string, string[]>();
  const unitsByLevel = {
    N5: bundle.curriculum.n5,
    N4: bundle.curriculum.n4,
  } as const;
  for (const level of ["N5", "N4"] as const) {
    const levelUnits = unitsByLevel[level];
    const expectedOrders = Array.from(
      { length: levelUnits.length },
      (_, index) => index + 1,
    );
    const actualOrders = levelUnits.map(({ order }) => order).sort((a, b) => a - b);
    if (actualOrders.join(",") !== expectedOrders.join(",")) {
      errors.push(`${level} curriculum unit orders must be unique and contiguous`);
    }
  }
  for (const unit of units) {
    const limits = CURRICULUM_UNIT_LIMITS[unit.level];
    if (unit.vocabularyIds.length > limits.vocabulary) {
      errors.push(
        `${unit.id} introduces ${unit.vocabularyIds.length} vocabulary items (maximum ${limits.vocabulary})`,
      );
    }
    if (unit.kanjiIds.length > limits.kanji) {
      errors.push(
        `${unit.id} introduces ${unit.kanjiIds.length} kanji (maximum ${limits.kanji})`,
      );
    }
    if (unit.grammarIds.length > limits.grammar) {
      errors.push(
        `${unit.id} introduces ${unit.grammarIds.length} grammar patterns (maximum ${limits.grammar})`,
      );
    }
    for (const [label, values] of [
      ["vocabularyIds", unit.vocabularyIds],
      ["kanjiIds", unit.kanjiIds],
      ["grammarIds", unit.grammarIds],
      ["kanaFirstVocabularyIds", unit.kanaFirstVocabularyIds],
      ["reviewVocabularyIds", unit.reviewVocabularyIds],
      ["reviewKanjiIds", unit.reviewKanjiIds],
      ["reviewGrammarIds", unit.reviewGrammarIds],
    ] as const) {
      for (const duplicate of duplicateValues(values)) {
        errors.push(`${unit.id}.${label} contains duplicate ${duplicate}`);
      }
    }
    for (const id of unit.vocabularyIds) {
      if (!vocabularyIds.has(id)) errors.push(`${unit.id} references missing vocabulary ${id}`);
    }
    for (const id of unit.kanjiIds) {
      if (!kanjiIds.has(id)) errors.push(`${unit.id} references missing kanji ${id}`);
    }
    for (const id of unit.grammarIds) {
      if (!grammarIds.has(id)) errors.push(`${unit.id} references missing grammar ${id}`);
    }
    for (const id of unit.prerequisiteUnitIds) {
      if (!unitIds.has(id)) errors.push(`${unit.id} references missing prerequisite unit ${id}`);
    }
    for (const reference of unit.sourceReferences) {
      if (!sourceIds.has(reference.sourceId)) {
        errors.push(`${unit.id} references unknown source ${reference.sourceId}`);
      }
    }
    for (const id of [
      ...unit.vocabularyIds,
      ...unit.kanjiIds,
      ...unit.grammarIds,
    ]) {
      const assigned = [...(newAssignments.get(id) ?? [])];
      if (!assigned.includes(unit.id)) assigned.push(unit.id);
      newAssignments.set(id, assigned);
      introductionUnitByItem.set(id, unit);
      const level = itemLevel(id, vocabularyById, kanjiById, grammarById);
      if (level && level !== unit.level) {
        errors.push(`${unit.id} introduces ${id} from ${level}`);
      }
    }
    if (unit.releaseReady) {
      for (const id of [
        ...unit.vocabularyIds,
        ...unit.kanjiIds,
        ...unit.grammarIds,
        ...unit.reviewVocabularyIds,
        ...unit.reviewKanjiIds,
        ...unit.reviewGrammarIds,
      ]) {
        const record =
          vocabularyById.get(id) ?? kanjiById.get(id) ?? grammarById.get(id);
        if (!record?.releaseReady) {
          errors.push(`${unit.id} is release-ready but contains non-release item ${id}`);
        }
      }
    }
  }
  for (const [id, assignedUnits] of newAssignments) {
    if (assignedUnits.length > 1) {
      errors.push(
        `${id} is introduced as new content in multiple units: ${assignedUnits.join(", ")}`,
      );
    }
  }

  const globallyIntroducedKanji = new Set<string>();
  const globallyIntroducedVocabulary = new Set<string>();
  const globallyIntroducedGrammar = new Set<string>();
  for (const unit of units) {
    const kanaFirst = new Set(unit.kanaFirstVocabularyIds);
    for (const id of unit.vocabularyIds) {
      const record = vocabularyById.get(id);
      if (
        record?.kanjiIds.some((kanjiId) => !globallyIntroducedKanji.has(kanjiId)) &&
        !kanaFirst.has(id)
      ) {
        errors.push(
          `${unit.id} introduces ${id} before required kanji without kana-first marking`,
        );
      }
    }
    for (const id of unit.reviewVocabularyIds) {
      if (!globallyIntroducedVocabulary.has(id)) {
        errors.push(`${unit.id} reviews vocabulary before introduction: ${id}`);
      }
    }
    for (const id of unit.reviewKanjiIds) {
      if (!globallyIntroducedKanji.has(id)) {
        errors.push(`${unit.id} reviews kanji before introduction: ${id}`);
      }
    }
    for (const id of unit.reviewGrammarIds) {
      if (!globallyIntroducedGrammar.has(id)) {
        errors.push(`${unit.id} reviews grammar before introduction: ${id}`);
      }
    }
    for (const id of unit.vocabularyIds) globallyIntroducedVocabulary.add(id);
    for (const id of unit.kanjiIds) globallyIntroducedKanji.add(id);
    for (const id of unit.grammarIds) globallyIntroducedGrammar.add(id);
  }

  for (const unit of units) {
    for (const prerequisiteId of unit.prerequisiteUnitIds) {
      const prerequisite = unitById.get(prerequisiteId);
      if (!prerequisite) continue;
      if (
        prerequisite.level === "N4" &&
        (unit.level === "N5" || prerequisite.order >= unit.order)
      ) {
        errors.push(`${unit.id} depends on later or invalid N4 unit ${prerequisiteId}`);
      }
      if (
        prerequisite.level === unit.level &&
        prerequisite.order >= unit.order
      ) {
        errors.push(`${unit.id} depends on later same-level unit ${prerequisiteId}`);
      }
      if (unit.releaseReady && !prerequisite.releaseReady) {
        errors.push(
          `${unit.id} is release-ready but prerequisite ${prerequisiteId} is not`,
        );
      }
    }
    for (const grammarId of unit.grammarIds) {
      const record = grammarById.get(grammarId);
      for (const prerequisiteId of record?.prerequisiteGrammarIds ?? []) {
        const prerequisiteUnit = introductionUnitByItem.get(prerequisiteId);
        const validEarlierPrerequisite = Boolean(
          prerequisiteUnit &&
            ((prerequisiteUnit.level === unit.level &&
              prerequisiteUnit.order < unit.order) ||
              (unit.level === "N4" && prerequisiteUnit.level === "N5")),
        );
        if (!validEarlierPrerequisite) {
          errors.push(
            `${unit.id} introduces ${grammarId} before grammar prerequisite ${prerequisiteId}`,
          );
        }
      }
    }
  }

  const hasN5Ancestor = (unit: CurriculumUnit, visited = new Set<string>()): boolean => {
    if (visited.has(unit.id)) return false;
    visited.add(unit.id);
    return unit.prerequisiteUnitIds.some((id) => {
      const prerequisite = unitById.get(id);
      return Boolean(
        prerequisite &&
          (prerequisite.level === "N5" || hasN5Ancestor(prerequisite, visited)),
      );
    });
  };
  for (const unit of bundle.curriculum.n4) {
    if (bundle.curriculum.n5.length > 0 && !hasN5Ancestor(unit)) {
      errors.push(`${unit.id} has no transitive N5 prerequisite`);
    }
  }
  for (const cycle of prerequisiteCycles(units)) {
    errors.push(`Curriculum prerequisite cycle: ${cycle.join(" -> ")}`);
  }
  for (const mapping of bundle.textbookMap) {
    for (const id of mapping.vocabularyIds) {
      if (!vocabularyIds.has(id)) errors.push(`Textbook map references missing vocabulary ${id}`);
    }
    for (const id of mapping.kanjiIds) {
      if (!kanjiIds.has(id)) errors.push(`Textbook map references missing kanji ${id}`);
    }
    for (const id of mapping.grammarIds) {
      if (!grammarIds.has(id)) errors.push(`Textbook map references missing grammar ${id}`);
    }
    if (
      mapping.confidence >= 0.8 &&
      (mapping.sourcePages.length === 0 ||
        mapping.lessonHeadingStatus !== "detected")
    ) {
      errors.push(
        `${mapping.sourceBook} lesson ${mapping.lesson} claims high confidence without a detected heading and source pages`,
      );
    }
    if (mapping.releaseReady) {
      errors.push(
        `${mapping.sourceBook} lesson ${mapping.lesson} OCR placement cannot be release-ready automatically`,
      );
    }
  }
  if (bundle.grammar.n4.length === 0) {
    warnings.push("N4 grammar output is empty because no N4 grammar mapping source was supplied.");
  }
  if (bundle.textbookMap.length === 0) {
    warnings.push("Textbook curriculum mapping is empty because no local OCR cache is available.");
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export async function loadContentBundle(): Promise<ContentBundle> {
  return {
    vocabulary: {
      n5: await readJson(`${OUTPUT_ROOT}/vocabulary/n5.json`),
      n4: await readJson(`${OUTPUT_ROOT}/vocabulary/n4.json`),
      supplemental: await readJson(`${OUTPUT_ROOT}/vocabulary/supplemental.json`),
    },
    kanji: {
      n5: await readJson(`${OUTPUT_ROOT}/kanji/n5.json`),
      n4: await readJson(`${OUTPUT_ROOT}/kanji/n4.json`),
      components: await readJson(`${OUTPUT_ROOT}/kanji/components.json`),
    },
    grammar: {
      n5: await readJson(`${OUTPUT_ROOT}/grammar/n5.json`),
      n4: await readJson(`${OUTPUT_ROOT}/grammar/n4.json`),
    },
    curriculum: {
      n5: await readJson(`${OUTPUT_ROOT}/curriculum/units-n5.json`),
      n4: await readJson(`${OUTPUT_ROOT}/curriculum/units-n4.json`),
    },
    learningContent: await readJson(
      `${OUTPUT_ROOT}/learning-content/index.json`,
    ),
    assessments: {
      schemaVersion: 1,
      blueprints: await readJson(`${OUTPUT_ROOT}/assessments/blueprints.json`),
      presets: await readJson(`${OUTPUT_ROOT}/assessments/presets.json`),
      bundledExams: await readJson(`${OUTPUT_ROOT}/assessments/bundled-mock-exams-all.json`),
      sampleSnapshots: await readJson<AssessmentCollections["sampleSnapshots"]>(`${OUTPUT_ROOT}/assessments/assessment-snapshots.json`).then((snapshots) => snapshots.filter(({ assessmentType }) => assessmentType !== "full-mock")),
    },
    textbookMap: await readJson(
      `${OUTPUT_ROOT}/curriculum/textbook-curriculum-map.json`,
    ),
    sourceRegistry: await readJson(`${OUTPUT_ROOT}/source-registry.json`),
  };
}

if (isDirectExecution(import.meta.url)) {
  runCli(async () => {
    const result = await validateContentBundle(await loadContentBundle());
    await writeJson(`${OUTPUT_ROOT}/reports/validation-results.json`, result);
    if (result.errors.length > 0) {
      throw new Error(`Content validation failed:\n${result.errors.join("\n")}`);
    }
    console.log(`Content validation passed with ${result.warnings.length} warning(s).`);
  });
}
