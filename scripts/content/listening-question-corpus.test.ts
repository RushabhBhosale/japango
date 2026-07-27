import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { learningContentCollectionsSchema } from "../../src/features/learning-content/schemas";
import { listeningCorpusErrors } from "./listening-question-corpus";
import type { CurriculumUnit, GrammarRecord, KanjiRecord, VocabularyRecord } from "./schemas/content-schemas";
import type { CompactContentBundle } from "./write-compact-outputs";

function json<T>(file: string): T { return JSON.parse(readFileSync(file, "utf8")) as T; }
const content = learningContentCollectionsSchema.parse(json<unknown>("assets/generated-content/learning-content/index.json"));
const activities = content.listeningActivities;
const speakers = content.listeningSpeakers;
const questions = content.questions.filter(({ domain }) => domain === "listening");
const questionIds = new Set(questions.map(({ id }) => id));
const options = content.questionOptions.filter(({ questionId }) => questionIds.has(questionId));
const grammar = [...json<GrammarRecord[]>("assets/generated-content/grammar/n5.json"), ...json<GrammarRecord[]>("assets/generated-content/grammar/n4.json")];
const vocabulary = [...json<VocabularyRecord[]>("assets/generated-content/vocabulary/n5.json"), ...json<VocabularyRecord[]>("assets/generated-content/vocabulary/n4.json")];
const kanji = [...json<KanjiRecord[]>("assets/generated-content/kanji/n5.json"), ...json<KanjiRecord[]>("assets/generated-content/kanji/n4.json")];
const units = [...json<CurriculumUnit[]>("assets/generated-content/curriculum/units-n5.json"), ...json<CurriculumUnit[]>("assets/generated-content/curriculum/units-n4.json")];
const developmentBundle = json<CompactContentBundle>("assets/generated-content-compact/development/content.json");
const releaseBundle = json<CompactContentBundle>("assets/generated-content-compact/release/content.json");

function count(level: "N5" | "N4", activityType: string): number { return activities.filter((activity) => activity.level === level && activity.activityType === activityType).length; }
function textLength(activity: typeof activities[number]): number { return [...activity.transcript.replaceAll("\n", "")].length; }

describe("Phase 7 listening script and comprehension corpus", () => {
  it("meets every exact level and format target", () => {
    expect(activities).toHaveLength(156);
    expect([count("N5", "short-monologue"), count("N5", "dialogue"), count("N5", "practical-information"), count("N5", "appropriate-response")]).toEqual([24, 24, 12, 8]);
    expect([count("N4", "short-monologue"), count("N4", "dialogue"), count("N4", "practical-information"), count("N4", "appropriate-response")]).toEqual([28, 32, 16, 12]);
  });

  it("keeps scripts within the level- and format-specific listening bands", () => {
    const range = (level: "N5" | "N4", type: string, minimum: number, maximum: number) => activities.filter((activity) => activity.level === level && activity.activityType === type).every((activity) => textLength(activity) >= minimum && textLength(activity) <= maximum);
    expect(range("N5", "short-monologue", 60, 130)).toBe(true); expect(range("N5", "dialogue", 80, 180)).toBe(true); expect(range("N5", "practical-information", 90, 190)).toBe(true); expect(range("N5", "appropriate-response", 10, 45)).toBe(true);
    expect(range("N4", "short-monologue", 100, 220)).toBe(true); expect(range("N4", "dialogue", 150, 320)).toBe(true); expect(range("N4", "practical-information", 150, 300)).toBe(true); expect(range("N4", "appropriate-response", 20, 70)).toBe(true);
  });

  it("stores audio-ready speakers, ordered turns, normalized speech, and no generated audio", () => {
    const speakerIds = new Set(speakers.map(({ id }) => id));
    expect(speakers).toHaveLength(8);
    expect(activities.every(({ turns }) => turns.every(({ position, speakerId }, index) => position === index + 1 && speakerIds.has(speakerId)))).toBe(true);
    expect(activities.every(({ speechNormalizedTranscript }) => !/\p{Script=Han}|\d|[A-Z]|[😀-🙏]/u.test(speechNormalizedTranscript))).toBe(true);
    expect(activities.every(({ playback }) => playback.locale === "ja-JP" && playback.futureAudioKey.startsWith("audio-future-"))).toBe(true);
    expect(activities.every(({ playback }) => !("audioFile" in playback))).toBe(true);
  });

  it("creates 456 questions with the required per-format density", () => {
    expect(questions).toHaveLength(456); expect(options).toHaveLength(1824);
    expect(activities.filter(({ activityType, questionIds: ids }) => activityType === "appropriate-response" && ids.length === 1)).toHaveLength(20);
    expect(activities.filter(({ activityType, questionIds: ids }) => (activityType === "short-monologue" || activityType === "dialogue") && ids.length === 3)).toHaveLength(108);
    expect(activities.filter(({ activityType, questionIds: ids }) => activityType === "practical-information" && ids.length === 4)).toHaveLength(28);
    const optionsByQuestion = new Map<string, typeof options>(); for (const option of options) optionsByQuestion.set(option.questionId, [...(optionsByQuestion.get(option.questionId) ?? []), option]);
    expect(questions.every((question) => question.responseType === "single-select" && question.correctOptionIds.length === 1 && optionsByQuestion.get(question.id)?.length === 4)).toBe(true);
  });

  it("resolves every speaker, curriculum, grammar, vocabulary, kanji, and question relationship", () => {
    const grammarIds = new Set(grammar.map(({ id }) => id)); const vocabularyIds = new Set(vocabulary.map(({ id }) => id)); const kanjiIds = new Set(kanji.map(({ id }) => id)); const unitIds = new Set(units.map(({ id }) => id));
    expect(activities.every((activity) => activity.grammarIds.every((id) => grammarIds.has(id)) && activity.vocabularyIds.every((id) => vocabularyIds.has(id)) && activity.kanjiIds.every((id) => kanjiIds.has(id)) && activity.curriculumUnitIds.every((id) => unitIds.has(id)))).toBe(true);
    expect(content.questionTargetRelationships.filter(({ targetType }) => targetType === "listening-activity")).toHaveLength(456);
    expect(questions.every(({ stimulusReferences }) => stimulusReferences.length === 1 && stimulusReferences[0]?.type === "listening-activity")).toBe(true);
  });

  it("genuinely reinforces 52 grammar records and reaches 56 combined with reading", () => {
    const listeningGrammar = new Set(activities.flatMap(({ grammarIds }) => grammarIds)); const readingGrammar = new Set(content.readingPassages.flatMap(({ grammarIds }) => grammarIds));
    expect(listeningGrammar.size).toBe(52); expect(new Set([...listeningGrammar, ...readingGrammar]).size).toBe(56);
    const focusSentenceByGrammar = new Map<string, string | undefined>(); for (const view of content.grammarExampleViews) if (view.role === "focus" && !focusSentenceByGrammar.has(view.grammarId)) focusSentenceByGrammar.set(view.grammarId, content.sentences.find(({ id }) => id === view.sentenceId)?.japanese);
    const responseSurface = /ませんか|ましょうか|てください|てもいいですか|たことがありますか|が好きですか|たいですか|ましょう|んですが|たら|なら|ておいて|はず|かもしれない|ながら|てもらえませんか|場合は|予定ですか|と思いますか|ようになりましたか/u;
    expect(activities.every((activity) => activity.grammarIds.every((id) => activity.activityType === "appropriate-response"
      ? responseSurface.test(activity.transcript)
      : activity.turns.some(({ displayText }) => displayText === focusSentenceByGrammar.get(id))))).toBe(true);
  });

  it("keeps practical facts consistent and appropriate responses natural and unambiguous", () => {
    const practical = activities.filter(({ activityType }) => activityType === "practical-information"); const responseIds = new Set(activities.filter(({ activityType }) => activityType === "appropriate-response").flatMap(({ questionIds: ids }) => ids)); const responseOptions = options.filter(({ questionId }) => responseIds.has(questionId));
    expect(practical).toHaveLength(28); expect(practical.every(({ transcript }) => transcript.includes("300円") && transcript.includes("2つ") && transcript.includes("二階"))).toBe(true);
    expect(responseOptions.every(({ content }) => content.type === "text" && content.language === "ja" && !content.text.includes(" — “"))).toBe(true);
    expect(new Set(responseOptions.map(({ content }) => content.type === "text" ? content.text : "")).size).toBe(responseOptions.length);
  });

  it("has no duplicate scripts, prompts, option sets, or IDs", () => {
    const transcripts = activities.map(({ transcript }) => transcript); const normalized = transcripts.map((value) => value.normalize("NFKC").replace(/[。！？、：\s]/gu, ""));
    expect(new Set(transcripts).size).toBe(transcripts.length); expect(new Set(normalized).size).toBe(normalized.length); expect(new Set(questions.map(({ prompt }) => prompt.text)).size).toBe(questions.length);
    const optionSets = activities.flatMap(({ questionIds: ids }) => ids).map((id) => options.filter(({ questionId }) => questionId === id).map(({ content }) => content.type === "text" ? content.text : JSON.stringify(content)).sort().join("\0"));
    expect(new Set(optionSets).size).toBe(optionSets.length); const allIds = [...speakers, ...activities, ...activities.flatMap(({ turns }) => turns), ...questions, ...options].map(({ id }) => id); expect(new Set(allIds).size).toBe(allIds.length);
    expect(listeningCorpusErrors(content, { grammar, vocabulary, kanji, curriculumUnits: units })).toEqual([]);
  });

  it("preserves Phase 1-6 records and keeps the entire Phase 7 corpus development-only", () => {
    expect(content.sentences).toHaveLength(816); expect(content.readingPassages).toHaveLength(146); expect(content.questions.filter(({ domain, id }) => domain !== "listening" && !id.includes("grammar-n5-bridge"))).toHaveLength(9144);
    expect(activities.every(({ releaseReady, reviewStatus, releaseBlockers }) => !releaseReady && reviewStatus === "development-only" && releaseBlockers.includes("curriculum-parent-not-release-ready"))).toBe(true);
    expect(questions.every(({ releaseReady, needsReview }) => !releaseReady && !needsReview)).toBe(true); expect(units.every(({ releaseReady }) => !releaseReady)).toBe(true);
    expect(developmentBundle.learningContent.listeningActivities).toHaveLength(156); expect(developmentBundle.learningContent.listeningSpeakers).toHaveLength(8);
    expect(releaseBundle.learningContent.listeningActivities).toEqual([]); expect(releaseBundle.learningContent.listeningSpeakers).toEqual([]); expect(releaseBundle.learningContent.questions.some(({ domain }) => domain === "listening")).toBe(false);
  });
});
