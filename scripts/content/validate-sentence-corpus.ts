import path from "node:path";

import { isDirectExecution, runCli } from "./lib/cli";
import { readJson } from "./lib/fs-utils";
import { loadSentenceCorpus } from "./sentence-corpus";
import type { CurriculumUnit, GrammarRecord, VocabularyRecord } from "./schemas/content-schemas";

export async function validateSentenceCorpus(): Promise<void> {
  const [n5Grammar, n4Grammar, n5Units, n4Units, n5Vocabulary, n4Vocabulary] = await Promise.all([
    readJson<GrammarRecord[]>(path.join("assets/generated-content/grammar/n5.json")),
    readJson<GrammarRecord[]>(path.join("assets/generated-content/grammar/n4.json")),
    readJson<CurriculumUnit[]>(path.join("assets/generated-content/curriculum/units-n5.json")),
    readJson<CurriculumUnit[]>(path.join("assets/generated-content/curriculum/units-n4.json")),
    readJson<VocabularyRecord[]>(path.join("assets/generated-content/vocabulary/n5.json")),
    readJson<VocabularyRecord[]>(path.join("assets/generated-content/vocabulary/n4.json")),
  ]);
  const content = await loadSentenceCorpus({
    grammar: [...n5Grammar, ...n4Grammar],
    curriculumUnits: [...n5Units, ...n4Units],
    vocabulary: [...n5Vocabulary, ...n4Vocabulary],
  });
  console.log(
    `Sentence corpus validation passed: ${content.sentences.length} sentences and ${content.grammarExampleViews.length} grammar relationships.`,
  );
}

if (isDirectExecution(import.meta.url)) {
  runCli(validateSentenceCorpus);
}
