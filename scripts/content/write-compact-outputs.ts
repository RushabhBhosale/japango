import path from "node:path";

import type { LearningContentCollections } from "../../src/features/learning-content/schemas";
import type { AssessmentCollections } from "../../src/features/assessment/platform-schemas";
import { COMPACT_OUTPUT_ROOT, CONTENT_SCHEMA_VERSION } from "./config";
import { contentVersionForSources } from "./content-version";
import { sha256Text, writeJson } from "./lib/fs-utils";
import type { CurriculumUnit } from "./schemas/content-schemas";
import type { ContentBundle } from "./validate-content";

export type CompactContentProfile = "development" | "release";

export type CompactOutputOptions =
  | Readonly<{ profile: "release"; releaseReadyOnly: true }>
  | Readonly<{ profile: "development"; releaseReadyOnly: false }>;

export interface CompactCurriculumItem {
  id: string;
  type: "vocabulary" | "kanji" | "grammar";
  level: "N5" | "N4";
  title: string;
  meaning?: string;
  reading?: string;
  explanation?: string;
  tags: string[];
  confidence: number;
  needsReview: boolean;
  releaseReady: boolean;
}

export interface CompactContentBundle {
  schemaVersion: string;
  contentVersion: string;
  checksum: string;
  profile: CompactContentProfile;
  releaseReadyOnly: boolean;
  records: CompactCurriculumItem[];
  curriculumUnits: CurriculumUnit[];
  learningContent: LearningContentCollections;
  assessments: AssessmentCollections;
  counts: {
    records: number;
    vocabulary: number;
    kanji: number;
    grammar: number;
    curriculumUnits: number;
    learningContent: {
      sentences: number;
      readingPassages: number;
      listeningSpeakers: number;
      listeningActivities: number;
      grammarExampleViews: number;
      vocabularyExampleViews: number;
      kanjiExampleViews: number;
      questions: number;
      questionOptions: number;
      learningItemMetadata: number;
      questionTargetRelationships: number;
    };
  };
}

type CompactContentPayload = Omit<CompactContentBundle, "checksum">;

function sortedReadyRecords<T extends { id: string; releaseReady: boolean }>(
  records: readonly T[],
  releaseReadyOnly: boolean,
): T[] {
  return records
    .filter((record) => !releaseReadyOnly || record.releaseReady)
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
}

function sortedReadyQuestionOptions(
  records: LearningContentCollections["questionOptions"],
  releaseReadyOnly: boolean,
): LearningContentCollections["questionOptions"] {
  return records
    .filter((record) => !releaseReadyOnly || record.releaseReady)
    .sort(
      (left, right) =>
        left.questionId.localeCompare(right.questionId, "en") ||
        left.position - right.position ||
        left.id.localeCompare(right.id, "en"),
    );
}

function compactLearningContent(
  learningContent: LearningContentCollections,
  releaseReadyOnly: boolean,
  includedCurriculumUnitIds: ReadonlySet<string>,
): LearningContentCollections {
  return {
    schemaVersion: learningContent.schemaVersion,
    sentences: sortedReadyRecords(learningContent.sentences, releaseReadyOnly).map(
      (sentence) => ({
        ...sentence,
        curriculumUnitIds: sentence.curriculumUnitIds.filter((id) =>
          includedCurriculumUnitIds.has(id),
        ),
      }),
    ),
    readingPassages: sortedReadyRecords(
      learningContent.readingPassages,
      releaseReadyOnly,
    ).map((passage) => ({
      ...passage,
      curriculumUnitIds: passage.curriculumUnitIds.filter((id) =>
        includedCurriculumUnitIds.has(id),
      ),
    })),
    listeningSpeakers: sortedReadyRecords(learningContent.listeningSpeakers, releaseReadyOnly),
    listeningActivities: sortedReadyRecords(learningContent.listeningActivities, releaseReadyOnly).map((activity) => ({ ...activity, curriculumUnitIds: activity.curriculumUnitIds.filter((id) => includedCurriculumUnitIds.has(id)) })),
    grammarExampleViews: sortedReadyRecords(
      learningContent.grammarExampleViews,
      releaseReadyOnly,
    ),
    vocabularyExampleViews: sortedReadyRecords(
      learningContent.vocabularyExampleViews,
      releaseReadyOnly,
    ),
    kanjiExampleViews: sortedReadyRecords(
      learningContent.kanjiExampleViews,
      releaseReadyOnly,
    ),
    questions: sortedReadyRecords(
      learningContent.questions,
      releaseReadyOnly,
    ),
    questionOptions: sortedReadyQuestionOptions(
      learningContent.questionOptions,
      releaseReadyOnly,
    ),
    learningItemMetadata: sortedReadyRecords(
      learningContent.learningItemMetadata,
      releaseReadyOnly,
    ),
    questionTargetRelationships: sortedReadyRecords(
      learningContent.questionTargetRelationships,
      releaseReadyOnly,
    ),
  };
}

function primaryReading(
  readings: readonly { kana: string; primary: boolean }[],
): string | undefined {
  return readings.find(({ primary }) => primary)?.kana ?? readings[0]?.kana;
}

function releaseUnitClosure(
  unit: CurriculumUnit,
  readyItemIds: ReadonlySet<string>,
  readyUnitIds: ReadonlySet<string>,
): boolean {
  return (
    unit.releaseReady &&
    [
      ...unit.vocabularyIds,
      ...unit.kanjiIds,
      ...unit.grammarIds,
      ...unit.reviewVocabularyIds,
      ...unit.reviewKanjiIds,
      ...unit.reviewGrammarIds,
    ].every((id) => readyItemIds.has(id)) &&
    unit.prerequisiteUnitIds.every((id) => readyUnitIds.has(id))
  );
}

export function createCompactContentBundle(
  bundle: ContentBundle,
  options: CompactOutputOptions,
): CompactContentBundle {
  const vocabulary = [
    ...bundle.vocabulary.n5,
    ...bundle.vocabulary.n4,
  ].map(
    (record): CompactCurriculumItem => ({
      id: record.id,
      type: "vocabulary",
      level: record.jlpt.level as "N5" | "N4",
      title: record.primaryForm,
      meaning: record.senses[0]?.definitions[0],
      reading: primaryReading(record.readings),
      tags: [...record.topicTags, ...record.partOfSpeech],
      confidence: record.confidence,
      needsReview: record.needsReview,
      releaseReady: record.releaseReady,
    }),
  );
  const kanji = [...bundle.kanji.n5, ...bundle.kanji.n4].map(
    (record): CompactCurriculumItem => ({
      id: record.id,
      type: "kanji",
      level: record.jlpt.level === "N4" ? "N4" : "N5",
      title: record.character,
      meaning: record.meanings[0],
      reading: record.readings.kun[0] ?? record.readings.on[0],
      tags: record.components,
      confidence: record.confidence,
      needsReview: record.needsReview,
      releaseReady: record.releaseReady,
    }),
  );
  const grammar = [...bundle.grammar.n5, ...bundle.grammar.n4].map(
    (record): CompactCurriculumItem =>
      record.level === "N4"
        ? {
            id: record.id,
            type: "grammar",
            level: record.level,
            title: record.pattern,
            meaning: record.meanings[0],
            tags: [record.contentType, record.category, record.familyId],
            confidence: record.confidence,
            needsReview: record.needsReview,
            releaseReady: record.releaseReady,
          }
        : {
            id: record.id,
            type: "grammar",
            level: record.level,
            title: record.pattern,
            ...(record.shortExplanation
              ? { explanation: record.shortExplanation }
              : {}),
            tags: [],
            confidence: record.confidence,
            needsReview: record.needsReview,
            releaseReady: record.releaseReady,
          },
  );
  const allRecords = [...vocabulary, ...kanji, ...grammar].sort((left, right) =>
    left.id.localeCompare(right.id, "ja"),
  );
  const records = options.releaseReadyOnly
    ? allRecords.filter(({ releaseReady }) => releaseReady)
    : allRecords;
  const readyItemIds = new Set(records.map(({ id }) => id));
  const allUnits = [...bundle.curriculum.n5, ...bundle.curriculum.n4].sort(
    (left, right) =>
      (left.level === "N5" ? 0 : 1) - (right.level === "N5" ? 0 : 1) ||
      left.order - right.order,
  );
  const curriculumUnits: CurriculumUnit[] = [];
  if (options.releaseReadyOnly) {
    const readyUnitIds = new Set<string>();
    for (const unit of allUnits) {
      if (releaseUnitClosure(unit, readyItemIds, readyUnitIds)) {
        curriculumUnits.push(unit);
        readyUnitIds.add(unit.id);
      }
    }
  } else {
    curriculumUnits.push(...allUnits);
  }
  const learningContent = compactLearningContent(
    bundle.learningContent,
    options.releaseReadyOnly,
    new Set(curriculumUnits.map(({ id }) => id)),
  );
  const payload: CompactContentPayload = {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentVersion: contentVersionForSources(bundle.sourceRegistry),
    profile: options.profile,
    releaseReadyOnly: options.releaseReadyOnly,
    records,
    curriculumUnits,
    learningContent,
    assessments: options.releaseReadyOnly
      ? { schemaVersion: 1, blueprints: [], presets: [], bundledExams: [], sampleSnapshots: [] }
      : bundle.assessments,
    counts: {
      records: records.length,
      vocabulary: records.filter(({ type }) => type === "vocabulary").length,
      kanji: records.filter(({ type }) => type === "kanji").length,
      grammar: records.filter(({ type }) => type === "grammar").length,
      curriculumUnits: curriculumUnits.length,
      learningContent: {
        sentences: learningContent.sentences.length,
        readingPassages: learningContent.readingPassages.length,
        listeningSpeakers: learningContent.listeningSpeakers.length,
        listeningActivities: learningContent.listeningActivities.length,
        grammarExampleViews: learningContent.grammarExampleViews.length,
        vocabularyExampleViews:
          learningContent.vocabularyExampleViews.length,
        kanjiExampleViews: learningContent.kanjiExampleViews.length,
        questions: learningContent.questions.length,
        questionOptions: learningContent.questionOptions.length,
        learningItemMetadata: learningContent.learningItemMetadata.length,
        questionTargetRelationships:
          learningContent.questionTargetRelationships.length,
      },
    },
  };
  return {
    ...payload,
    checksum: `sha256:${sha256Text(JSON.stringify(payload))}`,
  };
}

export async function writeCompactOutputs(bundle: ContentBundle): Promise<void> {
  const development = createCompactContentBundle(bundle, {
    profile: "development",
    releaseReadyOnly: false,
  });
  const release = createCompactContentBundle(bundle, {
    profile: "release",
    releaseReadyOnly: true,
  });
  await Promise.all([
    writeJson(
      path.join(COMPACT_OUTPUT_ROOT, "development/content.json"),
      development,
    ),
    writeJson(path.join(COMPACT_OUTPUT_ROOT, "release/content.json"), release),
  ]);
}
