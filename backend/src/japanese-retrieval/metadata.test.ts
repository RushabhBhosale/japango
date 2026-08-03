import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { inferJapaneseOcrMetadata } from './metadata';

const root = path.resolve('/tmp/japango-ocr');

describe('inferJapaneseOcrMetadata', () => {
  it('infers Minna textbook metadata from a page filename', () => {
    expect(inferJapaneseOcrMetadata(
      root,
      path.join(root, 'minna-2-pages/minna-no-nihongo-2-textbook_page-100.md'),
    )).toEqual({
      sourcePath: 'minna-2-pages/minna-no-nihongo-2-textbook_page-100.md',
      filename: 'minna-no-nihongo-2-textbook_page-100.md',
      book: 'Minna no Nihongo',
      volume: 'II',
      sourceType: 'textbook',
      pageNumber: 100,
    });
  });

  it('infers Genki volume and the first page of a batch', () => {
    expect(inferJapaneseOcrMetadata(
      root,
      path.join(root, 'genki1/genki-1-ocr-pages-031-040.md'),
    )).toMatchObject({
      book: 'Genki',
      volume: 'I',
      sourceType: 'textbook',
      pageNumber: 31,
    });
  });

  it('accepts the historical grammer filename spelling', () => {
    expect(inferJapaneseOcrMetadata(
      root,
      path.join(root, 'minna-1-pages/minna-no-nihongo-1-grammer_page-100.md'),
    )).toMatchObject({ sourceType: 'grammar', volume: 'I', pageNumber: 100 });
  });
});
