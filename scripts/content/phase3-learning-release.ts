import { z } from "zod";

import type {
  LearningContentCollections,
  ListeningActivity,
  ListeningSpeaker,
  ReadingPassage,
} from "../../src/features/learning-content/schemas";
import { SOURCE_PATHS } from "./config";
import { readJson } from "./lib/fs-utils";
import type {
  CurriculumUnit,
  GrammarRecord,
  KanjiRecord,
  VocabularyRecord,
} from "./schemas/content-schemas";

const promotionSourceId = "japango-phase3-initial-learning-release";

const selectionSchema = z.object({
  schemaVersion: z.literal(1),
  readingPassageIds: z.array(z.string().min(1)).length(30),
  listeningActivityIds: z.array(z.string().min(1)).length(30),
}).strict();

export interface Phase3ReleaseCatalog {
  grammar: readonly GrammarRecord[];
  vocabulary: readonly VocabularyRecord[];
  kanji: readonly KanjiRecord[];
  curriculumUnits: readonly CurriculumUnit[];
}

export interface Phase3ReleaseSelection {
  readingPassageIds: readonly string[];
  listeningActivityIds: readonly string[];
}

interface ReleaseIdSets {
  grammar: ReadonlySet<string>;
  vocabulary: ReadonlySet<string>;
  kanji: ReadonlySet<string>;
  curriculumUnits: ReadonlySet<string>;
}

function stable(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function appendPromotionSource(sourceIds: readonly string[]): string[] {
  return stable([...sourceIds, promotionSourceId]);
}

function releaseIds(catalog: Phase3ReleaseCatalog): ReleaseIdSets {
  return {
    grammar: new Set(catalog.grammar.filter(({ releaseReady }) => releaseReady).map(({ id }) => id)),
    vocabulary: new Set(catalog.vocabulary.filter(({ releaseReady }) => releaseReady).map(({ id }) => id)),
    kanji: new Set(catalog.kanji.filter(({ releaseReady }) => releaseReady).map(({ id }) => id)),
    curriculumUnits: new Set(catalog.curriculumUnits.filter(({ releaseReady }) => releaseReady).map(({ id }) => id)),
  };
}

function promotedPassage(passage: ReadingPassage, ids: ReleaseIdSets): ReadingPassage {
  return {
    ...passage,
    grammarIds: passage.grammarIds.filter((id) => ids.grammar.has(id)),
    vocabularyIds: passage.vocabularyIds.filter((id) => ids.vocabulary.has(id)),
    kanjiIds: passage.kanjiIds.filter((id) => ids.kanji.has(id)),
    curriculumUnitIds: passage.curriculumUnitIds.filter((id) => ids.curriculumUnits.has(id)),
    sourceIds: appendPromotionSource(passage.sourceIds),
    reviewStatus: "approved",
    releaseBlockers: [],
    releaseReady: true,
  };
}

function promotedActivity(activity: ListeningActivity, ids: ReleaseIdSets): ListeningActivity {
  return {
    ...activity,
    grammarIds: activity.grammarIds.filter((id) => ids.grammar.has(id)),
    vocabularyIds: activity.vocabularyIds.filter((id) => ids.vocabulary.has(id)),
    kanjiIds: activity.kanjiIds.filter((id) => ids.kanji.has(id)),
    curriculumUnitIds: activity.curriculumUnitIds.filter((id) => ids.curriculumUnits.has(id)),
    sourceIds: appendPromotionSource(activity.sourceIds),
    reviewStatus: "approved",
    releaseBlockers: [],
    releaseReady: true,
  };
}

function selectedIdsFor(
  records: readonly { id: string; level: "N5" | "N4"; questionIds: readonly string[] }[],
  selectedIds: readonly string[],
  expectedQuestionsPerRecord: number,
  label: string,
): Set<string> {
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new Error(`Phase 3 ${label} selection contains duplicate IDs.`);
  }
  const selected = selectedIds.map((id) => records.find((record) => record.id === id));
  if (selected.some((record) => !record)) {
    throw new Error(`Phase 3 ${label} selection contains an unknown content ID.`);
  }
  const byLevel = selected.reduce<Record<"N5" | "N4", number>>(
    (counts, record) => ({ ...counts, [record!.level]: counts[record!.level] + 1 }),
    { N5: 0, N4: 0 },
  );
  if (byLevel.N5 !== 12 || byLevel.N4 !== 18) {
    throw new Error(`Phase 3 ${label} selection must contain 12 N5 and 18 N4 records.`);
  }
  const questionIds = selected.flatMap((record) => record!.questionIds);
  if (questionIds.length !== selectedIds.length * expectedQuestionsPerRecord || new Set(questionIds).size !== questionIds.length) {
    throw new Error(`Phase 3 ${label} selection must have exactly ${expectedQuestionsPerRecord} unique questions per record.`);
  }
  return new Set(questionIds);
}

export async function loadPhase3ReleaseSelection(): Promise<Phase3ReleaseSelection> {
  const source = selectionSchema.parse(await readJson<unknown>(SOURCE_PATHS.phase3InitialLearningRelease));
  return {
    readingPassageIds: stable(source.readingPassageIds),
    listeningActivityIds: stable(source.listeningActivityIds),
  };
}

export function promotePhase3ReadingContent(
  passages: readonly ReadingPassage[],
  questionFile: Pick<LearningContentCollections, "questions" | "questionOptions" | "learningItemMetadata" | "questionTargetRelationships">,
  selection: Phase3ReleaseSelection,
  catalog: Phase3ReleaseCatalog,
): Pick<LearningContentCollections, "readingPassages" | "questions" | "questionOptions" | "learningItemMetadata" | "questionTargetRelationships"> {
  const selectedPassageIds = new Set(selection.readingPassageIds);
  const selectedQuestionIds = selectedIdsFor(passages, selection.readingPassageIds, 4, "reading passage");
  const ids = releaseIds(catalog);
  return {
    readingPassages: passages.map((passage) => selectedPassageIds.has(passage.id) ? promotedPassage(passage, ids) : passage),
    questions: questionFile.questions.map((question) => selectedQuestionIds.has(question.id)
      ? { ...question, sourceIds: appendPromotionSource(question.sourceIds), releaseReady: true }
      : question),
    questionOptions: questionFile.questionOptions.map((option) => selectedQuestionIds.has(option.questionId)
      ? { ...option, releaseReady: true }
      : option),
    learningItemMetadata: questionFile.learningItemMetadata.map((metadata) => (
      metadata.itemType === "question" && selectedQuestionIds.has(metadata.itemId)
        ? { ...metadata, releaseReady: true }
        : metadata
    )),
    questionTargetRelationships: questionFile.questionTargetRelationships.map((relationship) => selectedQuestionIds.has(relationship.questionId)
      ? { ...relationship, releaseReady: true }
      : relationship),
  };
}

export function promotePhase3ListeningContent(
  activities: readonly ListeningActivity[],
  speakers: readonly ListeningSpeaker[],
  questionFile: Pick<LearningContentCollections, "questions" | "questionOptions" | "learningItemMetadata" | "questionTargetRelationships">,
  selection: Phase3ReleaseSelection,
  catalog: Phase3ReleaseCatalog,
): Pick<LearningContentCollections, "listeningSpeakers" | "listeningActivities" | "questions" | "questionOptions" | "learningItemMetadata" | "questionTargetRelationships"> {
  const selectedActivityIds = new Set(selection.listeningActivityIds);
  const selectedQuestionIds = selectedIdsFor(activities, selection.listeningActivityIds, 3, "listening activity");
  const selectedSpeakerIds = new Set(
    activities
      .filter(({ id }) => selectedActivityIds.has(id))
      .flatMap(({ speakerIds }) => speakerIds),
  );
  const ids = releaseIds(catalog);
  return {
    listeningSpeakers: speakers.map((speaker) => selectedSpeakerIds.has(speaker.id)
      ? { ...speaker, releaseReady: true }
      : speaker),
    listeningActivities: activities.map((activity) => selectedActivityIds.has(activity.id) ? promotedActivity(activity, ids) : activity),
    questions: questionFile.questions.map((question) => selectedQuestionIds.has(question.id)
      ? { ...question, sourceIds: appendPromotionSource(question.sourceIds), releaseReady: true }
      : question),
    questionOptions: questionFile.questionOptions.map((option) => selectedQuestionIds.has(option.questionId)
      ? { ...option, releaseReady: true }
      : option),
    learningItemMetadata: questionFile.learningItemMetadata.map((metadata) => (
      metadata.itemType === "question" && selectedQuestionIds.has(metadata.itemId)
        ? { ...metadata, releaseReady: true }
        : metadata
    )),
    questionTargetRelationships: questionFile.questionTargetRelationships.map((relationship) => selectedQuestionIds.has(relationship.questionId)
      ? { ...relationship, releaseReady: true }
      : relationship),
  };
}
