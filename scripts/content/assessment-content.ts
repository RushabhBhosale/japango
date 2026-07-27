import { learningContentCollectionsSchema, type LearningContentCollections } from "../../src/features/learning-content/schemas";
import { AssessmentEngine } from "../../src/features/assessment/assessment-engine";
import {
  assessmentBlueprintSchema,
  assessmentCollectionsSchema,
  assessmentExposureInputSchema,
  assessmentPresetSchema,
  type AssessmentBlueprint,
  type AssessmentCollections,
  type AssessmentExposureInput,
  type AssessmentSnapshot,
} from "../../src/features/assessment/platform-schemas";
import { CONTENT_SCHEMA_VERSION, PIPELINE_VERSION, SOURCE_PATHS } from "./config";
import { readJson } from "./lib/fs-utils";

interface BridgeFile {
  questions: LearningContentCollections["questions"];
  questionOptions: LearningContentCollections["questionOptions"];
  questionTargetRelationships: LearningContentCollections["questionTargetRelationships"];
  learningItemMetadata: LearningContentCollections["learningItemMetadata"];
}
interface SeedFile { schemaVersion: 1; N5: Array<{ id: string; seed: string }>; N4: Array<{ id: string; seed: string }>; }

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const quota = (domain: "vocabulary" | "kanji" | "grammar", count: number) => ({ domain, minimum: count, preferred: count, maximum: count });

function simpleBlueprint(type: AssessmentBlueprint["assessmentType"], level: "N5" | "N4", domains: Array<"vocabulary" | "kanji" | "grammar">, counts: number[], minutes: number): AssessmentBlueprint {
  const questionCount = counts.reduce((sum, value) => sum + value, 0);
  return assessmentBlueprintSchema.parse({ schemaVersion: 1, id: `assessment-blueprint-sample-${type}-${level.toLowerCase()}`, assessmentType: type, level, title: `${level} ${type} sample`, intendedUse: "A deterministic development sample for engine and app integration.", defaultQuestionCount: questionCount, defaultTimeLimitMinutes: minutes, sections: [{ id: `assessment-section-blueprint-sample-${type}-${level.toLowerCase()}`, title: "Practice", order: 1, domains, questionCount, recommendedMinutes: minutes, domainQuotas: domains.map((domain, index) => quota(domain, counts[index] ?? 0)), parentQuotas: [], difficultyDistribution: { easy: .4, medium: .5, hard: .1 } }], targetLimits: { grammar: 2, vocabulary: 2, kanji: 2 }, completionRule: "all-placed-questions-answered-or-time-expired", resultMode: "full", releaseReady: false });
}

function incrementExposure(exposure: AssessmentExposureInput, snapshot: AssessmentSnapshot): void {
  for (const placement of snapshot.questionPlacements) {
    const current = exposure.questionExposure[placement.questionId];
    exposure.questionExposure[placement.questionId] = { count: (current?.count ?? 0) + 1, lastSeenAt: snapshot.generationTimestamp, correctCount: 0, incorrectCount: 0, confidence: 0, masteryStatus: "new" };
  }
  for (const placement of snapshot.parentPlacements) {
    const current = exposure.parentExposure[placement.parentId];
    exposure.parentExposure[placement.parentId] = { count: (current?.count ?? 0) + 1, lastSeenAt: snapshot.generationTimestamp };
  }
}

export async function loadAssessmentContent(base: LearningContentCollections, contentVersion: string, unresolvedTargetIds: readonly string[]): Promise<{ learningContent: LearningContentCollections; assessments: AssessmentCollections }> {
  const [bridge, blueprintRaw, presetRaw, seeds] = await Promise.all([
    readJson<BridgeFile>(SOURCE_PATHS.assessmentN5GrammarBridge), readJson<unknown[]>(SOURCE_PATHS.assessmentBlueprints), readJson<unknown[]>(SOURCE_PATHS.assessmentPresets), readJson<SeedFile>(SOURCE_PATHS.assessmentBundledSeeds),
  ]);
  const learningContent = learningContentCollectionsSchema.parse({ ...base, questions: [...base.questions, ...bridge.questions].sort((a,b)=>compare(a.id,b.id)), questionOptions: [...base.questionOptions, ...bridge.questionOptions].sort((a,b)=>compare(a.questionId,b.questionId)||a.position-b.position), questionTargetRelationships: [...base.questionTargetRelationships, ...bridge.questionTargetRelationships].sort((a,b)=>compare(a.id,b.id)), learningItemMetadata: [...base.learningItemMetadata, ...bridge.learningItemMetadata].sort((a,b)=>compare(a.id,b.id)) });
  const blueprints = blueprintRaw.map((value) => assessmentBlueprintSchema.parse(value));
  const presets = presetRaw.map((value) => assessmentPresetSchema.parse(value));
  const engine = new AssessmentEngine({ learningContent, contentVersion, pipelineVersion: PIPELINE_VERSION, generationTimestamp: "2026-07-27T00:00:00.000Z", unresolvedTargetIds });
  const exposure = assessmentExposureInputSchema.parse({});
  const bundledExams: AssessmentSnapshot[] = [];
  for (const level of ["N5", "N4"] as const) {
    const blueprint = blueprints.find((entry) => entry.level === level && entry.assessmentType === "full-mock");
    if (!blueprint) throw new Error(`Missing ${level} full-mock blueprint.`);
    for (const fixed of seeds[level]) {
      const snapshot = engine.generateFullMockExam({ assessmentType: "full-mock", level, seed: fixed.seed, lifecycleMode: "development", resultMode: "full", remediationMode: false, strictTimeLimit: false }, blueprint, exposure);
      bundledExams.push(snapshot); incrementExposure(exposure, snapshot);
    }
  }
  const samples: AssessmentSnapshot[] = [];
  const sampleBlueprints: AssessmentBlueprint[] = [];
  const sampleDefinitions: Array<[AssessmentBlueprint["assessmentType"], Array<"vocabulary" | "kanji" | "grammar">, number[], number]> = [
    ["section-exam", ["vocabulary", "kanji"], [10,10], 20], ["quick-practice", ["vocabulary","kanji","grammar"], [3,3,4], 10], ["daily-challenge", ["vocabulary","kanji","grammar"], [3,3,4], 10], ["weak-area", ["vocabulary","kanji","grammar"], [4,4,7], 15], ["mixed-review", ["vocabulary","kanji","grammar"], [7,6,7], 20], ["curriculum-unit-test", ["vocabulary","kanji","grammar"], [5,4,6], 15], ["grammar-mastery", ["grammar"], [15], 15], ["vocabulary-mastery", ["vocabulary"], [15], 12], ["kanji-mastery", ["kanji"], [15], 12],
  ];
  for (const level of ["N5", "N4"] as const) for (const [type, domains, counts, minutes] of sampleDefinitions) {
    const blueprint = simpleBlueprint(type, level, domains, counts, minutes);
    sampleBlueprints.push(blueprint);
    const weakTargetIds = type === "weak-area" ? learningContent.questionTargetRelationships.filter(({ role }) => role === "primary").slice(0, 5).map(({ targetId }) => targetId) : undefined;
    samples.push(engine.generateAssessment({ config: { assessmentType: type, level, seed: `sample-${type}-${level.toLowerCase()}-v1`, lifecycleMode: "development", domains, weakTargetIds, remediationMode: false, strictTimeLimit: false, resultMode: "full" }, blueprint }));
  }
  for (const level of ["N5", "N4"] as const) for (const type of ["reading-practice", "listening-practice"] as const) {
    const reading = type === "reading-practice"; const questionCount = reading ? 13 : 11; const domain = reading ? "reading" as const : "listening" as const;
    const parentQuotas = reading ? [{ parentType: "reading-passage" as const, format: "short", count: 3 }, { parentType: "reading-passage" as const, format: "medium", count: 1 }] : [{ parentType: "listening-activity" as const, format: "short-monologue", count: 1 }, { parentType: "listening-activity" as const, format: "dialogue", count: 1 }, { parentType: "listening-activity" as const, format: "practical-information", count: 1 }, { parentType: "listening-activity" as const, format: "appropriate-response", count: 1 }];
    const blueprint = assessmentBlueprintSchema.parse({ schemaVersion: 1, id: `assessment-blueprint-sample-${type}-${level.toLowerCase()}`, assessmentType: type, level, title: `${level} ${type} sample`, intendedUse: "A deterministic coherent-parent development practice sample.", defaultQuestionCount: questionCount, defaultTimeLimitMinutes: 20, sections: [{ id: `assessment-section-blueprint-sample-${type}-${level.toLowerCase()}`, title: "Comprehension", order: 1, domains: [domain], questionCount, recommendedMinutes: 20, domainQuotas: [{ domain, minimum: questionCount, preferred: questionCount, maximum: questionCount }], parentQuotas, difficultyDistribution: { easy: .4, medium: .5, hard: .1 } }], targetLimits: { grammar: 2, vocabulary: 2, kanji: 2 }, completionRule: "all-placed-questions-answered-or-time-expired", resultMode: "full", releaseReady: false });
    sampleBlueprints.push(blueprint); samples.push(engine.generateAssessment({ config: { assessmentType: type, level, seed: `sample-${type}-${level.toLowerCase()}-v1`, lifecycleMode: "development", domains: [domain], remediationMode: false, strictTimeLimit: false, resultMode: "full" }, blueprint }));
  }
  return { learningContent, assessments: assessmentCollectionsSchema.parse({ schemaVersion: 1, blueprints: [...blueprints, ...sampleBlueprints], presets, bundledExams, sampleSnapshots: samples }) };
}

export const ASSESSMENT_CONTENT_SCHEMA_VERSION = CONTENT_SCHEMA_VERSION;
