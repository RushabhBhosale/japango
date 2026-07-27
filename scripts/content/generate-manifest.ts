import path from "node:path";

import {
  COMPACT_OUTPUT_ROOT,
  OUTPUT_ROOT,
  PIPELINE_VERSION,
} from "./config";
import { contentVersionForSources } from "./content-version";
import {
  listFilesRecursively,
  relativePosix,
  sha256File,
  writeJson,
} from "./lib/fs-utils";
import { contentManifestSchema } from "./schemas/content-schemas";
import type { ContentBundle } from "./validate-content";

function generationTimestamp(): { value: string; reproducible: boolean } {
  const explicit = process.env.JAPANGO_GENERATED_AT;
  if (explicit) {
    const parsed = new Date(explicit);
    if (Number.isNaN(parsed.valueOf())) {
      throw new Error("JAPANGO_GENERATED_AT must be an ISO-8601 timestamp");
    }
    return { value: parsed.toISOString(), reproducible: true };
  }
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch) {
    const seconds = Number.parseInt(epoch, 10);
    if (!Number.isFinite(seconds)) {
      throw new Error("SOURCE_DATE_EPOCH must contain integer Unix seconds");
    }
    return { value: new Date(seconds * 1000).toISOString(), reproducible: true };
  }
  // Content output must remain byte-for-byte reproducible in local and CI
  // builds even when a caller does not supply a build timestamp.
  return { value: "2026-07-27T00:00:00.000Z", reproducible: true };
}

export async function generateManifest(
  bundle: ContentBundle,
  unresolved: Record<string, number>,
): Promise<void> {
  // Reports are derived audit artefacts. Several deliberately include previous
  // manifest metadata for diagnostics, so hashing them into the manifest makes
  // the manifest depend on its own prior build. Content outputs remain covered;
  // reports are finalized and verified by their dedicated deterministic checks.
  const outputFiles = (await listFilesRecursively(OUTPUT_ROOT)).filter(
    (filePath) => path.basename(filePath) !== "content-manifest.json" && !filePath.endsWith(".tmp") && !relativePosix(OUTPUT_ROOT, filePath).startsWith("reports/"),
  );
  const outputFileChecksums: Record<string, string> = {};
  for (const filePath of outputFiles) {
    outputFileChecksums[relativePosix(OUTPUT_ROOT, filePath)] = await sha256File(filePath);
  }
  const compactFiles = (await listFilesRecursively(COMPACT_OUTPUT_ROOT)).filter(
    (filePath) => !filePath.endsWith(".tmp"),
  );
  const compactOutputChecksums: Record<string, string> = {};
  for (const filePath of compactFiles) {
    compactOutputChecksums[relativePosix(COMPACT_OUTPUT_ROOT, filePath)] =
      await sha256File(filePath);
  }
  const sourceChecksums = Object.fromEntries(
    bundle.sourceRegistry.map((source) => [source.id, source.checksum]),
  );
  const timestamp = generationTimestamp();
  const manifest = {
    contentVersion: contentVersionForSources(bundle.sourceRegistry),
    generationTimestamp: timestamp.value,
    reproducibleTimestamp: timestamp.reproducible,
    pipelineVersion: PIPELINE_VERSION,
    sourceChecksums,
    counts: {
      vocabulary: {
        n5: bundle.vocabulary.n5.length,
        n4: bundle.vocabulary.n4.length,
        supplemental: bundle.vocabulary.supplemental.length,
      },
      kanji: { n5: bundle.kanji.n5.length, n4: bundle.kanji.n4.length },
      grammar: { n5: bundle.grammar.n5.length, n4: bundle.grammar.n4.length },
      curriculumUnits: {
        n5: bundle.curriculum.n5.length,
        n4: bundle.curriculum.n4.length,
      },
      learningContent: {
        sentences: bundle.learningContent.sentences.length,
        readingPassages: bundle.learningContent.readingPassages.length,
        listeningSpeakers: bundle.learningContent.listeningSpeakers.length,
        listeningActivities: bundle.learningContent.listeningActivities.length,
        grammarExampleViews:
          bundle.learningContent.grammarExampleViews.length,
        vocabularyExampleViews:
          bundle.learningContent.vocabularyExampleViews.length,
        kanjiExampleViews: bundle.learningContent.kanjiExampleViews.length,
        questions: bundle.learningContent.questions.length,
        questionOptions: bundle.learningContent.questionOptions.length,
        learningItemMetadata:
          bundle.learningContent.learningItemMetadata.length,
        questionTargetRelationships:
          bundle.learningContent.questionTargetRelationships.length,
      },
      assessments: {
        blueprints: bundle.assessments.blueprints.length,
        presets: bundle.assessments.presets.length,
        bundledExams: bundle.assessments.bundledExams.length,
        sampleSnapshots: bundle.assessments.sampleSnapshots.length,
        questionPlacements: [...bundle.assessments.bundledExams, ...bundle.assessments.sampleSnapshots].reduce((sum, snapshot) => sum + snapshot.questionPlacements.length, 0),
        parentPlacements: [...bundle.assessments.bundledExams, ...bundle.assessments.sampleSnapshots].reduce((sum, snapshot) => sum + snapshot.parentPlacements.length, 0),
      },
    },
    unresolvedCounts: unresolved,
    releaseReadyCounts: {
      vocabulary: [
        ...bundle.vocabulary.n5,
        ...bundle.vocabulary.n4,
        ...bundle.vocabulary.supplemental,
      ].filter((record) => record.releaseReady).length,
      kanji: [...bundle.kanji.n5, ...bundle.kanji.n4].filter(
        (record) => record.releaseReady,
      ).length,
      grammar: [...bundle.grammar.n5, ...bundle.grammar.n4].filter(
        (record) => record.releaseReady,
      ).length,
      curriculumUnits: [...bundle.curriculum.n5, ...bundle.curriculum.n4].filter(
        (record) => record.releaseReady,
      ).length,
      sentences: bundle.learningContent.sentences.filter(
        (record) => record.releaseReady,
      ).length,
      readingPassages: bundle.learningContent.readingPassages.filter(
        (record) => record.releaseReady,
      ).length,
      listeningSpeakers: bundle.learningContent.listeningSpeakers.filter((record) => record.releaseReady).length,
      listeningActivities: bundle.learningContent.listeningActivities.filter((record) => record.releaseReady).length,
      grammarExampleViews:
        bundle.learningContent.grammarExampleViews.filter(
          (record) => record.releaseReady,
        ).length,
      vocabularyExampleViews:
        bundle.learningContent.vocabularyExampleViews.filter(
          (record) => record.releaseReady,
        ).length,
      kanjiExampleViews: bundle.learningContent.kanjiExampleViews.filter(
        (record) => record.releaseReady,
      ).length,
      questions: bundle.learningContent.questions.filter(
        (record) => record.releaseReady,
      ).length,
      questionOptions: bundle.learningContent.questionOptions.filter(
        (record) => record.releaseReady,
      ).length,
      learningItemMetadata:
        bundle.learningContent.learningItemMetadata.filter(
          (record) => record.releaseReady,
        ).length,
      questionTargetRelationships:
        bundle.learningContent.questionTargetRelationships.filter(
          (record) => record.releaseReady,
        ).length,
    },
    outputFileChecksums,
    compactOutputChecksums,
  };
  contentManifestSchema.parse(manifest);
  await writeJson(path.join(OUTPUT_ROOT, "content-manifest.json"), manifest);
}
