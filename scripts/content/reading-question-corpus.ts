import {
  learningContentCollectionsSchema,
  readingPassageSchema,
  type LearningContentCollections,
  type ReadingPassage,
} from "../../src/features/learning-content/schemas";
import { SOURCE_PATHS } from "./config";
import { readJson } from "./lib/fs-utils";
import type { CurriculumUnit, GrammarRecord, KanjiRecord, VocabularyRecord } from "./schemas/content-schemas";

interface ReadingQuestionFile {
  schemaVersion: 1;
  questions: LearningContentCollections["questions"];
  questionOptions: LearningContentCollections["questionOptions"];
  learningItemMetadata: LearningContentCollections["learningItemMetadata"];
  questionTargetRelationships: LearningContentCollections["questionTargetRelationships"];
}

export interface ReadingCatalog {
  grammar: readonly GrammarRecord[];
  vocabulary: readonly VocabularyRecord[];
  kanji: readonly KanjiRecord[];
  curriculumUnits: readonly CurriculumUnit[];
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedById<T extends { id: string }>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => compareStable(left.id, right.id));
}

function punctuation(value: string): string {
  return (value.match(/[。！？、：]/gu) ?? []).join("");
}

function expectedRange(passage: ReadingPassage): [number, number] | null {
  if (passage.passageType === "practical") return null;
  if (passage.level === "N5" && passage.passageType === "short") return [40, 90];
  if (passage.level === "N5") return [100, 180];
  if (passage.passageType === "short") return [70, 140];
  return [160, 300];
}

export function readingCorpusErrors(content: LearningContentCollections, catalog: ReadingCatalog): string[] {
  const errors: string[] = [];
  const grammarIds = new Set(catalog.grammar.map(({ id }) => id));
  const vocabularyIds = new Set(catalog.vocabulary.map(({ id }) => id));
  const kanjiIds = new Set(catalog.kanji.map(({ id }) => id));
  const unitById = new Map(catalog.curriculumUnits.map((unit) => [unit.id, unit]));
  const questionById = new Map(content.questions.map((question) => [question.id, question]));
  const optionsByQuestion = new Map<string, LearningContentCollections["questionOptions"]>();
  for (const option of content.questionOptions) optionsByQuestion.set(option.questionId, [...(optionsByQuestion.get(option.questionId) ?? []), option]);
  const exact = new Map<string, string[]>();
  for (const passage of content.readingPassages) {
    exact.set(passage.japanese, [...(exact.get(passage.japanese) ?? []), passage.id]);
    const range = expectedRange(passage);
    const length = [...passage.japanese.replaceAll("\n", "")].length;
    if (range && (length < range[0] || length > range[1])) errors.push(`${passage.id} length ${length} is outside ${range[0]}-${range[1]}`);
    if (/\p{Script=Han}/u.test(passage.reading)) errors.push(`${passage.id} reading contains kanji`);
    if (punctuation(passage.japanese) !== punctuation(passage.reading)) errors.push(`${passage.id} reading punctuation is not aligned`);
    if (!passage.english.trim()) errors.push(`${passage.id} has no translation`);
    for (const id of passage.grammarIds) if (!grammarIds.has(id)) errors.push(`${passage.id} references missing grammar ${id}`);
    for (const id of passage.vocabularyIds) if (!vocabularyIds.has(id)) errors.push(`${passage.id} references missing vocabulary ${id}`);
    for (const id of passage.kanjiIds) if (!kanjiIds.has(id)) errors.push(`${passage.id} references missing kanji ${id}`);
    for (const id of passage.curriculumUnitIds) {
      const unit = unitById.get(id);
      if (!unit) errors.push(`${passage.id} references missing curriculum ${id}`);
      if (unit && unit.level !== passage.level) errors.push(`${passage.id} references ${unit.level} curriculum ${id}`);
      if (passage.releaseReady && !unit?.releaseReady) errors.push(`${passage.id} leaks a non-release curriculum parent`);
    }
    if (passage.releaseReady) errors.push(`${passage.id} must remain development-only while curriculum parents are excluded`);
    if (passage.passageType === "practical") {
      const lines = passage.structuredContent?.lines ?? [];
      if (lines.map(({ position }) => position).some((position, index) => position !== index + 1)) errors.push(`${passage.id} practical lines are not contiguous`);
      if (!passage.japanese.includes("土曜日") || !passage.japanese.includes("二時間") || !passage.japanese.includes("二階")) errors.push(`${passage.id} practical date/time/place data is incomplete`);
    }
    for (const questionId of passage.questionIds) {
      const question = questionById.get(questionId);
      const options = optionsByQuestion.get(questionId) ?? [];
      if (!question) continue;
      if (options.length !== 4) errors.push(`${questionId} must have four options`);
      if (question.responseType !== "single-select" || question.correctOptionIds.length !== 1) errors.push(`${questionId} must have exactly one correct answer`);
      if (!question.explanation?.includes("Each other option")) errors.push(`${questionId} explanation must address distractors`);
    }
  }
  for (const [text, ids] of exact) if (ids.length > 1) errors.push(`Exact duplicate passage: ${ids.join(", ")}`);
  return [...new Set(errors)].sort(compareStable);
}

export async function loadReadingQuestionCorpus(
  base: LearningContentCollections,
  catalog: ReadingCatalog,
): Promise<LearningContentCollections> {
  const [n5Raw, n4Raw, questionFile] = await Promise.all([
    readJson<unknown[]>(SOURCE_PATHS.readingPassageCorpusN5),
    readJson<unknown[]>(SOURCE_PATHS.readingPassageCorpusN4),
    readJson<ReadingQuestionFile>(SOURCE_PATHS.readingQuestionCorpus),
  ]);
  const passages = [...n5Raw, ...n4Raw].map((passage) => readingPassageSchema.parse(passage));
  const combined = learningContentCollectionsSchema.parse({
    ...base,
    readingPassages: sortedById([...base.readingPassages, ...passages]),
    questions: sortedById([...base.questions, ...questionFile.questions]),
    questionOptions: [...base.questionOptions, ...questionFile.questionOptions].sort((left, right) =>
      compareStable(left.questionId, right.questionId) || left.position - right.position || compareStable(left.id, right.id)),
    learningItemMetadata: sortedById([...base.learningItemMetadata, ...questionFile.learningItemMetadata]),
    questionTargetRelationships: sortedById([...base.questionTargetRelationships, ...questionFile.questionTargetRelationships]),
  });
  const errors = readingCorpusErrors(combined, catalog);
  if (errors.length > 0) throw new Error(`Reading corpus contains ${errors.length} error(s):\n${errors.slice(0, 30).join("\n")}`);
  return combined;
}
