import type {
  GrammarExampleView,
  LearningContentCollections,
  LearningItemMetadata,
  Question,
  QuestionOption,
  QuestionTargetRelationship,
  Sentence,
} from "../../src/features/learning-content/schemas";
import { OUTPUT_ROOT, SOURCE_PATHS } from "./config";
import { isDirectExecution, runCli } from "./lib/cli";
import { readJson, writeJson } from "./lib/fs-utils";
import type { ReviewedN4GrammarRecord } from "./schemas/content-schemas";

interface CanonicalGrammarQuestionCorpus {
  schemaVersion: 1;
  fixedTimestamp: "2026-07-26T00:00:00.000Z";
  questions: Question[];
  questionOptions: QuestionOption[];
  learningItemMetadata: LearningItemMetadata[];
  questionTargetRelationships: QuestionTargetRelationship[];
}

type LearningCategory = "recognition" | "meaning" | "usage" | "context-application";

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function displayPattern(record: ReviewedN4GrammarRecord): string {
  return record.pattern.replaceAll("～", "").trim();
}

function primaryMeaning(record: ReviewedN4GrammarRecord): string {
  return record.meanings[0] ?? record.title;
}

function codePointSlice(sentence: Sentence, view: GrammarExampleView): string {
  const range = view.focusRanges[0];
  return range
    ? [...sentence.japanese].slice(range.startCodePoint, range.endCodePoint).join("")
    : "";
}

function blankedSentence(sentence: Sentence, view: GrammarExampleView): string {
  const range = view.focusRanges[0];
  if (!range) return sentence.japanese;
  const codePoints = [...sentence.japanese];
  return [
    ...codePoints.slice(0, range.startCodePoint),
    "＿＿",
    ...codePoints.slice(range.endCodePoint),
  ].join("");
}

function chooseDistractors(
  target: ReviewedN4GrammarRecord,
  grammar: readonly ReviewedN4GrammarRecord[],
  value: (record: ReviewedN4GrammarRecord) => string,
): ReviewedN4GrammarRecord[] {
  const preferredIds = new Set([
    ...target.confusedWithGrammarIds,
    ...target.relatedGrammarIds,
  ]);
  const targetValue = value(target);
  const candidates = grammar
    .filter((record) => record.releaseReady && record.id !== target.id)
    .sort((left, right) => {
      const preferred = Number(preferredIds.has(right.id)) - Number(preferredIds.has(left.id));
      if (preferred !== 0) return preferred;
      const sameFamily = Number(right.familyId === target.familyId) - Number(left.familyId === target.familyId);
      if (sameFamily !== 0) return sameFamily;
      const sameCategory = Number(right.category === target.category) - Number(left.category === target.category);
      return sameCategory || left.curriculumOrder - right.curriculumOrder || compareStable(left.id, right.id);
    });
  const chosen: ReviewedN4GrammarRecord[] = [];
  const values = new Set([targetValue]);
  for (const candidate of candidates) {
    const candidateValue = value(candidate);
    if (!candidateValue || values.has(candidateValue)) continue;
    chosen.push(candidate);
    values.add(candidateValue);
    if (chosen.length === 3) break;
  }
  if (chosen.length !== 3) throw new Error(`Unable to select three distinct distractors for ${target.id}`);
  return chosen;
}

function rotate<T>(values: readonly T[], offset: number): T[] {
  const normalized = offset % values.length;
  return [...values.slice(normalized), ...values.slice(0, normalized)];
}

function questionId(grammarId: string, category: LearningCategory, ordinal: number): string {
  return `question-${grammarId}-${category}-${ordinal}`;
}

function optionId(id: string, position: number): string {
  return `question-option-${id.replace(/^question-/u, "")}-${position}`;
}

function targetId(id: string, suffix: string): string {
  return `question-target-${id.replace(/^question-/u, "")}-${suffix}`;
}

function categorySkill(category: LearningCategory): "form" | "meaning" | "usage" | "comprehension" {
  if (category === "recognition") return "form";
  if (category === "meaning") return "meaning";
  if (category === "usage") return "usage";
  return "comprehension";
}

function buildQuestion(
  target: ReviewedN4GrammarRecord,
  grammar: readonly ReviewedN4GrammarRecord[],
  sentence: Sentence,
  view: GrammarExampleView,
  category: LearningCategory,
  ordinal: number,
  sentenceByGrammar: ReadonlyMap<string, Sentence[]>,
): {
  question: Question;
  options: QuestionOption[];
  metadata: LearningItemMetadata;
  relationships: QuestionTargetRelationship[];
} {
  const id = questionId(target.id, category, ordinal);
  const pattern = displayPattern(target);
  const meaning = primaryMeaning(target);
  const isContext = category === "context-application";
  const value = category === "meaning" ? primaryMeaning : displayPattern;
  const distractors = chooseDistractors(target, grammar, value);
  const optionRecords = rotate([target, ...distractors], target.curriculumOrder + ordinal);
  const promptText =
    category === "recognition"
      ? `Read 「${sentence.japanese}」. Which grammar pattern is highlighted in the referenced sentence?`
      : category === "meaning"
        ? `In 「${sentence.japanese}」, what meaning does the highlighted grammar express?`
        : category === "usage"
          ? `Choose the grammar expression that completes 「${blankedSentence(sentence, view)}」 naturally.`
          : ordinal === 1
            ? `Which sentence demonstrates “${target.title}” by expressing “${meaning}”?`
            : `Which example correctly applies ${target.title} (${pattern}) in an everyday context?`;
  const correctOptionPosition = optionRecords.findIndex(({ id: recordId }) => recordId === target.id) + 1;
  const options = optionRecords.map((record, index): QuestionOption => {
    const position = index + 1;
    const isCorrect = record.id === target.id;
    const content = isContext
      ? {
          type: "sentence-reference" as const,
          sentenceId:
            record.id === target.id
              ? sentence.id
              : (sentenceByGrammar.get(record.id)?.[ordinal - 1] ?? sentenceByGrammar.get(record.id)?.[0])!.id,
        }
      : {
          type: "text" as const,
          text:
            category === "meaning"
              ? primaryMeaning(record)
              : category === "usage" && isCorrect
                ? codePointSlice(sentence, view)
                : displayPattern(record),
          language: category === "meaning" ? ("en" as const) : ("ja" as const),
        };
    return {
      schemaVersion: 1,
      id: optionId(id, position),
      questionId: id,
      position,
      content,
      feedback: isCorrect
        ? `${pattern} is correct here: it ${meaning}.`
        : `${displayPattern(record)} expresses “${primaryMeaning(record)},” so it does not match this sentence's target nuance.`,
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    };
  });
  const distractorExplanation = distractors
    .map((record) => `${displayPattern(record)} means “${primaryMeaning(record)}”`)
    .join("; ");
  const formation = target.formation[0]?.structure ?? target.title;
  const question: Question = {
    schemaVersion: 1,
    id,
    domain: "grammar",
    presentation: category === "usage" ? "fill-blank" : "multiple-choice",
    responseType: "single-select",
    prompt: { text: promptText, language: "en" },
    stimulusReferences: [{ type: "sentence", id: sentence.id }],
    correctOptionIds: [optionId(id, correctOptionPosition)],
    explanation: `${pattern} is correct because it ${meaning}. Formation: ${formation}. The other choices differ: ${distractorExplanation}. Common mistake: choosing by surface similarity instead of the sentence's function.`,
    difficulty: { jlptLevel: target.level, rank: sentence.difficulty.rank },
    examMetadata: null,
    usageContexts: ["lesson", "review"],
    tags: [category, "grammar-learning", target.level.toLowerCase()].sort(compareStable),
    sourceIds: ["japango-grammar-question-corpus"],
    attribution: ["Original JapanGo grammar learning question and explanation."],
    confidence: 0.99,
    needsReview: false,
    releaseReady: true,
  };
  const skill = categorySkill(category);
  const relationships: QuestionTargetRelationship[] = [
    {
      schemaVersion: 1,
      id: targetId(id, "grammar-primary"),
      questionId: id,
      targetType: "grammar",
      targetId: target.id,
      role: "primary",
      skill,
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    },
    {
      schemaVersion: 1,
      id: targetId(id, "sentence-supporting"),
      questionId: id,
      targetType: "sentence",
      targetId: sentence.id,
      role: "supporting",
      skill,
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    },
    ...distractors.map((record, index): QuestionTargetRelationship => ({
      schemaVersion: 1,
      id: targetId(id, `grammar-distractor-${index + 1}`),
      questionId: id,
      targetType: "grammar",
      targetId: record.id,
      role: "distractor-source",
      skill,
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    })),
  ];
  const metadata: LearningItemMetadata = {
    schemaVersion: 1,
    id: `learning-item-${id.replace(/^question-/u, "")}`,
    itemType: "question",
    itemId: id,
    reviewable: true,
    skills:
      category === "recognition"
        ? ["form-recognition"]
        : category === "meaning"
          ? ["meaning-recognition"]
          : category === "usage"
            ? ["production"]
            : ["contextual-usage"],
    availableModes: ["quiz"],
    estimatedReviewSeconds: category === "context-application" ? 30 : 24,
    tags: [category, "grammar-learning", target.level.toLowerCase()].sort(compareStable),
    confidence: 0.99,
    needsReview: false,
    releaseReady: true,
  };
  return { question, options, metadata, relationships };
}

export async function authorGrammarQuestions(): Promise<void> {
  const [content, n5Grammar, n4Grammar] = await Promise.all([
    readJson<LearningContentCollections>(`${OUTPUT_ROOT}/learning-content/index.json`),
    readJson<unknown[]>(`${OUTPUT_ROOT}/grammar/n5.json`),
    readJson<ReviewedN4GrammarRecord[]>(`${OUTPUT_ROOT}/grammar/n4.json`),
  ]);
  void n5Grammar;
  const grammar = n4Grammar;
  const releaseTargets = grammar.filter(({ releaseReady }) => releaseReady);
  const sentenceById = new Map(content.sentences.map((sentence) => [sentence.id, sentence]));
  const viewByGrammar = new Map<string, GrammarExampleView[]>();
  for (const view of content.grammarExampleViews) {
    if (view.role !== "focus" || !view.releaseReady) continue;
    viewByGrammar.set(view.grammarId, [...(viewByGrammar.get(view.grammarId) ?? []), view]);
  }
  const sentenceByGrammar = new Map<string, Sentence[]>();
  for (const target of releaseTargets) {
    const sentences = (viewByGrammar.get(target.id) ?? [])
      .map(({ sentenceId }) => sentenceById.get(sentenceId))
      .filter((sentence): sentence is Sentence => Boolean(sentence?.releaseReady))
      .sort((left, right) => compareStable(left.id, right.id));
    if (sentences.length < 4) throw new Error(`${target.id} has fewer than four approved release sentences`);
    sentenceByGrammar.set(target.id, sentences);
  }
  const corpus: CanonicalGrammarQuestionCorpus = {
    schemaVersion: 1,
    fixedTimestamp: "2026-07-26T00:00:00.000Z",
    questions: [],
    questionOptions: [],
    learningItemMetadata: [],
    questionTargetRelationships: [],
  };
  const categories: readonly LearningCategory[] = [
    "recognition",
    "meaning",
    "usage",
    "context-application",
  ];
  for (const target of releaseTargets.sort((left, right) => compareStable(left.id, right.id))) {
    const views = (viewByGrammar.get(target.id) ?? []).sort((left, right) => compareStable(left.sentenceId, right.sentenceId));
    for (const [categoryIndex, category] of categories.entries()) {
      for (const ordinal of [1, 2] as const) {
        const view = views[(categoryIndex * 2 + ordinal - 1) % views.length]!;
        const sentence = sentenceById.get(view.sentenceId)!;
        const result = buildQuestion(target, grammar, sentence, view, category, ordinal, sentenceByGrammar);
        corpus.questions.push(result.question);
        corpus.questionOptions.push(...result.options);
        corpus.learningItemMetadata.push(result.metadata);
        corpus.questionTargetRelationships.push(...result.relationships);
      }
    }
  }
  corpus.questions.sort((left, right) => compareStable(left.id, right.id));
  corpus.questionOptions.sort(
    (left, right) =>
      compareStable(left.questionId, right.questionId) ||
      left.position - right.position ||
      compareStable(left.id, right.id),
  );
  corpus.learningItemMetadata.sort((left, right) => compareStable(left.id, right.id));
  corpus.questionTargetRelationships.sort((left, right) => compareStable(left.id, right.id));
  await writeJson(SOURCE_PATHS.grammarQuestionCorpus, corpus);
  console.log(`Authored ${corpus.questions.length} grammar questions with ${corpus.questionOptions.length} options.`);
}

if (isDirectExecution(import.meta.url)) runCli(authorGrammarQuestions);
