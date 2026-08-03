import { japaneseSearchRequestSchema, searchJapaneseOcr } from '../src/japanese-retrieval/search';

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(' ').trim();
  const request = japaneseSearchRequestSchema.parse({ query });
  const results = await searchJapaneseOcr(request);
  process.stdout.write(`${JSON.stringify({ success: true, data: { results } }, null, 2)}\n`);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown Japanese search failure.';
  process.stderr.write(`Japanese retrieval test failed: ${message}\n`);
  process.exitCode = 1;
});
