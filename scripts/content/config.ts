import path from "node:path";

export const PIPELINE_VERSION = "7.0.0";
export const CONTENT_SCHEMA_VERSION = "2.2.0";

export const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
export const SOURCE_ROOT = path.join(PROJECT_ROOT, "assets/docs-reference");
export const OUTPUT_ROOT = path.join(PROJECT_ROOT, "assets/generated-content");
export const COMPACT_OUTPUT_ROOT = path.join(
  PROJECT_ROOT,
  "assets/generated-content-compact",
);
export const CACHE_ROOT = path.join(PROJECT_ROOT, ".cache/japango-content");
export const OCR_CACHE_ROOT = path.join(CACHE_ROOT, "ocr");

export const SOURCE_PATHS = {
  jmdict: path.join(SOURCE_ROOT, "JMdict_english_with_examples"),
  kanjidic: path.join(SOURCE_ROOT, "kanjidic2.xml"),
  kanjivg: path.join(SOURCE_ROOT, "kanjivg"),
  jlptVocabulary: path.join(SOURCE_ROOT, "jlpt_vocab.csv"),
  jlptKanji: path.join(
    SOURCE_ROOT,
    "jlpt_kanji_json_msgpack-main/kanji_jlpt_only.json",
  ),
  grammar: path.join(
    SOURCE_ROOT,
    "Kotoba_Brew_JLPT_Grammar_Tracker.xlsx - N5.csv",
  ),
  reviewedN4Grammar: path.join(
    SOURCE_ROOT,
    "japango-n4-grammar-reviewed.json",
  ),
  n4GrammarEditorialDecisions: path.join(
    SOURCE_ROOT,
    "japango-n4-grammar-editorial-decisions.json",
  ),
  sentenceCorpusN5: path.join(
    SOURCE_ROOT,
    "japango-sentences/sentence-corpus-n5.json",
  ),
  sentenceCorpusN4: path.join(
    SOURCE_ROOT,
    "japango-sentences/sentence-corpus-n4.json",
  ),
  sentenceEditorialDecisions: path.join(
    SOURCE_ROOT,
    "japango-sentences/sentence-editorial-decisions.json",
  ),
  grammarQuestionCorpus: path.join(
    SOURCE_ROOT,
    "japango-questions/grammar-question-corpus.json",
  ),
  vocabularyQuestionCorpus: path.join(
    SOURCE_ROOT,
    "japango-questions/vocabulary-question-corpus.json",
  ),
  kanjiQuestionCorpus: path.join(
    SOURCE_ROOT,
    "japango-questions/kanji-question-corpus.json",
  ),
  readingPassageCorpusN5: path.join(
    SOURCE_ROOT,
    "japango-reading/reading-passage-corpus-n5.json",
  ),
  readingPassageCorpusN4: path.join(
    SOURCE_ROOT,
    "japango-reading/reading-passage-corpus-n4.json",
  ),
  readingQuestionCorpus: path.join(
    SOURCE_ROOT,
    "japango-reading/reading-question-corpus.json",
  ),
  readingEditorialDecisions: path.join(
    SOURCE_ROOT,
    "japango-reading/reading-editorial-decisions.json",
  ),
  listeningActivityCorpusN5: path.join(SOURCE_ROOT, "japango-listening/listening-activity-corpus-n5.json"),
  listeningActivityCorpusN4: path.join(SOURCE_ROOT, "japango-listening/listening-activity-corpus-n4.json"),
  listeningQuestionCorpus: path.join(SOURCE_ROOT, "japango-listening/listening-question-corpus.json"),
  listeningSpeakerCorpus: path.join(SOURCE_ROOT, "japango-listening/listening-speaker-corpus.json"),
  listeningEditorialDecisions: path.join(SOURCE_ROOT, "japango-listening/listening-editorial-decisions.json"),
  assessmentBlueprints: path.join(SOURCE_ROOT, "japango-assessments/assessment-blueprints.json"),
  assessmentPresets: path.join(SOURCE_ROOT, "japango-assessments/assessment-presets.json"),
  assessmentBundledSeeds: path.join(SOURCE_ROOT, "japango-assessments/bundled-mock-exam-seeds.json"),
  assessmentScoringModel: path.join(SOURCE_ROOT, "japango-assessments/scoring-model.json"),
  assessmentReadinessModel: path.join(SOURCE_ROOT, "japango-assessments/readiness-model.json"),
  assessmentEditorialDecisions: path.join(SOURCE_ROOT, "japango-assessments/assessment-editorial-decisions.json"),
  assessmentN5GrammarBridge: path.join(SOURCE_ROOT, "japango-assessments/n5-grammar-bridge-questions.json"),
  phase9ReferenceManifest: path.join(SOURCE_ROOT, "japango-phase9/curriculum-reference-manifest.json"),
  phase9KanjiExpansion: path.join(SOURCE_ROOT, "japango-phase9/n4-kanji-expansion.json"),
  phase9EditorialDecisions: path.join(SOURCE_ROOT, "japango-phase9/editorial-decisions.json"),
  phase96KanjiSupport: path.join(SOURCE_ROOT, "japango-phase9/phase96-kanji-support.json"),
  phase96KanjiVocabularySupport: path.join(SOURCE_ROOT, "japango-phase9/phase96-kanji-vocabulary-support.json"),
  phase10VocabularyExpansion: path.join(
    SOURCE_ROOT,
    "japango-phase10/vocabulary-expansion.json",
  ),
  phase3InitialLearningRelease: path.join(
    SOURCE_ROOT,
    "japango-phase3/initial-learning-release.json",
  ),
  n5GrammarQuestionCorpus: path.join(SOURCE_ROOT, "japango-questions/n5-grammar-question-corpus.json"),
} as const;

export const TEXTBOOKS = [
  { fileName: "genki-1.pdf", displayName: "Genki I" },
  { fileName: "genki-2.pdf", displayName: "Genki II" },
  {
    fileName: "minna-no-nihongo-1-grammer.pdf",
    displayName: "Minna no Nihongo I Grammar",
  },
  {
    fileName: "minna-no-nihongo-1-textbook.pdf",
    displayName: "Minna no Nihongo I",
  },
  {
    fileName: "minna-no-nihongo-2-grammer.pdf",
    displayName: "Minna no Nihongo II Grammar",
  },
  {
    fileName: "minna-no-nihongo-2-textbook.pdf",
    displayName: "Minna no Nihongo II",
  },
] as const;

export const REQUIRED_OUTPUT_DIRECTORIES = [
  "vocabulary",
  "kanji",
  "grammar",
  "curriculum",
  "learning-content",
  "sentences",
  "examples",
  "questions",
  "reading",
  "listening",
  "assessments",
  "reports",
  "review-queues",
] as const;
