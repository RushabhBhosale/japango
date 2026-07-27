import { buildContent } from "./build-content";
import { isDirectExecution, runCli } from "./lib/cli";
import { listeningCorpusErrors } from "./listening-question-corpus";

export async function validateListeningQuestionCorpus(): Promise<void> {
  const bundle = await buildContent();
  const errors = listeningCorpusErrors(bundle.learningContent, {
    grammar: [...bundle.grammar.n5, ...bundle.grammar.n4],
    vocabulary: [...bundle.vocabulary.n5, ...bundle.vocabulary.n4, ...bundle.vocabulary.supplemental],
    kanji: [...bundle.kanji.n5, ...bundle.kanji.n4],
    curriculumUnits: [...bundle.curriculum.n5, ...bundle.curriculum.n4],
  });
  if (errors.length > 0) throw new Error(`Phase 7 listening validation failed:\n${errors.join("\n")}`);
  const activities = bundle.learningContent.listeningActivities;
  const questions = bundle.learningContent.questions.filter(({ domain }) => domain === "listening");
  console.log(`Phase 7 listening validation passed: ${activities.length} activities, ${questions.length} questions.`);
}

if (isDirectExecution(import.meta.url)) runCli(validateListeningQuestionCorpus);
