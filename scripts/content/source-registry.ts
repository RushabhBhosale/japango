import { stat } from "node:fs/promises";
import path from "node:path";

import {
  OUTPUT_ROOT,
  PIPELINE_VERSION,
  PROJECT_ROOT,
  SOURCE_PATHS,
  SOURCE_ROOT,
  TEXTBOOKS,
} from "./config";
import {
  listFilesRecursively,
  relativePosix,
  sha256File,
  sha256Text,
  writeJson,
} from "./lib/fs-utils";
import type { SourceRegistryEntry } from "./schemas/content-schemas";

async function checksumPath(sourcePath: string): Promise<string> {
  const sourceStat = await stat(sourcePath);
  if (sourceStat.isFile()) {
    return sha256File(sourcePath);
  }
  const files = await listFilesRecursively(sourcePath);
  const lines: string[] = [];
  for (const filePath of files) {
    lines.push(
      `${relativePosix(sourcePath, filePath)}\u0000${await sha256File(filePath)}`,
    );
  }
  return `sha256:${sha256Text(lines.join("\n"))}`;
}

interface RegistrySeed extends Omit<SourceRegistryEntry, "checksum" | "parserVersion"> {
  absolutePath: string;
}

function textbookId(displayName: string): string {
  return `textbook-${displayName
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")}`;
}

export async function buildSourceRegistry(): Promise<SourceRegistryEntry[]> {
  const seeds: RegistrySeed[] = [
    {
      id: "jmdict",
      displayName: "JMdict English with examples (Yomitan export)",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.jmdict),
      absolutePath: SOURCE_PATHS.jmdict,
      format: "Yomitan v3 JSON term banks",
      version: "JMdict.2026-07-25",
      licence: "Creative Commons Attribution-ShareAlike 4.0 (EDRDG/JMdict)",
      attributionText:
        "This product uses material from JMdict supplied by the Electronic Dictionary Research and Development Group.",
      redistributionNotes:
        "Retain EDRDG attribution, provide an in-app Sources/About acknowledgement, apply ShareAlike where required, and maintain an update procedure. See https://www.edrdg.org/edrdg/licence.html.",
      role: "canonical",
    },
    {
      id: "kanjidic2",
      displayName: "KANJIDIC2",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.kanjidic),
      absolutePath: SOURCE_PATHS.kanjidic,
      format: "KANJIDIC2 XML v4",
      version: "2026-206 (2026-07-25)",
      licence: "Creative Commons Attribution-ShareAlike 4.0 (EDRDG/KANJIDIC2)",
      attributionText:
        "This product uses KANJIDIC2 material supplied by the Electronic Dictionary Research and Development Group.",
      redistributionNotes:
        "Retain EDRDG attribution, provide an in-app Sources/About acknowledgement, apply ShareAlike where required, and omit unused specially attributed dictionary/query fields. See https://www.edrdg.org/edrdg/licence.html.",
      role: "canonical",
    },
    {
      id: "kanjivg",
      displayName: "KanjiVG",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.kanjivg),
      absolutePath: SOURCE_PATHS.kanjivg,
      format: "KanjiVG SVG files",
      version: null,
      licence: "Creative Commons Attribution-ShareAlike 3.0",
      attributionText:
        "KanjiVG © Ulrich Apel and contributors, https://kanjivg.tagaini.net/",
      redistributionNotes:
        "Attribution and ShareAlike conditions apply to KanjiVG and adaptations.",
      role: "canonical",
    },
    {
      id: "jlpt-vocabulary",
      displayName: "JLPT vocabulary mapping CSV",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.jlptVocabulary),
      absolutePath: SOURCE_PATHS.jlptVocabulary,
      format: "UTF-8 CSV",
      version: null,
      licence: null,
      attributionText: "Locally supplied JLPT vocabulary mapping; upstream attribution was not included.",
      redistributionNotes:
        "Do not publish this source or its mapping-derived output until provenance and redistribution terms are confirmed.",
      role: "mapping",
    },
    {
      id: "jlpt-kanji",
      displayName: "JLPT kanji mapping (kanjiapi.dev filtered dataset)",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.jlptKanji),
      absolutePath: SOURCE_PATHS.jlptKanji,
      format: "UTF-8 JSON object keyed by kanji",
      version: null,
      licence: "Composite upstream terms; exact redistribution terms require review",
      attributionText:
        "Data/API: kanjiapi.dev; dictionary material: EDRDG; JLPT mapping: Jonathan Waller's JLPT resources.",
      redistributionNotes:
        "The supplied README names sources but no complete local licence text; review all upstream terms before release.",
      role: "mapping",
    },
    {
      id: "kotoba-brew-grammar-n5",
      displayName: "Kotoba Brew JLPT Grammar Tracker N5",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.grammar),
      absolutePath: SOURCE_PATHS.grammar,
      format: "UTF-8 CSV exported from XLSX",
      version: null,
      licence: null,
      attributionText: "Locally supplied Kotoba Brew JLPT Grammar Tracker export.",
      redistributionNotes:
        "No local licence or provenance file was supplied; publish only after terms are confirmed.",
      role: "mapping",
    },
    {
      id: "japango-n4-grammar-reviewed",
      displayName: "JapanGo manually curated N4 grammar",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.reviewedN4Grammar),
      absolutePath: SOURCE_PATHS.reviewedN4Grammar,
      format: "UTF-8 JSON",
      version: "1",
      licence: "Original JapanGo editorial metadata",
      attributionText:
        "JapanGo manual curation; textbook references are coverage metadata only.",
      redistributionNotes:
        "Contains original classification metadata and concise formation summaries; no textbook prose, examples, exercises, or answer material.",
      role: "canonical",
    },
    {
      id: "japango-n4-grammar-editorial-decisions",
      displayName: "JapanGo N4 grammar editorial decision ledger",
      localPath: relativePosix(
        PROJECT_ROOT,
        SOURCE_PATHS.n4GrammarEditorialDecisions,
      ),
      absolutePath: SOURCE_PATHS.n4GrammarEditorialDecisions,
      format: "UTF-8 JSON",
      version: "1",
      licence: "Original JapanGo editorial metadata",
      attributionText: "JapanGo manual N4 grammar curation audit ledger.",
      redistributionNotes:
        "Stores classifications and short original reasons, without copied textbook content.",
      role: "supplemental",
    },
    {
      id: "japango-sentence-corpus-n5",
      displayName: "JapanGo original N5 grammar sentence corpus",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.sentenceCorpusN5),
      absolutePath: SOURCE_PATHS.sentenceCorpusN5,
      format: "UTF-8 JSON",
      version: "1",
      licence: "Original JapanGo content",
      attributionText: "Original JapanGo N5 grammar examples and translations.",
      redistributionNotes:
        "Original JapanGo content; it is not official JLPT material and contains no copied textbook examples.",
      role: "canonical",
    },
    {
      id: "japango-sentence-corpus-n4",
      displayName: "JapanGo original N4 grammar sentence corpus",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.sentenceCorpusN4),
      absolutePath: SOURCE_PATHS.sentenceCorpusN4,
      format: "UTF-8 JSON",
      version: "1",
      licence: "Original JapanGo content",
      attributionText: "Original JapanGo N4 grammar examples and translations.",
      redistributionNotes:
        "Original JapanGo content; it is not official JLPT material and contains no copied textbook examples.",
      role: "canonical",
    },
    {
      id: "japango-sentence-editorial-decisions",
      displayName: "JapanGo sentence editorial decision ledger",
      localPath: relativePosix(
        PROJECT_ROOT,
        SOURCE_PATHS.sentenceEditorialDecisions,
      ),
      absolutePath: SOURCE_PATHS.sentenceEditorialDecisions,
      format: "UTF-8 JSON",
      version: "1",
      licence: "Original JapanGo editorial metadata",
      attributionText: "JapanGo sentence-corpus editorial decisions.",
      redistributionNotes:
        "Stores original editorial decisions and no third-party example text.",
      role: "supplemental",
    },
    {
      id: "japango-grammar-question-corpus",
      displayName: "JapanGo original N5/N4 grammar learning question corpus",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.grammarQuestionCorpus),
      absolutePath: SOURCE_PATHS.grammarQuestionCorpus,
      format: "UTF-8 JSON",
      version: "1",
      licence: "Original JapanGo content",
      attributionText: "Original JapanGo grammar learning questions, options, feedback, and explanations.",
      redistributionNotes:
        "Original JapanGo content; it is not official JLPT material and contains no copied examination or textbook questions.",
      role: "canonical",
    },
    {
      id: "japango-vocabulary-question-corpus",
      displayName: "JapanGo original N5/N4 vocabulary learning question corpus",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.vocabularyQuestionCorpus),
      absolutePath: SOURCE_PATHS.vocabularyQuestionCorpus,
      format: "UTF-8 JSON",
      version: "1",
      licence: "Original JapanGo content",
      attributionText: "Original JapanGo vocabulary learning questions, options, feedback, and explanations.",
      redistributionNotes:
        "Original JapanGo content; it is not official JLPT material and contains no copied examination, dictionary-example, or textbook questions.",
      role: "canonical",
    },
    {
      id: "japango-kanji-question-corpus",
      displayName: "JapanGo original N5/N4 kanji learning question corpus",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.kanjiQuestionCorpus),
      absolutePath: SOURCE_PATHS.kanjiQuestionCorpus,
      format: "UTF-8 JSON",
      version: "1",
      licence: "Original JapanGo content",
      attributionText: "Original JapanGo kanji learning questions, options, feedback, and explanations.",
      redistributionNotes:
        "Original JapanGo content; it is not official JLPT material and contains no copied examination or textbook questions.",
      role: "canonical",
    },
    {
      id: "japango-reading-passage-corpus-n5",
      displayName: "JapanGo original N5 reading passage corpus",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.readingPassageCorpusN5),
      absolutePath: SOURCE_PATHS.readingPassageCorpusN5,
      format: "UTF-8 JSON",
      version: "1",
      licence: "Original JapanGo content",
      attributionText: "Original JapanGo N5 reading passages and translations.",
      redistributionNotes: "Original JapanGo content; it is JLPT-aligned, not official JLPT material.",
      role: "canonical",
    },
    {
      id: "japango-reading-passage-corpus-n4",
      displayName: "JapanGo original N4 reading passage corpus",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.readingPassageCorpusN4),
      absolutePath: SOURCE_PATHS.readingPassageCorpusN4,
      format: "UTF-8 JSON",
      version: "1",
      licence: "Original JapanGo content",
      attributionText: "Original JapanGo N4 reading passages and translations.",
      redistributionNotes: "Original JapanGo content; it is JLPT-aligned, not official JLPT material.",
      role: "canonical",
    },
    {
      id: "japango-reading-question-corpus",
      displayName: "JapanGo original reading-comprehension question corpus",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.readingQuestionCorpus),
      absolutePath: SOURCE_PATHS.readingQuestionCorpus,
      format: "UTF-8 JSON",
      version: "1",
      licence: "Original JapanGo content",
      attributionText: "Original JapanGo reading-comprehension questions, options, feedback, and explanations.",
      redistributionNotes: "Original JapanGo content; it contains no copied examination or textbook questions.",
      role: "canonical",
    },
    {
      id: "japango-reading-editorial-decisions",
      displayName: "JapanGo reading-corpus editorial decision ledger",
      localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.readingEditorialDecisions),
      absolutePath: SOURCE_PATHS.readingEditorialDecisions,
      format: "UTF-8 JSON",
      version: "1",
      licence: "Original JapanGo editorial metadata",
      attributionText: "JapanGo reading-corpus editorial decisions.",
      redistributionNotes: "Stores original editorial decisions and lifecycle constraints.",
      role: "supplemental",
    },
    {
      id: "japango-listening-activity-corpus-n5", displayName: "JapanGo original N5 listening activity corpus", localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.listeningActivityCorpusN5), absolutePath: SOURCE_PATHS.listeningActivityCorpusN5, format: "UTF-8 JSON", version: "1", licence: "Original JapanGo content", attributionText: "Original JapanGo N5 listening scripts and transcripts.", redistributionNotes: "Original JLPT-aligned JapanGo content; no audio or official examination material.", role: "canonical",
    },
    {
      id: "japango-listening-activity-corpus-n4", displayName: "JapanGo original N4 listening activity corpus", localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.listeningActivityCorpusN4), absolutePath: SOURCE_PATHS.listeningActivityCorpusN4, format: "UTF-8 JSON", version: "1", licence: "Original JapanGo content", attributionText: "Original JapanGo N4 listening scripts and transcripts.", redistributionNotes: "Original JLPT-aligned JapanGo content; no audio or official examination material.", role: "canonical",
    },
    {
      id: "japango-listening-question-corpus", displayName: "JapanGo original listening-comprehension questions", localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.listeningQuestionCorpus), absolutePath: SOURCE_PATHS.listeningQuestionCorpus, format: "UTF-8 JSON", version: "1", licence: "Original JapanGo content", attributionText: "Original JapanGo listening questions, options, feedback, and explanations.", redistributionNotes: "Contains no copied examination, textbook, podcast, or application content.", role: "canonical",
    },
    {
      id: "japango-listening-speaker-corpus", displayName: "JapanGo fictional listening speaker registry", localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.listeningSpeakerCorpus), absolutePath: SOURCE_PATHS.listeningSpeakerCorpus, format: "UTF-8 JSON", version: "1", licence: "Original JapanGo metadata", attributionText: "Original fictional JapanGo speaker metadata.", redistributionNotes: "Contains no real public figures or personal information.", role: "canonical",
    },
    {
      id: "japango-listening-editorial-decisions", displayName: "JapanGo listening editorial decision ledger", localPath: relativePosix(PROJECT_ROOT, SOURCE_PATHS.listeningEditorialDecisions), absolutePath: SOURCE_PATHS.listeningEditorialDecisions, format: "UTF-8 JSON", version: "1", licence: "Original JapanGo editorial metadata", attributionText: "JapanGo listening-corpus editorial decisions.", redistributionNotes: "Stores original lifecycle, TTS, and coverage decisions.", role: "supplemental",
    },
    ...([
      ["japango-assessment-blueprints", "JapanGo assessment blueprints", SOURCE_PATHS.assessmentBlueprints, "canonical"],
      ["japango-assessment-presets", "JapanGo assessment presets", SOURCE_PATHS.assessmentPresets, "canonical"],
      ["japango-assessment-bundled-seeds", "JapanGo bundled mock-exam seeds", SOURCE_PATHS.assessmentBundledSeeds, "canonical"],
      ["japango-assessment-scoring-model", "JapanGo assessment scoring model", SOURCE_PATHS.assessmentScoringModel, "canonical"],
      ["japango-assessment-readiness-model", "JapanGo readiness model", SOURCE_PATHS.assessmentReadinessModel, "canonical"],
      ["japango-assessment-editorial-decisions", "JapanGo assessment editorial decisions", SOURCE_PATHS.assessmentEditorialDecisions, "supplemental"],
      ["japango-assessment-n5-grammar-bridge", "JapanGo audited N5 grammar assessment bridge", SOURCE_PATHS.assessmentN5GrammarBridge, "canonical"],
      ["japango-phase9-reference-manifest", "JapanGo Phase 9 curriculum audit reference manifest", SOURCE_PATHS.phase9ReferenceManifest, "curriculum-reference"],
      ["japango-phase9-n4-kanji-expansion", "JapanGo Phase 9 N4 kanji audit candidates", SOURCE_PATHS.phase9KanjiExpansion, "curriculum-reference"],
      ["japango-phase9-editorial-decisions", "JapanGo Phase 9 editorial decisions", SOURCE_PATHS.phase9EditorialDecisions, "supplemental"],
      ["japango-phase96-kanji-support", "JapanGo Phase 9.6 narrow N4 kanji support corpus", SOURCE_PATHS.phase96KanjiSupport, "canonical"],
      ["japango-phase96-kanji-vocabulary-support", "JapanGo Phase 9.6 narrow N4 kanji vocabulary support", SOURCE_PATHS.phase96KanjiVocabularySupport, "canonical"],
      ["japango-phase10-vocabulary-expansion", "JapanGo Phase 10 curated vocabulary expansion", SOURCE_PATHS.phase10VocabularyExpansion, "canonical"],
      ["jisho-vocabulary-reference", "Jisho vocabulary comparison reference", SOURCE_PATHS.phase10VocabularyExpansion, "curriculum-reference"],
      ["tanos-vocabulary-reference", "Tanos JLPT vocabulary comparison reference", SOURCE_PATHS.phase10VocabularyExpansion, "curriculum-reference"],
      ["japango-n5-grammar-question-corpus", "JapanGo original N5 grammar question corpus", SOURCE_PATHS.n5GrammarQuestionCorpus, "canonical"],
    ] as const).map<RegistrySeed>(([id, displayName, absolutePath, role]) => ({
      id,
      displayName,
      localPath: relativePosix(PROJECT_ROOT, absolutePath),
      absolutePath,
      format: "UTF-8 JSON",
      version: "1",
      licence: role === "canonical" ? "Original JapanGo content and metadata" : "Original JapanGo editorial metadata",
      attributionText: `${displayName}; original JapanGo JLPT-aligned material and metadata.`,
      redistributionNotes: "Original JapanGo material; not official JLPT content.",
      role,
    })),
    ...TEXTBOOKS.map<RegistrySeed>((book) => {
      const absolutePath = path.join(SOURCE_ROOT, book.fileName);
      const isGenki = book.fileName.startsWith("genki-");
      const hasDetected1998Publication = [
        "minna-no-nihongo-1-grammer.pdf",
        "minna-no-nihongo-2-grammer.pdf",
        "minna-no-nihongo-2-textbook.pdf",
      ].includes(book.fileName);
      return {
        id: textbookId(book.displayName),
        displayName: book.displayName,
        localPath: relativePosix(PROJECT_ROOT, absolutePath),
        absolutePath,
        format: "image-only PDF",
        version: isGenki
          ? "Third Edition"
          : hasDetected1998Publication
            ? "First published 1998; numbered edition not detected"
            : null,
        licence: "Copyrighted textbook; private curriculum reference only",
        attributionText: `${book.displayName}; locally supplied private reference copy.`,
        redistributionNotes:
          "Never redistribute the PDF, OCR text, explanations, dialogues, exercises, answer keys, examples, transcripts, or illustrations.",
        role: "curriculum-reference",
      };
    }),
  ];

  const output: SourceRegistryEntry[] = [];
  for (const seed of seeds) {
    const { absolutePath, ...entry } = seed;
    output.push({
      ...entry,
      parserVersion: PIPELINE_VERSION,
      checksum: await checksumPath(absolutePath),
    });
  }
  output.sort((left, right) => left.id.localeCompare(right.id));
  await writeJson(path.join(OUTPUT_ROOT, "source-registry.json"), output);
  return output;
}
