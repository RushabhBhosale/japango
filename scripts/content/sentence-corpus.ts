import path from "node:path";

import { deterministicJapaneseNaturalnessIssues } from "../../backend/src/ai/japanese-generation";
import {
  learningContentCollectionsSchema,
  type GrammarExampleView,
  type LearningContentCollections,
  type Sentence,
} from "../../src/features/learning-content/schemas";
import { SOURCE_PATHS } from "./config";
import { readJson } from "./lib/fs-utils";
import { loadPhase96KanjiSupport } from "./phase96-kanji-support";
import { loadPhase10VocabularySupport } from "./phase10-vocabulary-support";
import type {
  GrammarRecord,
  CurriculumUnit,
  VocabularyRecord,
} from "./schemas/content-schemas";

export interface SentenceCorpusCatalog {
  grammar: readonly GrammarRecord[];
  curriculumUnits: readonly CurriculumUnit[];
  vocabulary?: readonly VocabularyRecord[];
}

export interface GrammarCoverageRow {
  grammarId: string;
  level: "N5" | "N4";
  pattern: string;
  approvedPrimaryCount: number;
  approvedSecondaryCount: number;
  requiredMinimum: number;
  contexts: string[];
  registers: string[];
  sentenceTypes: string[];
  contrastCovered: boolean;
  releaseReady: boolean;
  status: "pass" | "fail";
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function emptyCollections(): LearningContentCollections {
  return {
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
  };
}

function combineCollections(
  collections: readonly LearningContentCollections[],
): LearningContentCollections {
  const combined = emptyCollections();
  for (const collection of collections) {
    combined.sentences.push(...collection.sentences);
    combined.readingPassages.push(...collection.readingPassages);
    combined.listeningSpeakers.push(...collection.listeningSpeakers);
    combined.listeningActivities.push(...collection.listeningActivities);
    combined.grammarExampleViews.push(...collection.grammarExampleViews);
    combined.vocabularyExampleViews.push(...collection.vocabularyExampleViews);
    combined.kanjiExampleViews.push(...collection.kanjiExampleViews);
    combined.questions.push(...collection.questions);
    combined.questionOptions.push(...collection.questionOptions);
    combined.learningItemMetadata.push(...collection.learningItemMetadata);
    combined.questionTargetRelationships.push(
      ...collection.questionTargetRelationships,
    );
  }
  combined.sentences.sort((left, right) => compareStable(left.id, right.id));
  combined.readingPassages.sort((left, right) => compareStable(left.id, right.id));
  combined.listeningSpeakers.sort((left, right) => compareStable(left.id, right.id));
  combined.listeningActivities.sort((left, right) => compareStable(left.id, right.id));
  combined.grammarExampleViews.sort((left, right) =>
    compareStable(left.id, right.id),
  );
  combined.vocabularyExampleViews.sort((left, right) =>
    compareStable(left.id, right.id),
  );
  combined.kanjiExampleViews.sort((left, right) =>
    compareStable(left.id, right.id),
  );
  combined.learningItemMetadata.sort((left, right) =>
    compareStable(left.id, right.id),
  );
  return combined;
}

function normalizedDuplicateKey(value: string): string {
  return value.normalize("NFKC").replace(/[。！？!?、,\s]/gu, "");
}

function readingLooksAligned(sentence: Sentence): boolean {
  const japanesePunctuation = sentence.japanese.match(/[。！？、]/gu) ?? [];
  const readingPunctuation = sentence.reading.match(/[。！？、]/gu) ?? [];
  if (japanesePunctuation.join("") !== readingPunctuation.join("")) return false;
  return !/\p{Script=Han}/u.test(sentence.reading);
}

function exactlyOnePrimaryGrammarErrors(
  sentences: readonly Sentence[],
  views: readonly GrammarExampleView[],
): string[] {
  const focusCount = new Map<string, number>();
  for (const view of views) {
    if (view.role === "focus") {
      focusCount.set(view.sentenceId, (focusCount.get(view.sentenceId) ?? 0) + 1);
    }
  }
  return sentences
    .filter((sentence) => focusCount.get(sentence.id) !== 1)
    .map(
      (sentence) =>
        `${sentence.id} must have exactly one primary grammar relationship (found ${focusCount.get(sentence.id) ?? 0})`,
    );
}

export function sentenceCorpusErrors(
  content: LearningContentCollections,
  catalog: SentenceCorpusCatalog,
): string[] {
  const errors = exactlyOnePrimaryGrammarErrors(
    content.sentences,
    content.grammarExampleViews,
  );
  const sentenceById = new Map(
    content.sentences.map((sentence) => [sentence.id, sentence]),
  );
  const grammarById = new Map(
    catalog.grammar.map((grammar) => [grammar.id, grammar]),
  );
  const unitIds = new Set(catalog.curriculumUnits.map(({ id }) => id));
  const exact = new Map<string, string[]>();
  const normalized = new Map<string, string[]>();
  for (const sentence of content.sentences) {
    exact.set(sentence.japanese, [
      ...(exact.get(sentence.japanese) ?? []),
      sentence.id,
    ]);
    const duplicateKey = normalizedDuplicateKey(sentence.japanese);
    normalized.set(duplicateKey, [
      ...(normalized.get(duplicateKey) ?? []),
      sentence.id,
    ]);
    if (!readingLooksAligned(sentence)) {
      errors.push(`${sentence.id} has a reading/punctuation alignment issue`);
    }
    if (!sentence.english.trim()) {
      errors.push(`${sentence.id} has no English translation`);
    }
    for (const issue of deterministicJapaneseNaturalnessIssues(sentence.japanese)) {
      errors.push(`${sentence.id} failed Japanese naturalness preflight: ${issue}`);
    }
    if (sentence.curriculumUnitIds.length === 0) {
      errors.push(`${sentence.id} has no curriculum relationship`);
    }
    for (const unitId of sentence.curriculumUnitIds) {
      if (!unitIds.has(unitId)) {
        errors.push(`${sentence.id} references missing curriculum unit ${unitId}`);
      }
    }
    if (sentence.reviewStatus === "rejected") {
      errors.push(`${sentence.id} is rejected and cannot enter generated output`);
    }
  }
  for (const [japanese, ids] of exact) {
    if (ids.length > 1) {
      errors.push(`Exact duplicate Japanese sentence ${japanese}: ${ids.join(", ")}`);
    }
  }
  for (const [key, ids] of normalized) {
    if (ids.length > 1 && !exact.has(key)) {
      errors.push(`Punctuation-only duplicate sentence ${key}: ${ids.join(", ")}`);
    }
  }
  for (const view of content.grammarExampleViews) {
    const sentence = sentenceById.get(view.sentenceId);
    const grammar = grammarById.get(view.grammarId);
    if (!sentence || !grammar) continue;
    if (
      sentence.difficulty.jlptLevel !== grammar.level &&
      view.role === "focus"
    ) {
      errors.push(
        `${view.id} uses ${sentence.difficulty.jlptLevel} content for ${grammar.level} grammar`,
      );
    }
    if (view.role === "focus" && view.focusRanges.length !== 1) {
      errors.push(`${view.id} primary grammar must have one focus range`);
    }
  }
  for (const row of grammarCoverage(content, catalog.grammar)) {
    if (row.status === "fail") {
      errors.push(
        `${row.grammarId} has ${row.approvedPrimaryCount}/${row.requiredMinimum} approved primary examples`,
      );
    }
  }
  return [...new Set(errors)].sort(compareStable);
}

export function grammarCoverage(
  content: LearningContentCollections,
  grammar: readonly GrammarRecord[],
): GrammarCoverageRow[] {
  const sentenceById = new Map(
    content.sentences.map((sentence) => [sentence.id, sentence]),
  );
  const viewsByGrammar = new Map<string, GrammarExampleView[]>();
  for (const view of content.grammarExampleViews) {
    viewsByGrammar.set(view.grammarId, [
      ...(viewsByGrammar.get(view.grammarId) ?? []),
      view,
    ]);
  }
  return grammar
    .filter((record) => record.level === "N5" || record.releaseReady)
    .map((record) => {
      const views = viewsByGrammar.get(record.id) ?? [];
      const approvedPrimary = views.filter(
        (view) =>
          view.role === "focus" &&
          sentenceById.get(view.sentenceId)?.reviewStatus === "approved",
      );
      const approvedSecondary = views.filter(
        (view) =>
          view.role === "supporting" &&
          sentenceById.get(view.sentenceId)?.reviewStatus === "approved",
      );
      const sentences = approvedPrimary
        .map((view) => sentenceById.get(view.sentenceId))
        .filter((sentence): sentence is Sentence => Boolean(sentence));
      const requiredMinimum = record.level === "N5" ? 3 : 4;
      return {
        grammarId: record.id,
        level: record.level,
        pattern: record.pattern,
        approvedPrimaryCount: approvedPrimary.length,
        approvedSecondaryCount: approvedSecondary.length,
        requiredMinimum,
        contexts: [
          ...new Set(sentences.flatMap(({ context }) => context.settingTags)),
        ].sort(compareStable),
        registers: [...new Set(sentences.map(({ register }) => register))].sort(
          compareStable,
        ),
        sentenceTypes: [
          ...new Set(sentences.map(({ sentenceType }) => sentenceType)),
        ].sort(compareStable),
        contrastCovered: sentences.some(({ tags }) =>
          tags.includes("contrast-aware"),
        ),
        releaseReady: record.releaseReady,
        status:
          approvedPrimary.length >= requiredMinimum ? "pass" : "fail",
      } satisfies GrammarCoverageRow;
    })
    .sort((left, right) => compareStable(left.grammarId, right.grammarId));
}

export async function loadSentenceCorpus(
  catalog: SentenceCorpusCatalog,
): Promise<LearningContentCollections> {
  const [n5Raw, n4Raw, phase96] = await Promise.all([
    readJson<unknown>(SOURCE_PATHS.sentenceCorpusN5),
    readJson<unknown>(SOURCE_PATHS.sentenceCorpusN4),
    loadPhase96KanjiSupport(),
  ]);
  const n5 = learningContentCollectionsSchema.parse(n5Raw);
  const n4 = learningContentCollectionsSchema.parse(n4Raw);
  const phase10 = catalog.vocabulary
    ? await loadPhase10VocabularySupport(
      catalog.vocabulary,
      [...n5.sentences, ...n4.sentences, ...phase96.sentences],
      catalog.curriculumUnits,
    )
    : emptyCollections();
  const combined = learningContentCollectionsSchema.parse(
    combineCollections([n5, n4, phase96, phase10]),
  );
  const errors = sentenceCorpusErrors(combined, catalog);
  if (errors.length > 0) {
    throw new Error(
      `Sentence corpus contains ${errors.length} release-blocking error(s):\n${errors
        .slice(0, 25)
        .join("\n")}`,
    );
  }
  return combined;
}

export function sentenceCorpusPath(level: "N5" | "N4"): string {
  return path.resolve(
    level === "N5" ? SOURCE_PATHS.sentenceCorpusN5 : SOURCE_PATHS.sentenceCorpusN4,
  );
}
