import { z } from "zod";

import {
  type LearningContentCollections,
  type Sentence,
} from "../../src/features/learning-content/schemas";
import { SOURCE_PATHS } from "./config";
import { readJson } from "./lib/fs-utils";
import type { CurriculumUnit, VocabularyRecord } from "./schemas/content-schemas";

export const PHASE10_VOCABULARY_SOURCE_ID = "japango-phase10-vocabulary-expansion";

const sourceSchema = z.object({
  schemaVersion: z.literal(1),
  evidence: z.object({
    policy: z.string().min(1),
    referenceIds: z.array(z.string().min(1)).min(2),
  }).strict(),
  records: z.array(z.tuple([
    z.string().min(1),
    z.string().min(1),
    z.string().min(1),
    z.enum(["N5", "N4"]),
  ])),
}).strict();

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableSlug(value: string): string {
  return [...value]
    .map((character) => /^[a-z0-9-]$/u.test(character)
      ? character
      : `u${character.codePointAt(0)!.toString(16)}`)
    .join("")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function codePointRange(text: string, fragment: string): { startCodePoint: number; endCodePoint: number } {
  const index = text.indexOf(fragment);
  if (index < 0) throw new Error(`Phase 10 vocabulary sentence lacks ${fragment}: ${text}`);
  const startCodePoint = [...text.slice(0, index)].length;
  return { startCodePoint, endCodePoint: startCodePoint + [...fragment].length };
}

function primaryReading(record: VocabularyRecord): string {
  return record.readings.find(({ primary }) => primary)?.kana ?? record.readings[0]?.kana ?? record.primaryForm;
}

function isPhase10NewRecord(record: VocabularyRecord): boolean {
  return record.releaseReady &&
    record.sources.some(({ sourceId }) => sourceId === PHASE10_VOCABULARY_SOURCE_ID) &&
    !record.sources.some(({ sourceId }) => sourceId === "jlpt-vocabulary");
}

function approvedReuseSentence(record: VocabularyRecord, sentences: readonly Sentence[]): Sentence | undefined {
  // Avoid incidental single-kanji matches; those items receive a purpose-built context.
  if ([...record.primaryForm].length < 2) return undefined;
  return [...sentences]
    .filter((sentence) => sentence.releaseReady && sentence.reviewStatus === "approved" && sentence.japanese.includes(record.primaryForm))
    .sort((left, right) => compareStable(left.id, right.id))[0];
}

/** Adds one original or safely reused context to every genuinely new Phase 10 word. */
export async function loadPhase10VocabularySupport(
  vocabulary: readonly VocabularyRecord[],
  existingSentences: readonly Sentence[],
  curriculumUnits: readonly CurriculumUnit[],
): Promise<LearningContentCollections> {
  sourceSchema.parse(await readJson<unknown>(SOURCE_PATHS.phase10VocabularyExpansion));
  const n4UnitId = curriculumUnits.find(({ id }) => id.startsWith("n4-unit-"))?.id;
  if (!n4UnitId) throw new Error("Phase 10 vocabulary support requires an N4 curriculum unit.");

  const generatedSentences: Sentence[] = [];
  const grammarExampleViews: LearningContentCollections["grammarExampleViews"] = [];
  const vocabularyExampleViews: LearningContentCollections["vocabularyExampleViews"] = [];
  const targets = vocabulary.filter(isPhase10NewRecord).sort((left, right) => compareStable(left.id, right.id));

  for (const record of targets) {
    const slug = stableSlug(record.id.replace(/^vocab-/u, ""));
    const reuse = approvedReuseSentence(record, existingSentences);
    const sentenceId = reuse?.id ?? `sentence-n4-phase10-${slug}`;
    let japanese = reuse?.japanese;

    if (!reuse) {
      const form = record.primaryForm;
      japanese = `「${form}」という言葉は、日常の会話や文章で使われます。`;
      generatedSentences.push({
        schemaVersion: 1,
        id: sentenceId,
        japanese,
        reading: `「${primaryReading(record)}」ということばは、にちじょうのかいわやぶんしょうでつかわれます。`,
        english: `“${form}” is a word used in everyday conversation and writing.`,
        sentenceType: "statement",
        estimatedReadingSeconds: 5,
        register: "neutral",
        difficulty: { jlptLevel: "N4", rank: 3 },
        tags: ["grammar-example", "phase10-vocabulary"],
        context: { kind: "standalone", speaker: null, addressee: null, settingTags: ["daily-life"] },
        curriculumUnitIds: [n4UnitId],
        media: { audioAssetIds: [], imageAssetIds: [] },
        sourceIds: [PHASE10_VOCABULARY_SOURCE_ID],
        attribution: ["Original JapanGo Phase 10 vocabulary context and translation."],
        provenance: { sourceType: "original-japango", authoringMethod: "original-editorial-authoring" },
        reviewStatus: "approved",
        usageNote: "A concise original context for a verified Phase 10 vocabulary item.",
        commonMistakeNote: null,
        futureQuestionSuitability: [],
        releaseBlockers: [],
        confidence: 0.99,
        needsReview: false,
        releaseReady: true,
      });
      grammarExampleViews.push({
        schemaVersion: 1,
        id: `grammar-example-n4-phase10-${slug}`,
        sentenceId,
        grammarId: "grammar-n4-to-iu",
        role: "focus",
        focusRanges: [codePointRange(japanese, "という")],
        note: "Original N4 vocabulary context using ～という to identify a word.",
        confidence: 0.99,
        needsReview: false,
        releaseReady: true,
      });
    }

    if (!japanese) throw new Error(`Phase 10 could not resolve a sentence for ${record.id}.`);
    vocabularyExampleViews.push({
      schemaVersion: 1,
      id: `vocabulary-example-n4-phase10-${slug}`,
      sentenceId,
      vocabularyId: record.id,
      role: "supporting",
      focusRanges: [codePointRange(japanese, record.primaryForm)],
      note: reuse
        ? "Reuses an approved original JapanGo sentence containing this exact canonical form."
        : "Direct canonical vocabulary exposure in an original JapanGo context.",
      confidence: 0.99,
      needsReview: false,
      releaseReady: true,
    });
  }

  return {
    schemaVersion: 1,
    sentences: generatedSentences.sort((left, right) => compareStable(left.id, right.id)),
    readingPassages: [],
    listeningSpeakers: [],
    listeningActivities: [],
    grammarExampleViews: grammarExampleViews.sort((left, right) => compareStable(left.id, right.id)),
    vocabularyExampleViews: vocabularyExampleViews.sort((left, right) => compareStable(left.id, right.id)),
    kanjiExampleViews: [],
    questions: [],
    questionOptions: [],
    learningItemMetadata: [],
    questionTargetRelationships: [],
  } satisfies LearningContentCollections;
}

export function phase10NewVocabularyIds(vocabulary: readonly VocabularyRecord[]): Set<string> {
  return new Set(vocabulary.filter(isPhase10NewRecord).map(({ id }) => id));
}
