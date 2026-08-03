import path from 'node:path';

import { ingestJapaneseOcr } from '../src/japanese-retrieval/ingestion';

interface CliOptions {
  dryRun: boolean;
  force: boolean;
  sourceDirectory: string;
}

function parseOptions(arguments_: string[]): CliOptions {
  const sourceIndex = arguments_.indexOf('--source');
  const sourceOverride = sourceIndex >= 0 ? arguments_[sourceIndex + 1] : undefined;
  return {
    dryRun: arguments_.includes('--dry-run'),
    force: arguments_.includes('--force'),
    sourceDirectory: sourceOverride
      ? path.resolve(process.cwd(), sourceOverride)
      : path.resolve(import.meta.dirname, '../../assets/docs-reference/japango-ocr'),
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const summary = await ingestJapaneseOcr({
    ...options,
    rejectedLogPath: path.resolve(import.meta.dirname, '../../.cache/japango-content/japanese-ocr-rejected.jsonl'),
    log: (message) => process.stdout.write(`${message}\n`),
  });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown OCR ingestion failure.';
  process.stderr.write(`OCR ingestion failed: ${message}\n`);
  process.exitCode = 1;
});
