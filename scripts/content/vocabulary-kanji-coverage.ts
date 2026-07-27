import path from "node:path";

import type {
  LearningContentCollections,
  Sentence,
  VocabularyExampleView,
} from "../../src/features/learning-content/schemas";
import { OUTPUT_ROOT } from "./config";
import { isDirectExecution, runCli } from "./lib/cli";
import { readJson, writeJson, writeText } from "./lib/fs-utils";
import type {
  KanjiRecord,
  VocabularyRecord,
} from "./schemas/content-schemas";
import type { ContentBundle } from "./validate-content";

export interface VocabularyCoverageRow {
  vocabularyId: string;
  level: "N5" | "N4";
  canonicalForm: string;
  canonicalReading: string;
  partOfSpeech: string[];
  releaseReady: boolean;
  approvedSentenceIds: string[];
  approvedPrimarySentenceIds: string[];
  approvedSecondarySentenceIds: string[];
  representedSenseIds: string[];
  representedReadings: string[];
  representedForms: string[];
  contexts: string[];
  registers: string[];
  sentenceTypes: string[];
  requiredMinimum: number;
  coverageStatus: "pass" | "gap" | "not-release-target";
}

export interface KanjiCoverageRow {
  kanjiId: string;
  level: "N5" | "N4";
  character: string;
  releaseReady: boolean;
  approvedSentenceIds: string[];
  representedVocabularyIds: string[];
  representedReadings: string[];
  representedCompounds: string[];
  representedStandaloneUsages: string[];
  availableCanonicalVocabularyIds: string[];
  inventoryFeasible: boolean;
  contexts: string[];
  requiredMinimum: number;
  coverageStatus: "pass" | "gap" | "not-release-target";
}

export interface VocabularyKanjiCoverage {
  vocabulary: VocabularyCoverageRow[];
  kanji: KanjiCoverageRow[];
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareStable);
}

function codePointSlice(value: string, start: number, end: number): string {
  return [...value].slice(start, end).join("");
}

function primaryReading(record: VocabularyRecord): string {
  return record.readings.find(({ primary }) => primary)?.kana ?? record.readings[0]?.kana ?? "";
}

function representedVocabularySurface(
  sentence: Sentence,
  view: VocabularyExampleView,
): string[] {
  return sorted(
    view.focusRanges.map(({ startCodePoint, endCodePoint }) =>
      codePointSlice(sentence.japanese, startCodePoint, endCodePoint),
    ),
  );
}

function senseIdsFromNote(note: string | null): string[] {
  if (!note) return [];
  return sorted(
    [...note.matchAll(/(?:^|;)sense:([^;]+)/gu)].map((match) => match[1]),
  );
}

function readingsFromNote(note: string | null): string[] {
  if (!note) return [];
  return sorted(
    [...note.matchAll(/(?:^|;)reading:([^;]+)/gu)].map((match) => match[1]),
  );
}

function vocabularySurfaceContainsKanji(
  record: VocabularyRecord,
  character: string,
  surfaces: readonly string[],
): boolean {
  const canonicalForms = record.writtenForms.map(({ text }) => text);
  return surfaces.some(
    (surface) =>
      surface.includes(character) &&
      canonicalForms.some((form) => form.includes(character) && surface.includes(form)),
  );
}

export function calculateVocabularyKanjiCoverage(
  content: LearningContentCollections,
  vocabulary: readonly VocabularyRecord[],
  kanji: readonly KanjiRecord[],
): VocabularyKanjiCoverage {
  const sentenceById = new Map(content.sentences.map((sentence) => [sentence.id, sentence]));
  const vocabularyById = new Map(vocabulary.map((record) => [record.id, record]));
  const viewsByVocabulary = new Map<string, VocabularyExampleView[]>();
  const vocabularyViewsBySentence = new Map<string, VocabularyExampleView[]>();
  for (const view of content.vocabularyExampleViews) {
    viewsByVocabulary.set(view.vocabularyId, [...(viewsByVocabulary.get(view.vocabularyId) ?? []), view]);
    vocabularyViewsBySentence.set(view.sentenceId, [
      ...(vocabularyViewsBySentence.get(view.sentenceId) ?? []),
      view,
    ]);
  }

  const vocabularyRows = vocabulary.map((record): VocabularyCoverageRow => {
    const approvedViews = (viewsByVocabulary.get(record.id) ?? []).filter(
      ({ sentenceId }) => sentenceById.get(sentenceId)?.reviewStatus === "approved",
    );
    const sentences = approvedViews
      .map(({ sentenceId }) => sentenceById.get(sentenceId))
      .filter((sentence): sentence is Sentence => Boolean(sentence));
    const primary = approvedViews.filter(({ role }) => role === "focus");
    const secondary = approvedViews.filter(({ role }) => role === "supporting");
    const representedSenseIds = sorted(
      approvedViews.flatMap((view) =>
        senseIdsFromNote(view.note).length > 0 ? senseIdsFromNote(view.note) : ["sense-0"],
      ),
    );
    const representedReadings = sorted(
      approvedViews.flatMap((view) => {
        const explicit = readingsFromNote(view.note);
        return explicit.length > 0 ? explicit : [primaryReading(record)];
      }),
    ).filter(Boolean);
    const releasePass = approvedViews.length >= 2 && primary.length >= 1;
    return {
      vocabularyId: record.id,
      level: record.jlpt.level as "N5" | "N4",
      canonicalForm: record.primaryForm,
      canonicalReading: primaryReading(record),
      partOfSpeech: [...record.partOfSpeech].sort(compareStable),
      releaseReady: record.releaseReady,
      approvedSentenceIds: sorted(approvedViews.map(({ sentenceId }) => sentenceId)),
      approvedPrimarySentenceIds: sorted(primary.map(({ sentenceId }) => sentenceId)),
      approvedSecondarySentenceIds: sorted(secondary.map(({ sentenceId }) => sentenceId)),
      representedSenseIds,
      representedReadings,
      representedForms: sorted(
        approvedViews.flatMap((view) => {
          const sentence = sentenceById.get(view.sentenceId);
          return sentence ? representedVocabularySurface(sentence, view) : [];
        }),
      ),
      contexts: sorted(sentences.flatMap(({ context }) => context.settingTags)),
      registers: sorted(sentences.map(({ register }) => register)),
      sentenceTypes: sorted(sentences.map(({ sentenceType }) => sentenceType)),
      requiredMinimum: 2,
      coverageStatus: !record.releaseReady ? "not-release-target" : releasePass ? "pass" : "gap",
    };
  });

  const kanjiRows = kanji.map((record): KanjiCoverageRow => {
    const availableCanonicalVocabularyIds = sorted(
      vocabulary
        .filter(({ releaseReady, writtenForms }) =>
          releaseReady && writtenForms.some(({ text }) => text.includes(record.character)),
        )
        .map(({ id }) => id),
    );
    const approvedKanjiViews = content.kanjiExampleViews.filter(
      (view) =>
        view.kanjiId === record.id &&
        sentenceById.get(view.sentenceId)?.reviewStatus === "approved",
    );
    const sentenceIds = sorted(approvedKanjiViews.map(({ sentenceId }) => sentenceId));
    const representedVocabulary: Array<{ id: string; reading: string; forms: string[] }> = [];
    for (const sentenceId of sentenceIds) {
      const sentence = sentenceById.get(sentenceId);
      if (!sentence) continue;
      for (const view of vocabularyViewsBySentence.get(sentenceId) ?? []) {
        const vocabularyRecord = vocabularyById.get(view.vocabularyId);
        if (!vocabularyRecord) continue;
        const surfaces = representedVocabularySurface(sentence, view);
        if (vocabularySurfaceContainsKanji(vocabularyRecord, record.character, surfaces)) {
          representedVocabulary.push({
            id: vocabularyRecord.id,
            reading: readingsFromNote(view.note)[0] ?? primaryReading(vocabularyRecord),
            forms: surfaces,
          });
        }
      }
    }
    const vocabularyIds = sorted(representedVocabulary.map(({ id }) => id));
    const readings = sorted(representedVocabulary.map(({ reading }) => reading).filter(Boolean));
    const forms = sorted(representedVocabulary.flatMap(({ forms }) => forms));
    const sentences = sentenceIds
      .map((id) => sentenceById.get(id))
      .filter((sentence): sentence is Sentence => Boolean(sentence));
    const releasePass = sentenceIds.length >= 3 && vocabularyIds.length >= 2 && readings.length >= 1;
    return {
      kanjiId: record.id,
      level: record.jlpt.level === "N4" ? "N4" : "N5",
      character: record.character,
      releaseReady: record.releaseReady,
      approvedSentenceIds: sentenceIds,
      representedVocabularyIds: vocabularyIds,
      representedReadings: readings,
      representedCompounds: forms.filter((form) => [...form].length > 1),
      representedStandaloneUsages: forms.filter((form) => form === record.character),
      availableCanonicalVocabularyIds,
      inventoryFeasible: availableCanonicalVocabularyIds.length >= 2,
      contexts: sorted(sentences.flatMap(({ context }) => context.settingTags)),
      requiredMinimum: 3,
      coverageStatus: !record.releaseReady ? "not-release-target" : releasePass ? "pass" : "gap",
    };
  });

  return {
    vocabulary: vocabularyRows.sort((left, right) => compareStable(left.vocabularyId, right.vocabularyId)),
    kanji: kanjiRows.sort((left, right) => compareStable(left.kanjiId, right.kanjiId)),
  };
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|");
}

export async function writeVocabularyKanjiGapReports(
  coverage: VocabularyKanjiCoverage,
  label: "phase2-baseline" | "phase3-final",
): Promise<void> {
  const vocabularyRows = coverage.vocabulary.map((row) =>
    `| ${row.vocabularyId} | ${row.level} | ${escapeCell(row.canonicalForm)} | ${row.releaseReady ? "ready" : "not-ready"} | ${row.approvedSentenceIds.length} | ${row.approvedPrimarySentenceIds.length} | ${row.approvedSecondarySentenceIds.length} | ${row.representedSenseIds.join(", ")} | ${row.representedReadings.join(", ")} | ${row.contexts.join(", ")} | ${row.registers.join(", ")} | ${row.coverageStatus} |`,
  );
  const kanjiRows = coverage.kanji.map((row) =>
    `| ${row.kanjiId} | ${row.level} | ${row.character} | ${row.releaseReady ? "ready" : "not-ready"} | ${row.approvedSentenceIds.length} | ${row.representedVocabularyIds.length} | ${row.availableCanonicalVocabularyIds.length} | ${row.inventoryFeasible ? "yes" : "no"} | ${row.representedReadings.join(", ")} | ${row.representedCompounds.join(", ")} | ${row.representedStandaloneUsages.join(", ")} | ${row.contexts.join(", ")} | ${row.coverageStatus} |`,
  );
  const vocabularyMarkdown = [
    "# Vocabulary sentence gap analysis",
    "",
    `Audit stage: ${label}. Approved canonical sentence relationships only.`,
    "",
    "| Vocabulary ID | Level | Form | Release | Total | Primary | Secondary | Senses | Readings | Contexts | Registers | Status |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- |",
    ...vocabularyRows,
  ].join("\n");
  const kanjiMarkdown = [
    "# Kanji sentence gap analysis",
    "",
    `Audit stage: ${label}. Kanji vocabulary diversity requires distinct canonical vocabulary relationships whose written surface contains the character.`,
    "",
    `Structurally infeasible release targets: ${coverage.kanji.filter((row) => row.releaseReady && !row.inventoryFeasible).length}. These records have fewer than two distinct release-ready canonical vocabulary records containing the character; sentence authoring alone cannot satisfy the diversity rule.`,
    "",
    "| Kanji ID | Level | Character | Release | Sentences | Demonstrated vocabulary | Available vocabulary | Inventory feasible | Readings | Compounds | Standalone | Contexts | Status |",
    "| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |",
    ...kanjiRows,
  ].join("\n");
  const senseMarkdown = [
    "# Vocabulary sense coverage",
    "",
    "Sense labels are relationship metadata. Legacy Phase 2 relationships without an explicit label are conservatively assigned to the canonical primary sense (`sense-0`); additional JMdict senses are not treated as release targets unless editorial metadata marks them as such.",
    "",
    "| Vocabulary ID | Canonical form | Represented release-target senses | Sentence IDs |",
    "| --- | --- | --- | --- |",
    ...coverage.vocabulary.map((row) => `| ${row.vocabularyId} | ${escapeCell(row.canonicalForm)} | ${row.representedSenseIds.join(", ")} | ${row.approvedSentenceIds.join(", ")} |`),
  ].join("\n");
  const readingMarkdown = [
    "# Kanji reading coverage",
    "",
    "Readings are inferred only through canonical vocabulary relationships whose exact written surface contains the kanji. Isolated kanji metadata does not count.",
    "",
    "| Kanji ID | Character | Demonstrating vocabulary | Represented readings | Sentence IDs | Status |",
    "| --- | --- | --- | --- | --- | --- |",
    ...coverage.kanji.map((row) => `| ${row.kanjiId} | ${row.character} | ${row.representedVocabularyIds.join(", ")} | ${row.representedReadings.join(", ")} | ${row.approvedSentenceIds.join(", ")} | ${row.coverageStatus} |`),
  ].join("\n");
  await Promise.all([
    writeText(path.join(OUTPUT_ROOT, "reports/vocabulary-sentence-gap-analysis.md"), vocabularyMarkdown),
    writeText(path.join(OUTPUT_ROOT, "reports/kanji-sentence-gap-analysis.md"), kanjiMarkdown),
    writeText(path.join(OUTPUT_ROOT, "reports/vocabulary-sense-coverage.md"), senseMarkdown),
    writeText(path.join(OUTPUT_ROOT, "reports/kanji-reading-coverage.md"), readingMarkdown),
    writeJson(path.join(OUTPUT_ROOT, `reports/vocabulary-kanji-${label}.json`), coverage),
  ]);
}

async function readGeneratedBundleSubset(): Promise<Pick<ContentBundle, "learningContent" | "vocabulary" | "kanji">> {
  const [learningContent, n5Vocabulary, n4Vocabulary, supplemental, n5Kanji, n4Kanji] = await Promise.all([
    readJson<LearningContentCollections>(path.join(OUTPUT_ROOT, "learning-content/index.json")),
    readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/n5.json")),
    readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/n4.json")),
    readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/supplemental.json")),
    readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n5.json")),
    readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n4.json")),
  ]);
  return {
    learningContent,
    vocabulary: { n5: n5Vocabulary, n4: n4Vocabulary, supplemental },
    kanji: { n5: n5Kanji, n4: n4Kanji, components: [] },
  };
}

if (isDirectExecution(import.meta.url)) {
  runCli(async () => {
    const bundle = await readGeneratedBundleSubset();
    const coverage = calculateVocabularyKanjiCoverage(
      bundle.learningContent,
      [...bundle.vocabulary.n5, ...bundle.vocabulary.n4, ...bundle.vocabulary.supplemental],
      [...bundle.kanji.n5, ...bundle.kanji.n4],
    );
    await writeVocabularyKanjiGapReports(coverage, "phase2-baseline");
    const vocabularyGaps = coverage.vocabulary.filter(({ coverageStatus }) => coverageStatus === "gap").length;
    const kanjiGaps = coverage.kanji.filter(({ coverageStatus }) => coverageStatus === "gap").length;
    console.log(`Phase 2 baseline written: ${vocabularyGaps} vocabulary gaps; ${kanjiGaps} kanji gaps.`);
  });
}
