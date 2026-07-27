import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { LearningContentCollections } from "../learning-content/schemas";
import { AssessmentEngine } from "./assessment-engine";
import { scorePlatformAssessment } from "./assessment-scoring";
import { assessmentBlueprintSchema, assessmentCollectionsSchema, assessmentSnapshotSchema, type AssessmentBlueprint } from "./platform-schemas";

const json = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;
const content = json<LearningContentCollections>("assets/generated-content/learning-content/index.json");
const collections = assessmentCollectionsSchema.parse({ schemaVersion: 1, blueprints: json("assets/generated-content/assessments/blueprints.json"), presets: json("assets/generated-content/assessments/presets.json"), bundledExams: json("assets/generated-content/assessments/bundled-mock-exams-all.json"), sampleSnapshots: [] });
const engine = new AssessmentEngine({ learningContent: content, contentVersion: collections.bundledExams[0]?.contentVersion ?? "fixture", pipelineVersion: "6.0.0", generationTimestamp: "2026-07-27T00:00:00.000Z" });

describe("Phase 8 deterministic assessment platform", () => {
  it("validates 12 presets and exactly five complete development mocks per level", () => {
    expect(new Set(collections.presets.map(({ assessmentType }) => assessmentType)).size).toBe(12);
    expect(collections.bundledExams.filter(({ level }) => level === "N5")).toHaveLength(5);
    expect(collections.bundledExams.filter(({ level }) => level === "N4")).toHaveLength(5);
    for (const snapshot of collections.bundledExams) {
      expect(assessmentSnapshotSchema.safeParse(snapshot).success).toBe(true);
      expect(engine.validateAssessment(snapshot)).toEqual([]);
      expect(new Set(snapshot.questionPlacements.map(({ questionId }) => questionId)).size).toBe(snapshot.questionPlacements.length);
      expect(new Set(snapshot.questionPlacements.map(({ domain }) => domain)).size).toBe(5);
      expect(snapshot.lifecycleMode).toBe("development"); expect(snapshot.releaseReady).toBe(false);
    }
  });

  it("reproduces a seed, varies another seed, and restores immutable ordering", () => {
    const source = collections.bundledExams[0]; const blueprint = collections.blueprints.find(({ id }) => id === source?.blueprintId);
    expect(source).toBeDefined(); expect(blueprint).toBeDefined();
    const first = engine.generateAssessment({ config: source!.configuration, blueprint: blueprint! });
    const second = engine.generateAssessment({ config: source!.configuration, blueprint: blueprint! });
    expect(first.checksum).toBe(second.checksum); expect(first.questionPlacements).toEqual(second.questionPlacements);
    expect(engine.restoreAssessment(first)).toEqual(first);
    const varied = engine.generateAssessment({ config: { ...source!.configuration, seed: `${source!.seed}-different` }, blueprint: blueprint! });
    expect(varied.questionPlacements.map(({ questionId }) => questionId)).not.toEqual(first.questionPlacements.map(({ questionId }) => questionId));
  });

  it("scores correct and unanswered responses transparently with evidence gating", () => {
    const snapshot = collections.bundledExams[0]!; const questionMap = new Map(content.questions.map((question) => [question.id, question]));
    const answers = snapshot.questionPlacements.map(({ questionId }) => { const question = questionMap.get(questionId); return { questionId, selectedOptionId: question?.responseType === "text-input" ? null : question?.correctOptionIds[0] ?? null, timeUsedSeconds: 10 }; });
    const score = scorePlatformAssessment(snapshot, answers, content);
    expect(score.rawScore).toBe(snapshot.questionPlacements.length); expect(score.percentage).toBe(100); expect(score.readiness.evidenceSufficient).toBe(false); expect(score.readiness.label).toBe("Approaching target");
    const unanswered = scorePlatformAssessment(snapshot, [], content);
    expect(unanswered.rawScore).toBe(0); expect(unanswered.unansweredCount).toBe(snapshot.questionPlacements.length); expect(unanswered.completionStatus).toBe("not-started");
  });

  it("uses deterministic timezone-aware daily identity", () => {
    const blueprint: AssessmentBlueprint = assessmentBlueprintSchema.parse({ schemaVersion: 1, id: "assessment-blueprint-test-daily-n5", assessmentType: "daily-challenge", level: "N5", title: "Daily", intendedUse: "Daily deterministic test", defaultQuestionCount: 5, defaultTimeLimitMinutes: 5, sections: [{ id: "assessment-section-blueprint-test-daily-n5", title: "Daily", order: 1, domains: ["vocabulary"], questionCount: 5, recommendedMinutes: 5, domainQuotas: [{ domain: "vocabulary", minimum: 5, preferred: 5, maximum: 5 }], parentQuotas: [], difficultyDistribution: { easy: .4, medium: .5, hard: .1 } }], targetLimits: { grammar: 2, vocabulary: 2, kanji: 2 }, completionRule: "all-placed-questions-answered-or-time-expired", resultMode: "full", releaseReady: false });
    const input = { level: "N5" as const, lifecycleMode: "development" as const, installationKey: "install-a", date: "2026-07-27", timezone: "Asia/Kolkata", resultMode: "full" as const, remediationMode: false, strictTimeLimit: false };
    const first = engine.generateDailyChallenge(input, blueprint); const second = engine.generateDailyChallenge(input, blueprint); const next = engine.generateDailyChallenge({ ...input, date: "2026-07-28" }, blueprint);
    expect(first.checksum).toBe(second.checksum); expect(first.seed).not.toBe(next.seed);
  });
});
