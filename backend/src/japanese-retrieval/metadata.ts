import path from 'node:path';

import type { JapaneseOcrFileMetadata, JapaneseSourceType } from './types';

const volumeLabels: Record<string, string> = {
  '1': 'I',
  '2': 'II',
  '3': 'III',
};

function titleFromSlug(value: string): string {
  return value
    .split(/[-_]+/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function firstPageNumber(value: string): number | null {
  const pageMatch = value.match(/(?:^|[-_])page[-_]?0*(\d+)/iu)
    ?? value.match(/pages[-_]?0*(\d+)/iu)
    ?? value.match(/(?:^|[-_])p(?:age)?[-_]?0*(\d+)/iu);
  return pageMatch ? Number.parseInt(pageMatch[1], 10) : null;
}

function sourceTypeFor(value: string): JapaneseSourceType {
  if (/(?:grammar|grammer)/iu.test(value)) return 'grammar';
  if (/question[-_ ]?papers?/iu.test(value)) return 'question-paper';
  if (/workbooks?/iu.test(value)) return 'workbook';
  if (/(?:textbook|genki)/iu.test(value)) return 'textbook';
  return 'reference';
}

export function inferJapaneseOcrMetadata(
  rootDirectory: string,
  absolutePath: string,
): JapaneseOcrFileMetadata {
  const sourcePath = path.relative(rootDirectory, absolutePath).split(path.sep).join('/');
  const filename = path.basename(absolutePath);
  const normalized = sourcePath.toLocaleLowerCase('en-US');
  const minnaMatch = normalized.match(/minna[-_ ]no[-_ ]nihongo[-_ ]([12])/u);
  const genkiMatch = normalized.match(/genki[-_ ]?([12])/u);
  const jlptMatch = normalized.match(/jlpt[-_ ]?n?([1-5])/u);

  if (minnaMatch) {
    return {
      sourcePath,
      filename,
      book: 'Minna no Nihongo',
      volume: volumeLabels[minnaMatch[1]] ?? null,
      sourceType: sourceTypeFor(normalized),
      pageNumber: firstPageNumber(filename),
    };
  }

  if (genkiMatch) {
    return {
      sourcePath,
      filename,
      book: 'Genki',
      volume: volumeLabels[genkiMatch[1]] ?? null,
      sourceType: 'textbook',
      pageNumber: firstPageNumber(filename),
    };
  }

  if (jlptMatch) {
    return {
      sourcePath,
      filename,
      book: `JLPT N${jlptMatch[1]}`,
      volume: null,
      sourceType: sourceTypeFor(normalized),
      pageNumber: firstPageNumber(filename),
    };
  }

  const firstDirectory = sourcePath.split('/')[0] ?? path.basename(path.dirname(absolutePath));
  return {
    sourcePath,
    filename,
    book: titleFromSlug(firstDirectory),
    volume: null,
    sourceType: sourceTypeFor(normalized),
    pageNumber: firstPageNumber(filename),
  };
}
