import { describe, expect, it } from 'vitest';

import { extractSourceQuestion } from './source-extractor';

describe('OCR source extraction', () => {
  it('preserves source transcription and marks uncertain OCR', () => {
    const content = 'N5\n言語知識（文字・語彙）\nもんだい 1\n1 学校';
    const result = extractSourceQuestion({ id: 'chunk-1', sourcePath: 'n5-page.md', content });
    expect(result).toMatchObject({ sourceTranscription: content, level: 'N5', section: 'vocabulary_kanji', questionNumber: '1', sourceQuality: 'verified' });
  });

  it('does not silently accept a corrupted source', () => {
    const result = extractSourceQuestion({ id: 'chunk-2', sourcePath: 'n4-page.md', content: 'N4\n問題 2\n[UNREADABLE TEXT]' });
    expect(result?.sourceQuality).toBe('needs_review');
    expect(result?.warnings).toContain('structural-ocr-corruption');
  });
});
