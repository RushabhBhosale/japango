import { z } from "zod";

import {
  learningContentCollectionsSchema,
  type LearningContentCollections,
} from "../../src/features/learning-content/schemas";
import { SOURCE_PATHS } from "./config";
import { readJson } from "./lib/fs-utils";

const sourceSchema = z.object({
  schemaVersion: z.literal(1),
  records: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/u),
      japanese: z.string().min(1),
      reading: z.string().min(1),
      english: z.string().min(1),
      sentenceType: z.enum(["statement", "request"]),
      grammarId: z.string().regex(/^grammar-n4-[^\s]+$/u),
      grammarFragment: z.string().min(1),
      vocabularyIds: z.array(z.string().regex(/^vocab-[^\s]+$/u)).min(1),
      vocabularySurfaces: z.array(z.string().min(1)).min(1),
    }).strict(),
  ).min(1),
}).strict();

function codePointRange(text: string, fragment: string): { startCodePoint: number; endCodePoint: number } {
  const index = text.indexOf(fragment);
  if (index < 0) throw new Error(`Phase 9.6 support sentence lacks ${fragment}: ${text}`);
  const startCodePoint = [...text.slice(0, index)].length;
  return { startCodePoint, endCodePoint: startCodePoint + [...fragment].length };
}

function stableSlug(value: string): string {
  return [...value]
    .map((character) => /^[a-z0-9-]$/u.test(character) ? character : `u${character.codePointAt(0)!.toString(16)}`)
    .join("")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function sortById<T extends { id: string }>(records: readonly T[]): T[] {
  return [...records].sort((left, right) => left.id.localeCompare(right.id, "en"));
}

/**
 * Phase 9.6 intentionally contains only sentence links for deferred kanji that
 * already have canonical N4 vocabulary and vocabulary-question exposure.
 */
export async function loadPhase96KanjiSupport(): Promise<LearningContentCollections> {
  const source = sourceSchema.parse(await readJson<unknown>(SOURCE_PATHS.phase96KanjiSupport));
  const sentences = sortById(source.records.map((record) => ({
    schemaVersion: 1 as const,
    id: `sentence-n4-zphase96-${record.id}`,
    japanese: record.japanese,
    reading: record.reading,
    english: record.english,
    sentenceType: record.sentenceType,
    estimatedReadingSeconds: 5,
    register: "polite" as const,
    difficulty: { jlptLevel: "N4" as const, rank: 3 },
    tags: ["grammar-example", "phase96-kanji-support"],
    context: { kind: "instruction" as const, speaker: null, addressee: null, settingTags: ["daily-life"] },
    curriculumUnitIds: ["n4-unit-015"],
    media: { audioAssetIds: [], imageAssetIds: [] },
    sourceIds: ["japango-phase96-kanji-support"],
    attribution: ["Original JapanGo Phase 9.6 N4 kanji support sentence and translation."],
    provenance: { sourceType: "original-japango" as const, authoringMethod: "original-editorial-authoring" as const },
    reviewStatus: "approved" as const,
    usageNote: "Supports a deferred Phase 9 N4 kanji through canonical vocabulary in a natural conditional instruction.",
    commonMistakeNote: null,
    futureQuestionSuitability: [],
    releaseBlockers: [],
    confidence: 0.99,
    needsReview: false,
    releaseReady: true,
  })));
  const grammarExampleViews = sortById(source.records.map((record) => ({
    schemaVersion: 1 as const,
    id: `grammar-example-n4-zphase96-${record.id}`,
    sentenceId: `sentence-n4-zphase96-${record.id}`,
    grammarId: record.grammarId,
    role: "focus" as const,
    focusRanges: [codePointRange(record.japanese, record.grammarFragment)],
    note: "Natural Phase 9.6 kanji-support use of an existing N4 grammar pattern.",
    confidence: 0.99,
    needsReview: false,
    releaseReady: true,
  })));
  const vocabularyExampleViews = sortById(source.records.flatMap((record) =>
    record.vocabularyIds.map((vocabularyId, index) => ({
      schemaVersion: 1 as const,
      id: `vocabulary-example-n4-zphase96-${record.id}-${stableSlug(vocabularyId.replace(/^vocab-/u, ""))}`,
      sentenceId: `sentence-n4-zphase96-${record.id}`,
      vocabularyId,
      role: "supporting" as const,
      focusRanges: [codePointRange(record.japanese, record.vocabularySurfaces[index]!)],
      note: "Direct canonical vocabulary exposure for Phase 9.6 kanji support.",
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    })),
  ));
  return learningContentCollectionsSchema.parse({
    schemaVersion: 1,
    sentences,
    grammarExampleViews,
    vocabularyExampleViews,
    kanjiExampleViews: [],
    questions: [],
    questionOptions: [],
    learningItemMetadata: [],
    questionTargetRelationships: [],
  });
}
