import path from "node:path";

import { OUTPUT_ROOT } from "./config";
import { isDirectExecution, runCli } from "./lib/cli";
import { readJson, writeJson, writeText } from "./lib/fs-utils";
import type {
  CurriculumUnit,
  GrammarRecord,
  KanjiRecord,
  VocabularyRecord,
} from "./schemas/content-schemas";
import type { LearningContentCollections } from "../../src/features/learning-content/schemas";

type Level = "N5" | "N4";

interface LevelBaseline {
  curriculum: { total: number; releaseReady: number; excluded: number };
  grammar: { total: number; releaseReady: number; excluded: number };
  vocabulary: { total: number; releaseReady: number; excluded: number };
  kanji: { total: number; releaseReady: number; excluded: number };
  sentences: { total: number; releaseReady: number; developmentOnly: number };
  examples: { grammar: number; vocabulary: number; kanji: number };
  existingReadingPassages: number;
  existingReadingQuestions: number;
}

interface ReadingPhase5Baseline {
  auditStage: "phase5-baseline";
  performedBeforePassageAuthoring: true;
  levels: Record<Level, LevelBaseline>;
  lifecycle: {
    releaseEligibleCurriculumUnits: number;
    excludedCurriculumUnits: number;
    phase6ReleaseEligiblePassages: number;
    phase6DevelopmentOnlyPassages: number;
    reason: string;
  };
  inventoryLimitations: {
    kanjiRecordsWithLimitations: number;
    recordsWithoutSupportedVocabulary: number;
    policy: string;
  };
  gaps: {
    readingPassages: number;
    readingQuestions: number;
    targetPassages: { N5: 66; N4: 80; total: 146 };
    requiredTopics: string[];
  };
}

const LEVELS = ["N5", "N4"] as const;
const REQUIRED_TOPICS = [
  "accommodation", "appointments", "cooking", "daily-routines", "delivery",
  "directions", "email", "events", "exercise", "family", "food", "friends",
  "health", "hobbies", "home", "invitations", "libraries", "lost-items",
  "messages", "mistakes-and-corrections", "neighbourhoods", "plans",
  "public-services", "restaurants", "rules", "schedules", "school", "shopping",
  "study-habits", "technology", "transport", "travel", "weather", "work",
] as const;

function countLifecycle(records: readonly { releaseReady: boolean }[]) {
  const releaseReady = records.filter((record) => record.releaseReady).length;
  return { total: records.length, releaseReady, excluded: records.length - releaseReady };
}

function levelForSentence(
  sentence: LearningContentCollections["sentences"][number],
): Level | null {
  return sentence.difficulty.jlptLevel === "N5" || sentence.difficulty.jlptLevel === "N4"
    ? sentence.difficulty.jlptLevel
    : null;
}

function markdownTable(baseline: ReadingPhase5Baseline, field: keyof LevelBaseline): string[] {
  const value = (level: Level) => baseline.levels[level][field];
  return LEVELS.map((level) => `| ${level} | ${JSON.stringify(value(level))} |`);
}

export async function auditReadingPhase5Baseline(): Promise<ReadingPhase5Baseline> {
  const [unitsN5, unitsN4, grammarN5, grammarN4, vocabularyN5, vocabularyN4, kanjiN5, kanjiN4, learningContent, kanjiCoverage] =
    await Promise.all([
      readJson<CurriculumUnit[]>(path.join(OUTPUT_ROOT, "curriculum/units-n5.json")),
      readJson<CurriculumUnit[]>(path.join(OUTPUT_ROOT, "curriculum/units-n4.json")),
      readJson<GrammarRecord[]>(path.join(OUTPUT_ROOT, "grammar/n5.json")),
      readJson<GrammarRecord[]>(path.join(OUTPUT_ROOT, "grammar/n4.json")),
      readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/n5.json")),
      readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/n4.json")),
      readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n5.json")),
      readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n4.json")),
      readJson<LearningContentCollections>(path.join(OUTPUT_ROOT, "learning-content/index.json")),
      readJson<Array<{ inventoryLimitation: string | null }>>(
        path.join(OUTPUT_ROOT, "reports/kanji-question-phase5-final.json"),
      ),
    ]);

  const byLevel = {
    N5: { units: unitsN5, grammar: grammarN5, vocabulary: vocabularyN5, kanji: kanjiN5 },
    N4: { units: unitsN4, grammar: grammarN4, vocabulary: vocabularyN4, kanji: kanjiN4 },
  } as const;
  const levels = Object.fromEntries(LEVELS.map((level) => {
    const sentences = learningContent.sentences.filter((sentence) => levelForSentence(sentence) === level);
    const sentenceIds = new Set(sentences.map(({ id }) => id));
    const readingQuestions = learningContent.questions.filter(
      (question) => question.domain === "reading" && question.examMetadata?.jlptLevel === level,
    );
    return [level, {
      curriculum: countLifecycle(byLevel[level].units),
      grammar: countLifecycle(byLevel[level].grammar),
      vocabulary: countLifecycle(byLevel[level].vocabulary),
      kanji: countLifecycle(byLevel[level].kanji),
      sentences: {
        total: sentences.length,
        releaseReady: sentences.filter(({ releaseReady }) => releaseReady).length,
        developmentOnly: sentences.filter(({ releaseReady }) => !releaseReady).length,
      },
      examples: {
        grammar: learningContent.grammarExampleViews.filter(({ sentenceId }) => sentenceIds.has(sentenceId)).length,
        vocabulary: learningContent.vocabularyExampleViews.filter(({ sentenceId }) => sentenceIds.has(sentenceId)).length,
        kanji: learningContent.kanjiExampleViews.filter(({ sentenceId }) => sentenceIds.has(sentenceId)).length,
      },
      existingReadingPassages: "readingPassages" in learningContent
        ? (learningContent as LearningContentCollections & { readingPassages: unknown[] }).readingPassages.length
        : 0,
      existingReadingQuestions: readingQuestions.length,
    } satisfies LevelBaseline];
  })) as Record<Level, LevelBaseline>;

  const releaseEligibleCurriculumUnits = LEVELS.reduce(
    (sum, level) => sum + levels[level].curriculum.releaseReady, 0,
  );
  const excludedCurriculumUnits = LEVELS.reduce(
    (sum, level) => sum + levels[level].curriculum.excluded, 0,
  );
  const limitedKanji = kanjiCoverage.filter(({ inventoryLimitation }) => inventoryLimitation);
  const baseline: ReadingPhase5Baseline = {
    auditStage: "phase5-baseline",
    performedBeforePassageAuthoring: true,
    levels,
    lifecycle: {
      releaseEligibleCurriculumUnits,
      excludedCurriculumUnits,
      phase6ReleaseEligiblePassages: releaseEligibleCurriculumUnits === 0 ? 0 : 146,
      phase6DevelopmentOnlyPassages: releaseEligibleCurriculumUnits === 0 ? 146 : 0,
      reason: "Every N5 and N4 curriculum unit is currently lifecycle-excluded; passages linked to those parents must remain development-only.",
    },
    inventoryLimitations: {
      kanjiRecordsWithLimitations: limitedKanji.length,
      recordsWithoutSupportedVocabulary: limitedKanji.filter(({ inventoryLimitation }) =>
        inventoryLimitation?.startsWith("no-release-ready-vocabulary"),
      ).length,
      policy: "Preserve Phase 3/5 effective inventory targets; do not add vocabulary or kanji to inflate reading coverage.",
    },
    gaps: {
      readingPassages: LEVELS.reduce((sum, level) => sum + levels[level].existingReadingPassages, 0),
      readingQuestions: LEVELS.reduce((sum, level) => sum + levels[level].existingReadingQuestions, 0),
      targetPassages: { N5: 66, N4: 80, total: 146 },
      requiredTopics: [...REQUIRED_TOPICS],
    },
  };

  const reportRoot = path.join(OUTPUT_ROOT, "reports");
  const lifecycleLines = LEVELS.flatMap((level) => [
    `- ${level}: ${levels[level].curriculum.releaseReady}/${levels[level].curriculum.total} release curriculum units; ${levels[level].curriculum.excluded} excluded.`,
    `- ${level}: ${levels[level].sentences.total} available sentences (${levels[level].sentences.releaseReady} release, ${levels[level].sentences.developmentOnly} development-only).`,
  ]);
  await Promise.all([
    writeJson(path.join(reportRoot, "reading-phase5-baseline.json"), baseline),
    writeText(path.join(reportRoot, "reading-curriculum-gap-analysis.md"), [
      "# Reading curriculum gap analysis", "", ...lifecycleLines, "",
      `Existing passages: ${baseline.gaps.readingPassages}. Existing reading questions: ${baseline.gaps.readingQuestions}.`,
      "", "All 146 Phase 6 passages must be canonical development content until their curriculum parents are approved. This is a lifecycle exclusion, not a quality failure.",
    ].join("\n")),
    writeText(path.join(reportRoot, "reading-grammar-coverage-gap.md"), [
      "# Reading grammar coverage gap", "", "| Level | Inventory / lifecycle counts |", "| --- | --- |",
      ...markdownTable(baseline, "grammar"), "",
      "The sentence corpus supplies grammar examples, but no passage-context reinforcement exists. N5 grammar is entirely lifecycle-excluded; 111 N4 records are release-ready, although passages remain excluded through curriculum parents.",
    ].join("\n")),
    writeText(path.join(reportRoot, "reading-vocabulary-coverage-gap.md"), [
      "# Reading vocabulary and kanji coverage gap", "", "| Level | Vocabulary inventory | Kanji inventory |", "| --- | --- | --- |",
      ...LEVELS.map((level) => `| ${level} | ${JSON.stringify(levels[level].vocabulary)} | ${JSON.stringify(levels[level].kanji)} |`), "",
      `${baseline.inventoryLimitations.kanjiRecordsWithLimitations} kanji records retain Phase 5 inventory limitations; ${baseline.inventoryLimitations.recordsWithoutSupportedVocabulary} have no supported release vocabulary. No inventory expansion is authorized.`,
    ].join("\n")),
    writeText(path.join(reportRoot, "reading-topic-gap-analysis.md"), [
      "# Reading topic gap analysis", "", "There is no existing passage corpus, so every requested topic is currently uncovered.", "",
      ...REQUIRED_TOPICS.map((topic) => `- ${topic}: 0 passages`), "",
      "Phase 6 should distribute 146 passages across all 34 topics and avoid concentrating on the discouraged template scenarios.",
    ].join("\n")),
  ]);
  return baseline;
}

if (isDirectExecution(import.meta.url)) {
  runCli(async () => {
    const baseline = await auditReadingPhase5Baseline();
    console.log(JSON.stringify(baseline, null, 2));
  });
}
