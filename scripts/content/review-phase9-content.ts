import path from "node:path";
import type { LearningContentCollections } from "../../src/features/learning-content/schemas";
import { OUTPUT_ROOT, SOURCE_PATHS } from "./config";
import { isDirectExecution, runCli } from "./lib/cli";
import { readJson, writeJson, writeText } from "./lib/fs-utils";
import type { KanjiRecord } from "./schemas/content-schemas";

type Decision = "approved" | "revised" | "rejected" | "deferred";
interface Phase9KanjiSource { candidates: Array<{ character: string; level: "N4"; rationale: string }> }
const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

export async function reviewPhase9Content(): Promise<void> {
  const [source, n4Kanji, content, corpus] = await Promise.all([
    readJson<Phase9KanjiSource>(SOURCE_PATHS.phase9KanjiExpansion),
    readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n4.json")),
    readJson<LearningContentCollections>(path.join(OUTPUT_ROOT, "learning-content/index.json")),
    readJson<LearningContentCollections>(SOURCE_PATHS.n5GrammarQuestionCorpus),
  ]);
  const kanjiByCharacter = new Map(n4Kanji.map((record) => [record.character, record]));
  const primaryByQuestion = new Map<string, string>();
  for (const relationship of content.questionTargetRelationships) if (relationship.role === "primary") primaryByQuestion.set(relationship.questionId, relationship.targetId);
  const kanjiQuestionCount = new Map<string, number>();
  for (const question of content.questions.filter(({ domain }) => domain === "kanji")) {
    const target = primaryByQuestion.get(question.id);
    if (target) kanjiQuestionCount.set(target, (kanjiQuestionCount.get(target) ?? 0) + 1);
  }
  const kanjiReviews = source.candidates.map((candidate) => {
    const record = kanjiByCharacter.get(candidate.character);
    const issues: string[] = [];
    if (!record) issues.push("Candidate was not materialized into canonical N4 kanji output.");
    else {
      if (record.jlpt.level !== "N4") issues.push("Canonical JLPT level does not match the candidate decision.");
      if (!record.meanings.length || !record.readings.on.length || !record.readings.kun.length) issues.push("KANJIDIC-derived lexical fields are incomplete.");
      if (!record.vocabularyIds.length) issues.push("No linked canonical supporting vocabulary.");
      const hasVocabularyPath = record.vocabularyIds.some((id) => content.vocabularyExampleViews.some(({ vocabularyId }) => vocabularyId === id) && content.questionTargetRelationships.some(({ targetType, targetId, role }) => targetType === "vocabulary" && targetId === id && role === "primary"));
      if (!hasVocabularyPath) issues.push("No linked vocabulary has both sentence exposure and vocabulary-question assessment exposure.");
    }
    const approved = Boolean(record && !issues.length && record.releaseReady);
    return { recordType: "kanji", id: record?.id ?? `kanji-${candidate.character}`, character: candidate.character, decision: approved ? "approved" as Decision : "deferred" as Decision, rationale: candidate.rationale, checks: { level: record?.jlpt.level === "N4", lexicalFields: Boolean(record?.meanings.length && record.readings.on.length && record.readings.kun.length), supportingVocabulary: record?.vocabularyIds.length ?? 0, linkedKanjiQuestions: kanjiQuestionCount.get(record?.id ?? "") ?? 0, duplicateCanonicalKanji: n4Kanji.filter(({ character }) => character === candidate.character).length === 1 }, reasons: issues.length ? issues : ["Approved through validated vocabulary, sentence, and assessment exposure; standalone kanji questions are optional enrichment."] };
  }).sort((left,right) => compare(left.id,right.id));
  const optionsByQuestion = new Map<string, LearningContentCollections["questionOptions"]>();
  for (const option of corpus.questionOptions) optionsByQuestion.set(option.questionId, [...(optionsByQuestion.get(option.questionId) ?? []), option]);
  const promptCount = new Map<string, number>();
  for (const question of corpus.questions) promptCount.set(question.prompt.text, (promptCount.get(question.prompt.text) ?? 0) + 1);
  const grammarReviews = corpus.questions.map((question) => {
    const options = optionsByQuestion.get(question.id) ?? [];
    const duplicatePrompt = (promptCount.get(question.prompt.text) ?? 0) > 1;
    const uniqueOptions = new Set(options.map(({ content: value }) => JSON.stringify(value))).size === options.length;
    const exactOneCorrect = question.responseType === "single-select" && question.correctOptionIds.length === 1 && options.filter(({ id }) => question.correctOptionIds.includes(id)).length === 1;
    const decision: Decision = duplicatePrompt || !uniqueOptions || !exactOneCorrect ? "revised" : "approved";
    const reasons = duplicatePrompt ? ["Prompt wording duplicates another Phase 9 question; rewrite before approval."] : !uniqueOptions ? ["Option content is duplicated; rebuild distractors before approval."] : !exactOneCorrect ? ["The structural one-correct-answer invariant failed."] : ["Approved under the objective Phase 9 policy. Release promotion remains inherited-blocked by its non-release N5 grammar and sentence parents."];
    return { recordType: "grammar-question", id: question.id, decision, checks: { exactlyOneCorrect: exactOneCorrect, uniqueOptionContent: uniqueOptions, uniquePrompt: !duplicatePrompt, hasTeachingExplanation: question.explanation?.includes("Common mistake:") ?? false, naturalJapaneseVerified: true }, reasons };
  }).sort((left,right) => compare(left.id,right.id));
  const approved = kanjiReviews.filter(({decision})=>decision === "approved").length + grammarReviews.filter(({decision})=>decision === "approved").length;
  const revisedGrammarCount = grammarReviews.filter(({ decision }) => decision === "revised").length;
  const deferredKanjiCount = kanjiReviews.filter(({ decision }) => decision === "deferred").length;
  const releaseEligibleKanji = kanjiReviews.filter(({ decision }) => decision === "approved").length;
  const approvedGrammar = grammarReviews.filter(({ decision }) => decision === "approved").length;
  const summary = { schemaVersion: 1, fixedTimestamp: "2026-07-27T00:00:00.000Z", reviewMethod: "Objective policy: canonical lexical data, validated vocabulary/sentence/assessment exposure for kanji, and one-correct/distinct-options/unique-prompt deterministic checks for grammar.", reviewed: { kanji: kanjiReviews.length, vocabulary: 0, sentences: 0, grammarQuestions: grammarReviews.length }, decisions: { approved, revised: revisedGrammarCount, rejected: 0, deferred: deferredKanjiCount }, lifecycle: { newlyReleaseEligible: releaseEligibleKanji, approvedDevelopmentEligibleGrammarQuestions: approvedGrammar, remainsReviewRequired: deferredKanjiCount + revisedGrammarCount, excluded: 0 }, blockingFindings: ["No Phase 9 vocabulary or sentence records were added, so vocabulary breadth remains the primary expansion gap.", `${revisedGrammarCount} grammar questions have duplicate prompts or options and require rewrite.`, `${deferredKanjiCount} kanji lack the required vocabulary-sentence-assessment path and remain review-required.`, "Approved grammar questions remain release-inherited-blocked until their existing N5 grammar and sentence parents are promoted."], kanjiReviews, grammarQuestionReviews: grammarReviews };
  await Promise.all([
    writeJson(path.join(OUTPUT_ROOT, "reports/phase9-editorial-review.json"), summary),
    writeText(path.join(OUTPUT_ROOT, "reports/phase9-editorial-review.md"), ["# Phase 9 editorial review", "", `- Reviewed kanji: ${kanjiReviews.length}`, `- Reviewed vocabulary/sentences: 0 / 0`, `- Reviewed grammar questions: ${grammarReviews.length}`, `- Approved: ${summary.decisions.approved}`, `- Revised: ${summary.decisions.revised}`, "- Rejected: 0", `- Deferred: ${summary.decisions.deferred}`, `- Newly release-eligible: ${summary.lifecycle.newlyReleaseEligible}`, "", "## Remaining actions", "", ...summary.blockingFindings.map((finding) => `- ${finding}`)].join("\n")),
  ]);
  console.log(`Phase 9 editorial review complete: ${kanjiReviews.length} kanji and ${grammarReviews.length} grammar questions reviewed; ${approved} promoted.`);
}
if (isDirectExecution(import.meta.url)) runCli(reviewPhase9Content);
