import path from "node:path";

import { learningContentCollectionsSchema } from "../../src/features/learning-content/schemas";
import { OUTPUT_ROOT } from "./config";
import { isDirectExecution, runCli } from "./lib/cli";
import { readJson } from "./lib/fs-utils";
import type { KanjiRecord, VocabularyRecord } from "./schemas/content-schemas";
import { vocabularyKanjiQuestionErrors } from "./vocabulary-kanji-question-corpus";

export async function validateVocabularyKanjiQuestionCorpus(): Promise<void> {
  const [contentRaw, n5Vocabulary, n4Vocabulary, supplemental, n5Kanji, n4Kanji] = await Promise.all([
    readJson<unknown>(path.join(OUTPUT_ROOT, "learning-content/index.json")),
    readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/n5.json")),
    readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/n4.json")),
    readJson<VocabularyRecord[]>(path.join(OUTPUT_ROOT, "vocabulary/supplemental.json")),
    readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n5.json")),
    readJson<KanjiRecord[]>(path.join(OUTPUT_ROOT, "kanji/n4.json")),
  ]);
  const content = learningContentCollectionsSchema.parse(contentRaw);
  const errors = vocabularyKanjiQuestionErrors(
    content,
    [...n5Vocabulary, ...n4Vocabulary, ...supplemental],
    [...n5Kanji, ...n4Kanji],
  );
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const vocabularyQuestions = content.questions.filter(({ domain }) => domain === "vocabulary").length;
  const kanjiQuestions = content.questions.filter(({ domain }) => domain === "kanji").length;
  console.log(`Vocabulary/kanji question validation passed: ${vocabularyQuestions} vocabulary questions, ${kanjiQuestions} kanji questions, 0 errors.`);
}

if (isDirectExecution(import.meta.url)) runCli(validateVocabularyKanjiQuestionCorpus);
