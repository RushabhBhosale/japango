import { buildContent } from "./build-content";
import { isDirectExecution, runCli } from "./lib/cli";
import { readingCorpusErrors } from "./reading-question-corpus";

export async function validateReadingQuestionCorpus(): Promise<void> {
  const bundle = await buildContent();
  const errors = readingCorpusErrors(bundle.learningContent, {
    grammar: [...bundle.grammar.n5, ...bundle.grammar.n4],
    vocabulary: [...bundle.vocabulary.n5, ...bundle.vocabulary.n4, ...bundle.vocabulary.supplemental],
    kanji: [...bundle.kanji.n5, ...bundle.kanji.n4],
    curriculumUnits: [...bundle.curriculum.n5, ...bundle.curriculum.n4],
  });
  if (errors.length > 0) throw new Error(`Phase 6 reading validation failed:\n${errors.join("\n")}`);
  const passages = bundle.learningContent.readingPassages;
  const questions = bundle.learningContent.questions.filter(({ domain }) => domain === "reading");
  console.log(`Phase 6 reading validation passed: ${passages.length} passages, ${questions.length} questions.`);
}

if (isDirectExecution(import.meta.url)) runCli(validateReadingQuestionCorpus);
