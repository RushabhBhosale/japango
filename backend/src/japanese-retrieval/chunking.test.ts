import { describe, expect, it } from 'vitest';

import {
  FALLBACK_CHUNK_MAX_CHARACTERS,
  FALLBACK_CHUNK_OVERLAP_CHARACTERS,
  chunkJapaneseOcrMarkdown,
} from './chunking';

describe('chunkJapaneseOcrMarkdown', () => {
  it('keeps Japanese text unchanged and assigns page metadata from a Markdown heading', () => {
    const markdown = '## PDF Page 40\n\n### 文法\n\nこれは日本語の説明です。\n';

    expect(chunkJapaneseOcrMarkdown(markdown, 1)).toEqual([
      {
        chunkIndex: 0,
        content: markdown,
        headingPath: ['PDF Page 40', '文法'],
        pageNumber: 40,
      },
    ]);
  });

  it('uses exact 150-character overlap for fallback chunks', () => {
    const firstParagraph = `# Page 12\n\n${'あ'.repeat(900)}\n\n`;
    const secondParagraph = `${'い'.repeat(900)}\n`;
    const chunks = chunkJapaneseOcrMarkdown(firstParagraph + secondParagraph, 12);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].content.length).toBeLessThanOrEqual(FALLBACK_CHUNK_MAX_CHARACTERS);
    expect(chunks[1].content.startsWith(
      chunks[0].content.slice(-FALLBACK_CHUNK_OVERLAP_CHARACTERS),
    )).toBe(true);
  });

  it('does not split a Markdown table or dialogue block', () => {
    const table = '| Japanese | Meaning |\n| --- | --- |\n| 食べる | to eat |\n';
    const dialogue = 'A: 食べますか。\nB: はい、食べます。\n';
    const chunks = chunkJapaneseOcrMarkdown(`# Examples\n\n${table}\n${dialogue}`, null);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain(table);
    expect(chunks[0].content).toContain(dialogue);
  });
});
