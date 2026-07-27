import path from "node:path";

import { AssessmentEngine } from "../../src/features/assessment/assessment-engine";
import { assessmentCollectionsSchema, type AssessmentSnapshot } from "../../src/features/assessment/platform-schemas";
import type { LearningContentCollections } from "../../src/features/learning-content/schemas";
import { PIPELINE_VERSION } from "./config";
import { isDirectExecution, runCli } from "./lib/cli";
import { readJson } from "./lib/fs-utils";
import type { CompactContentBundle } from "./write-compact-outputs";

export async function validateAssessmentContent(): Promise<void> {
  const [content, blueprints, presets, bundledExams, snapshots, release] = await Promise.all([
    readJson<LearningContentCollections>(path.join("assets/generated-content/learning-content/index.json")), readJson(path.join("assets/generated-content/assessments/blueprints.json")), readJson(path.join("assets/generated-content/assessments/presets.json")), readJson(path.join("assets/generated-content/assessments/bundled-mock-exams-all.json")), readJson<AssessmentSnapshot[]>(path.join("assets/generated-content/assessments/assessment-snapshots.json")), readJson<CompactContentBundle>(path.join("assets/generated-content-compact/release/content.json")),
  ]);
  const parsed = assessmentCollectionsSchema.parse({ schemaVersion: 1, blueprints, presets, bundledExams, sampleSnapshots: snapshots.filter(({ assessmentType }) => assessmentType !== "full-mock") }); const engine = new AssessmentEngine({ learningContent: content, contentVersion: parsed.bundledExams[0]?.contentVersion ?? "missing", pipelineVersion: PIPELINE_VERSION }); const errors: string[] = [];
  if (parsed.presets.length !== 12 || new Set(parsed.presets.map(({ assessmentType }) => assessmentType)).size !== 12) errors.push("All 12 unique assessment presets are required.");
  for (const level of ["N5", "N4"] as const) if (parsed.bundledExams.filter((exam) => exam.level === level).length !== 5) errors.push(`Exactly five ${level} mocks are required.`);
  for (const snapshot of [...parsed.bundledExams, ...parsed.sampleSnapshots]) { errors.push(...engine.validateAssessment(snapshot).map((error) => `${snapshot.id}: ${error}`)); if (snapshot.releaseReady || snapshot.lifecycleMode !== "development") errors.push(`${snapshot.id} leaked into release lifecycle`); }
  for (const snapshot of parsed.bundledExams) { const expected = snapshot.level === "N5" ? 90 : 112; if (snapshot.questionPlacements.length !== expected) errors.push(`${snapshot.id} has ${snapshot.questionPlacements.length}/${expected} questions`); if (new Set(snapshot.questionPlacements.map(({ domain }) => domain)).size !== 5) errors.push(`${snapshot.id} omits a required domain`); }
  if (release.assessments.blueprints.length || release.assessments.presets.length || release.assessments.bundledExams.length || release.assessments.sampleSnapshots.length) errors.push("Release compact bundle contains Phase 8 assessment content.");
  if (errors.length) throw new Error(`Phase 8 validation failed:\n${errors.join("\n")}`);
  console.log(`Phase 8 validation passed: ${parsed.bundledExams.length} bundled mocks, ${parsed.sampleSnapshots.length} generated samples, ${parsed.presets.length} assessment types.`);
}

if (isDirectExecution(import.meta.url)) runCli(validateAssessmentContent);
