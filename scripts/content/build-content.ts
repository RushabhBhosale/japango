import { analyzeN4Grammar } from "./analyze-n4-grammar";
import { analyzeTextbookConflicts } from "./analyze-textbook-conflicts";
import { buildCurriculum } from "./build-curriculum";
import { extractTextbookCurriculum } from "./extract-textbook-curriculum";
import { generateCurriculumCleanupReports } from "./generate-curriculum-cleanup-reports";
import { generateGrammarQuestionReports } from "./generate-grammar-question-reports";
import { generateManifest } from "./generate-manifest";
import { generateN4GrammarCurationReport } from "./generate-n4-grammar-curation-report";
import { generateSentenceReports } from "./generate-sentence-reports";
import { generateVocabularyKanjiQuestionReports } from "./generate-vocabulary-kanji-question-reports";
import { generateReadingReports } from "./generate-reading-reports";
import { generateListeningReports } from "./generate-listening-reports";
import { generateAssessmentReports } from "./generate-assessment-reports";
import { loadGrammarQuestionCorpus } from "./grammar-question-corpus";
import {
  generateReports,
  unresolvedCounts,
  type ReportArtifacts,
} from "./generate-reports";
import { inspectSources } from "./inspect-sources";
import { isDirectExecution, runCli } from "./lib/cli";
import { mergeContent } from "./merge-content";
import { buildSourceRegistry } from "./source-registry";
import { loadSentenceCorpus } from "./sentence-corpus";
import {
  validateContentBundle,
  type ContentBundle,
} from "./validate-content";
import { loadVocabularyKanjiQuestionCorpora } from "./vocabulary-kanji-question-corpus";
import { loadReadingQuestionCorpus } from "./reading-question-corpus";
import { loadListeningQuestionCorpus } from "./listening-question-corpus";
import { writeContentOutputs } from "./write-outputs";
import { writeCompactOutputs } from "./write-compact-outputs";
import { loadAssessmentContent } from "./assessment-content";
import { contentVersionForSources } from "./content-version";

export async function buildContent(): Promise<ContentBundle> {
  console.log("[content 1/12] Inspecting sources");
  await inspectSources();

  console.log("[content 2/12] Building source registry and checksums");
  const sourceRegistry = await buildSourceRegistry();

  console.log("[content 3/12] Parsing, normalizing, and matching canonical sources");
  const merged = await mergeContent();

  console.log("[content 4/12] Reading cached OCR without reprocessing pages");
  const vocabularyRecords = [
    ...merged.vocabulary.n5,
    ...merged.vocabulary.n4,
    ...merged.vocabulary.supplemental,
  ];
  const kanjiRecords = [...merged.kanji.n5, ...merged.kanji.n4];
  const grammarRecords = [...merged.grammar.n5, ...merged.grammar.n4];
  const textbook = await extractTextbookCurriculum(
    vocabularyRecords,
    kanjiRecords,
    grammarRecords,
  );

  console.log("[content 5/12] Building deterministic curriculum staging");
  const curriculum = await buildCurriculum(
    merged.vocabulary,
    merged.kanji,
    merged.grammar,
    textbook.mappings,
  );
  console.log("[content 6/12] Loading canonical grammar sentence corpus");
  const sentenceContent = await loadSentenceCorpus({
    grammar: grammarRecords,
    curriculumUnits: [...curriculum.n5, ...curriculum.n4],
  });
  console.log("[content 6/12] Loading canonical grammar question corpus");
  const grammarQuestionContent = await loadGrammarQuestionCorpus(
    sentenceContent,
    grammarRecords,
    [...curriculum.n5, ...curriculum.n4],
  );
  console.log("[content 6/12] Loading canonical vocabulary and kanji question corpora");
  const phase5LearningContent = await loadVocabularyKanjiQuestionCorpora(
    grammarQuestionContent,
    vocabularyRecords,
    kanjiRecords,
  );
  console.log("[content 6/12] Loading canonical reading passage and question corpus");
  const phase6LearningContent = await loadReadingQuestionCorpus(phase5LearningContent, {
    grammar: grammarRecords,
    vocabulary: vocabularyRecords,
    kanji: kanjiRecords,
    curriculumUnits: [...curriculum.n5, ...curriculum.n4],
  });
  console.log("[content 6/12] Loading canonical listening activity and question corpus");
  const phase7LearningContent = await loadListeningQuestionCorpus(phase6LearningContent, {
    grammar: grammarRecords, vocabulary: vocabularyRecords, kanji: kanjiRecords,
    curriculumUnits: [...curriculum.n5, ...curriculum.n4],
  });
  console.log("[content 6/12] Loading deterministic assessment content and bundled mocks");
  const phase8 = await loadAssessmentContent(phase7LearningContent, contentVersionForSources(sourceRegistry), merged.grammar.n4.filter(({ needsReview }) => needsReview).map(({ id }) => id));
  const learningContent = phase8.learningContent;
  const bundle: ContentBundle = {
    vocabulary: {
      n5: merged.vocabulary.n5,
      n4: merged.vocabulary.n4,
      supplemental: merged.vocabulary.supplemental,
    },
    kanji: {
      n5: merged.kanji.n5,
      n4: merged.kanji.n4,
      components: merged.kanji.components,
    },
    grammar: { n5: merged.grammar.n5, n4: merged.grammar.n4 },
    curriculum,
    learningContent,
    assessments: phase8.assessments,
    textbookMap: textbook.mappings,
    sourceRegistry,
  };
  await writeContentOutputs(bundle);

  console.log("[content 7/12] Validating schemas and cross-references");
  const validation = await validateContentBundle(bundle);
  const reportArtifacts: ReportArtifacts = {
    vocabulary: merged.vocabulary,
    kanji: merged.kanji,
    grammar: merged.grammar,
    vocabularyMatches: merged.parsed.vocabularyMatches,
    ocrConflicts: textbook.conflicts,
    validation,
  };

  console.log("[content 8/12] Generating base audit and licence reports");
  await Promise.all([
    generateReports(bundle, reportArtifacts),
    generateN4GrammarCurationReport(bundle.grammar.n4, validation),
  ]);
  console.log("[content 9/12] Generating grammar, OCR, map, and coverage audits");
  await Promise.all([
    analyzeN4Grammar(),
    analyzeTextbookConflicts(textbook.conflicts),
    generateCurriculumCleanupReports(bundle),
  ]);
  if (validation.errors.length > 0) {
    throw new Error(
      `Content build stopped with ${validation.errors.length} validation error(s). See assets/generated-content/reports/validation-results.json.`,
    );
  }

  console.log("[content 10/12] Writing separated compact app outputs");
  await writeCompactOutputs(bundle);
  console.log("[content 11/12] Generating sentence corpus audits");
  await Promise.all([
    generateSentenceReports(bundle),
    generateGrammarQuestionReports(bundle),
    generateVocabularyKanjiQuestionReports(bundle),
    generateReadingReports(bundle),
    generateListeningReports(bundle),
    generateAssessmentReports(bundle),
  ]);
  console.log("[content 12/12] Writing content manifest");
  await generateManifest(bundle, unresolvedCounts(reportArtifacts));
  console.log(
    `Content build complete: ${bundle.vocabulary.n5.length} N5 / ${bundle.vocabulary.n4.length} N4 vocabulary, ${bundle.kanji.n5.length} N5 / ${bundle.kanji.n4.length} N4 kanji, ${bundle.grammar.n5.length} N5 / ${bundle.grammar.n4.length} N4 grammar.`,
  );
  return bundle;
}

if (isDirectExecution(import.meta.url)) {
  runCli(async () => {
    await buildContent();
  });
}
