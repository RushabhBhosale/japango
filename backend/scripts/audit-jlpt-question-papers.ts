import path from 'node:path';

import { auditJlptQuestionPaperCorpus } from '../src/lessons-v2/question-papers/corpus-audit';

async function main(): Promise<void> {
  const sourceDirectory = path.resolve(import.meta.dirname, '../../assets/docs-reference/japango-ocr');
  const audit = await auditJlptQuestionPaperCorpus(sourceDirectory);
  process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`JLPT corpus audit failed: ${error instanceof Error ? error.message : 'Unknown error.'}\n`);
  process.exitCode = 1;
});
