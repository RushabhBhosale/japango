import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  learningContentCollectionsSchema,
  type LearningContentCollections,
} from "../../src/features/learning-content/schemas";
import type { CurriculumUnit, GrammarRecord, KanjiRecord, VocabularyRecord } from "./schemas/content-schemas";

function json<T>(file: string): T { return JSON.parse(readFileSync(file, "utf8")) as T; }
const content = learningContentCollectionsSchema.parse(json<unknown>("assets/generated-content/learning-content/index.json"));
const passages = content.readingPassages;
const questions = content.questions.filter(({ domain }) => domain === "reading");
const questionIds = new Set(questions.map(({ id }) => id));
const options = content.questionOptions.filter(({ questionId }) => questionIds.has(questionId));
const grammar = [...json<GrammarRecord[]>("assets/generated-content/grammar/n5.json"), ...json<GrammarRecord[]>("assets/generated-content/grammar/n4.json")];
const vocabulary = [...json<VocabularyRecord[]>("assets/generated-content/vocabulary/n5.json"), ...json<VocabularyRecord[]>("assets/generated-content/vocabulary/n4.json")];
const kanji = [...json<KanjiRecord[]>("assets/generated-content/kanji/n5.json"), ...json<KanjiRecord[]>("assets/generated-content/kanji/n4.json")];
const units = [...json<CurriculumUnit[]>("assets/generated-content/curriculum/units-n5.json"), ...json<CurriculumUnit[]>("assets/generated-content/curriculum/units-n4.json")];

function length(passage: LearningContentCollections["readingPassages"][number]): number { return [...passage.japanese.replaceAll("\n", "")].length; }

describe("Phase 6 reading passage and comprehension corpus", () => {
  it("meets exact level and passage-type targets", () => {
    expect(passages).toHaveLength(146);
    const count = (level: "N5" | "N4", passageType: "short" | "medium" | "practical") => passages.filter((passage) => passage.level === level && passage.passageType === passageType).length;
    expect([count("N5", "short"), count("N5", "medium"), count("N5", "practical")]).toEqual([36, 18, 12]);
    expect([count("N4", "short"), count("N4", "medium"), count("N4", "practical")]).toEqual([40, 24, 16]);
  });

  it("keeps narrative passage lengths inside the requested bands", () => {
    expect(passages.filter((p) => p.level === "N5" && p.passageType === "short").every((p) => length(p) >= 40 && length(p) <= 90)).toBe(true);
    expect(passages.filter((p) => p.level === "N5" && p.passageType === "medium").every((p) => length(p) >= 100 && length(p) <= 180)).toBe(true);
    expect(passages.filter((p) => p.level === "N4" && p.passageType === "short").every((p) => length(p) >= 70 && length(p) <= 140)).toBe(true);
    expect(passages.filter((p) => p.level === "N4" && p.passageType === "medium").every((p) => length(p) >= 160 && length(p) <= 300)).toBe(true);
  });

  it("has aligned kana readings, translations, topics, and exact difficulty ratios", () => {
    expect(passages.every(({ reading, english }) => !/\p{Script=Han}/u.test(reading) && english.trim().length > 0)).toBe(true);
    expect(new Set(passages.flatMap(({ topicTags }) => topicTags)).size).toBe(34);
    const difficulty = (level: "N5" | "N4", rank: number) => passages.filter((passage) => passage.level === level && passage.difficulty.rank === rank).length;
    expect([difficulty("N5", 1), difficulty("N5", 3), difficulty("N5", 4)]).toEqual([30, 30, 6]);
    expect([difficulty("N4", 2), difficulty("N4", 3), difficulty("N4", 4)]).toEqual([20, 44, 16]);
  });

  it("resolves grammar, vocabulary, kanji, and curriculum relationships", () => {
    const grammarIds = new Set(grammar.map(({ id }) => id)); const vocabularyIds = new Set(vocabulary.map(({ id }) => id));
    const kanjiIds = new Set(kanji.map(({ id }) => id)); const unitIds = new Set(units.map(({ id }) => id));
    expect(passages.every((passage) => passage.grammarIds.length <= 3 && passage.grammarIds.every((id) => grammarIds.has(id)))).toBe(true);
    expect(passages.every((passage) => passage.vocabularyIds.every((id) => vocabularyIds.has(id)))).toBe(true);
    expect(passages.every((passage) => passage.kanjiIds.every((id) => kanjiIds.has(id)))).toBe(true);
    expect(passages.every((passage) => passage.curriculumUnitIds.every((id) => unitIds.has(id)))).toBe(true);
  });

  it("creates 508 questions, four options each, and exactly one correct answer", () => {
    expect(questions).toHaveLength(508); expect(options).toHaveLength(2032);
    const optionsByQuestion = new Map<string, typeof options>();
    for (const option of options) optionsByQuestion.set(option.questionId, [...(optionsByQuestion.get(option.questionId) ?? []), option]);
    expect(questions.every((question) => question.responseType === "single-select" && question.correctOptionIds.length === 1 && optionsByQuestion.get(question.id)?.length === 4)).toBe(true);
    expect(passages.filter(({ questionIds }) => questionIds.length === 3)).toHaveLength(76);
    expect(passages.filter(({ questionIds }) => questionIds.length === 4)).toHaveLength(70);
  });

  it("links every question bidirectionally to one passage with supporting explanations", () => {
    const passageIds = new Set(passages.map(({ id }) => id));
    expect(questions.every((question) => question.stimulusReferences.length === 1 && question.stimulusReferences[0]?.type === "reading-passage" && passageIds.has(question.stimulusReferences[0].id))).toBe(true);
    expect(questions.every(({ explanation }) => explanation?.includes("Each other option") && explanation.includes("Strategy:"))).toBe(true);
    expect(content.questionTargetRelationships.filter(({ targetType }) => targetType === "reading-passage")).toHaveLength(508);
  });

  it("keeps practical data explicit, ordered, fictional, and internally consistent", () => {
    const practical = passages.filter(({ passageType }) => passageType === "practical");
    expect(practical).toHaveLength(28);
    expect(practical.every((passage) => passage.structuredContent?.lines.every(({ position }, index) => position === index + 1))).toBe(true);
    expect(practical.every(({ japanese }) => japanese.includes("土曜日") && japanese.includes("二時間") && japanese.includes("二階") && japanese.includes("受付A"))).toBe(true);
    expect(practical.every(({ japanese }) => !/\d{3}[- ]?\d{3,}/u.test(japanese))).toBe(true);
  });

  it("has no exact, punctuation-only, prompt, or ID duplicates", () => {
    const exact = passages.map(({ japanese }) => japanese);
    const normalized = exact.map((value) => value.normalize("NFKC").replace(/[。！？、：\s]/gu, ""));
    expect(new Set(exact).size).toBe(exact.length); expect(new Set(normalized).size).toBe(normalized.length);
    expect(new Set(questions.map(({ prompt }) => prompt.text)).size).toBe(questions.length);
    const allIds = [...passages, ...questions, ...options].map(({ id }) => id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("promotes the initial Phase 3 release while retaining the remaining corpus for development", () => {
    expect(content.sentences).toHaveLength(1368);
    expect(content.questions.filter(({ domain, id, releaseReady }) => domain !== "reading" && domain !== "listening" && releaseReady && !id.includes("grammar-n5-bridge"))).toHaveLength(12164);
    const released = passages.filter(({ releaseReady }) => releaseReady);
    expect(released).toHaveLength(30);
    expect(released.filter(({ level }) => level === "N5")).toHaveLength(12);
    expect(released.filter(({ level }) => level === "N4")).toHaveLength(18);
    expect(released.every(({ reviewStatus, releaseBlockers }) => reviewStatus === "approved" && releaseBlockers.length === 0)).toBe(true);
    expect(questions.filter(({ releaseReady }) => releaseReady)).toHaveLength(120);
    expect(passages.filter(({ releaseReady }) => !releaseReady).every(({ reviewStatus, releaseBlockers }) => reviewStatus === "development-only" && releaseBlockers.includes("curriculum-parent-not-release-ready"))).toBe(true);
    expect(units.every(({ releaseReady }) => !releaseReady)).toBe(true);
  });
});
