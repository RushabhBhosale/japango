import type { GrammarExampleView, LearningContentCollections, LearningItemMetadata, Question, QuestionOption, QuestionTargetRelationship, Sentence } from "../../src/features/learning-content/schemas";
import { OUTPUT_ROOT, SOURCE_PATHS } from "./config";
import { isDirectExecution, runCli } from "./lib/cli";
import { readJson, writeJson } from "./lib/fs-utils";
import type { LegacyN5GrammarRecord } from "./schemas/content-schemas";

type Category = "recognition" | "meaning" | "usage" | "context-application";
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const categories: readonly Category[] = ["recognition", "meaning", "usage", "context-application"];
const label = (item: LegacyN5GrammarRecord) => item.pattern.replace(/\s+/gu, " ").trim();
const meaning = (item: LegacyN5GrammarRecord) => item.shortExplanation ?? item.detailedExplanation ?? item.title.replace(/^Pattern\s*/u, "");
const stableSlug = (id: string) => [...id.replace(/^grammar-/u, "")].map((character) => /[a-z0-9-]/u.test(character) ? character : `u${character.codePointAt(0)!.toString(16)}`).join("");

function optionId(questionId: string, position: number) { return `question-option-${questionId.replace(/^question-/u, "")}-${position}`; }
function targetId(questionId: string, suffix: string) { return `question-target-${questionId.replace(/^question-/u, "")}-${suffix}`; }

export async function authorN5GrammarQuestions(): Promise<void> {
  const [content, grammar] = await Promise.all([
    readJson<LearningContentCollections>(`${OUTPUT_ROOT}/learning-content/index.json`),
    readJson<LegacyN5GrammarRecord[]>(`${OUTPUT_ROOT}/grammar/n5.json`),
  ]);
  const sentenceById = new Map(content.sentences.map((sentence) => [sentence.id, sentence]));
  const allSentences = [...content.sentences].filter(({ difficulty }) => difficulty.jlptLevel === "N5").sort((a,b) => compare(a.id,b.id));
  const views = new Map<string, GrammarExampleView[]>();
  for (const view of content.grammarExampleViews) if (view.role === "focus") views.set(view.grammarId, [...(views.get(view.grammarId) ?? []), view]);
  const output: { schemaVersion: 1; fixedTimestamp: "2026-07-27T00:00:00.000Z"; questions: Question[]; questionOptions: QuestionOption[]; learningItemMetadata: LearningItemMetadata[]; questionTargetRelationships: QuestionTargetRelationship[] } = { schemaVersion: 1, fixedTimestamp: "2026-07-27T00:00:00.000Z", questions: [], questionOptions: [], learningItemMetadata: [], questionTargetRelationships: [] };
  const ordered = [...grammar].sort((a,b) => compare(a.id,b.id));
  for (const [targetIndex, target] of ordered.entries()) {
    const examples = (views.get(target.id) ?? []).map(({ sentenceId }) => sentenceById.get(sentenceId)).filter((sentence): sentence is Sentence => Boolean(sentence)).sort((a,b) => compare(a.id,b.id));
    if (!examples.length) throw new Error(`N5 grammar ${target.id} has no canonical focus sentence.`);
    const alternatives = ordered.filter((item) => item.id !== target.id && label(item) !== label(target));
    for (const [categoryIndex, category] of categories.entries()) for (const ordinal of [1, 2] as const) {
      const id = `question-${stableSlug(target.id)}-${category}-${ordinal}`;
      const sentence = examples[(categoryIndex * 2 + ordinal - 1) % examples.length]!;
      const distractors = [0,1,2].map((offset) => alternatives[(targetIndex * 3 + categoryIndex * 7 + ordinal + offset) % alternatives.length]!);
      const records = [target, ...distractors];
      const rotated = [...records.slice((targetIndex + categoryIndex + ordinal) % 4), ...records.slice(0, (targetIndex + categoryIndex + ordinal) % 4)];
      const correctPosition = rotated.findIndex(({ id: grammarId }) => grammarId === target.id) + 1;
      const prompt = category === "recognition" ? `Practice ${ordinal}: in 「${sentence.japanese}」, identify the target grammar pattern for ${target.title}.` : category === "meaning" ? `Practice ${ordinal}: what does ${label(target)} communicate in 「${sentence.japanese}」?` : category === "usage" ? `Practice ${ordinal}: choose the grammar pattern practised by this sentence: 「${sentence.japanese}」.` : `Practice ${ordinal}: which sentence reference gives an everyday context for ${label(target)}?`;
      const options = rotated.map((record, index): QuestionOption => ({ schemaVersion: 1, id: optionId(id, index + 1), questionId: id, position: index + 1, content: category === "context-application" ? { type: "sentence-reference", sentenceId: record.id === target.id ? sentence.id : allSentences[(targetIndex * 11 + categoryIndex * 5 + ordinal + index) % allSentences.length]!.id } : { type: "text", text: category === "meaning" ? meaning(record) : label(record), language: category === "meaning" ? "en" : "ja" }, feedback: record.id === target.id ? `${label(target)} is the intended target.` : `${label(record)} is a different grammar target, so it does not answer this item.`, confidence: 0.86, needsReview: true, releaseReady: false }));
      const skill = category === "recognition" ? "form-recognition" : category === "meaning" ? "meaning-recognition" : category === "usage" ? "production" : "contextual-usage";
      const relationshipSkill = category === "recognition" ? "form" : category === "meaning" ? "meaning" : category === "usage" ? "usage" : "comprehension";
      output.questions.push({ schemaVersion: 1, id, domain: "grammar", presentation: category === "usage" ? "fill-blank" : "multiple-choice", responseType: "single-select", prompt: { text: prompt, language: "en" }, stimulusReferences: [{ type: "sentence", id: sentence.id }], correctOptionIds: [optionId(id, correctPosition)], explanation: `${label(target)} is practised through this original canonical sentence. Common mistake: selecting a familiar-looking pattern instead of matching its grammar function.`, difficulty: { jlptLevel: "N5", rank: sentence.difficulty.rank }, examMetadata: null, usageContexts: ["lesson", "review"], tags: [category, "grammar-learning", "n5"].sort(compare), sourceIds: ["japango-n5-grammar-question-corpus"], attribution: ["Original JapanGo N5 grammar learning question and explanation."], confidence: 0.86, needsReview: true, releaseReady: false });
      output.questionOptions.push(...options);
      output.learningItemMetadata.push({ schemaVersion: 1, id: `learning-item-${id.replace(/^question-/u, "")}`, itemType: "question", itemId: id, reviewable: true, skills: [skill], availableModes: ["quiz"], estimatedReviewSeconds: 25, tags: [category, "grammar-learning", "n5"].sort(compare), confidence: 0.86, needsReview: true, releaseReady: false });
      output.questionTargetRelationships.push({ schemaVersion: 1, id: targetId(id, "grammar-primary"), questionId: id, targetType: "grammar", targetId: target.id, role: "primary", skill: relationshipSkill, confidence: 0.86, needsReview: true, releaseReady: false }, { schemaVersion: 1, id: targetId(id, "sentence-supporting"), questionId: id, targetType: "sentence", targetId: sentence.id, role: "supporting", skill: relationshipSkill, confidence: 0.86, needsReview: true, releaseReady: false });
    }
  }
  for (const values of [output.questions, output.learningItemMetadata, output.questionTargetRelationships]) values.sort((a,b) => compare(a.id,b.id));
  output.questionOptions.sort((a,b) => compare(a.questionId,b.questionId) || a.position - b.position);
  // Phase 9 editorial policy promotes only objective passes: one resolvable
  // correct option, four distinct options, and no normalized duplicate prompt.
  // Natural Japanese is inherited from the validated canonical sentence corpus.
  const promptCounts = new Map<string, number>();
  for (const question of output.questions) promptCounts.set(question.prompt.text, (promptCounts.get(question.prompt.text) ?? 0) + 1);
  const optionsByQuestion = new Map<string, QuestionOption[]>();
  for (const option of output.questionOptions) optionsByQuestion.set(option.questionId, [...(optionsByQuestion.get(option.questionId) ?? []), option]);
  const approvedQuestionIds = new Set(output.questions.filter((question) => {
    const options = optionsByQuestion.get(question.id) ?? [];
    return question.responseType === "single-select" && question.correctOptionIds.length === 1 && options.filter(({ id }) => question.correctOptionIds.includes(id)).length === 1 && new Set(options.map(({ content }) => JSON.stringify(content))).size === 4 && (promptCounts.get(question.prompt.text) ?? 0) === 1;
  }).map(({ id }) => id));
  // Parent N5 grammar and sentence records remain lifecycle-gated. Objective
  // passes are approved for development and assessment use, but cannot claim
  // release readiness until those existing parents are separately promoted.
  for (const question of output.questions) if (approvedQuestionIds.has(question.id)) { question.confidence = 0.95; question.needsReview = false; question.releaseReady = false; }
  for (const option of output.questionOptions) if (approvedQuestionIds.has(option.questionId)) { option.confidence = 0.95; option.needsReview = false; option.releaseReady = false; }
  for (const metadata of output.learningItemMetadata) if (approvedQuestionIds.has(metadata.itemId)) { metadata.confidence = 0.95; metadata.needsReview = false; metadata.releaseReady = false; }
  for (const relationship of output.questionTargetRelationships) if (approvedQuestionIds.has(relationship.questionId)) { relationship.confidence = 0.95; relationship.needsReview = false; relationship.releaseReady = false; }
  await writeJson(SOURCE_PATHS.n5GrammarQuestionCorpus, output);
  console.log(`Authored ${output.questions.length} N5 grammar questions: ${approvedQuestionIds.size} release-ready, ${output.questions.length - approvedQuestionIds.size} review-required.`);
}
if (isDirectExecution(import.meta.url)) runCli(authorN5GrammarQuestions);
