import path from "node:path";

import { learningContentCollectionsSchema } from "../../src/features/learning-content/schemas";
import { OUTPUT_ROOT } from "./config";
import { grammarQuestionErrors } from "./grammar-question-corpus";
import { isDirectExecution, runCli } from "./lib/cli";
import { readJson } from "./lib/fs-utils";
import type { CurriculumUnit, GrammarRecord } from "./schemas/content-schemas";

export async function validateGrammarQuestionCorpus(): Promise<void> {
  const [contentRaw, n5Grammar, n4Grammar, n5Units, n4Units] = await Promise.all([
    readJson<unknown>(path.join(OUTPUT_ROOT, "learning-content/index.json")),
    readJson<GrammarRecord[]>(path.join(OUTPUT_ROOT, "grammar/n5.json")),
    readJson<GrammarRecord[]>(path.join(OUTPUT_ROOT, "grammar/n4.json")),
    readJson<CurriculumUnit[]>(path.join(OUTPUT_ROOT, "curriculum/units-n5.json")),
    readJson<CurriculumUnit[]>(path.join(OUTPUT_ROOT, "curriculum/units-n4.json")),
  ]);
  const content = learningContentCollectionsSchema.parse(contentRaw);
  const errors = grammarQuestionErrors(
    content,
    [...n5Grammar, ...n4Grammar],
    [...n5Units, ...n4Units],
  );
  if (errors.length > 0) throw new Error(errors.join("\n"));
  const grammarQuestionIds = new Set(
    content.questions.filter(({ domain }) => domain === "grammar").map(({ id }) => id),
  );
  console.log(
    `Grammar question validation passed: ${grammarQuestionIds.size} questions, ${content.questionOptions.filter(({ questionId }) => grammarQuestionIds.has(questionId)).length} options, 0 errors.`,
  );
}

if (isDirectExecution(import.meta.url)) runCli(validateGrammarQuestionCorpus);
