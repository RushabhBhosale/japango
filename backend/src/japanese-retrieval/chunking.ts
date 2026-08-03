import type { JapaneseOcrChunk } from './types';

export const FALLBACK_CHUNK_MIN_CHARACTERS = 800;
export const FALLBACK_CHUNK_MAX_CHARACTERS = 1500;
export const FALLBACK_CHUNK_OVERLAP_CHARACTERS = 150;

interface MarkdownSection {
  content: string;
  headingPath: string[];
  pageNumber: number | null;
}

function pageNumberFromHeading(heading: string): number | null {
  const match = heading.match(/(?:pdf\s+)?page\s+(\d+)/iu);
  return match ? Number.parseInt(match[1], 10) : null;
}

function headingSections(markdown: string, defaultPageNumber: number | null): MarkdownSection[] {
  const lines = markdown.split(/(?<=\n)/u);
  const sections: MarkdownSection[] = [];
  let headingPath: string[] = [];
  let pageNumber = defaultPageNumber;
  let content = '';

  const flush = (): void => {
    if (/\S/u.test(content)) {
      sections.push({ content, headingPath: [...headingPath], pageNumber });
    }
    content = '';
  };

  const containsBody = (value: string): boolean => value
    .split(/\r?\n/u)
    .some((line) => /\S/u.test(line) && !/^#{1,6}\s+/u.test(line));

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+?)(?:\r?\n)?$/u);
    if (!match) {
      content += line;
      continue;
    }

    const depth = match[1].length;
    const title = match[2];
    if (containsBody(content)) flush();
    headingPath = [...headingPath.slice(0, depth - 1), title];
    pageNumber = pageNumberFromHeading(title) ?? pageNumber;
    content += line;
  }
  flush();
  return sections;
}

function isTableLine(line: string): boolean {
  return /^\s*\|.*\|\s*(?:\r?\n)?$/u.test(line);
}

function isDialogueLine(line: string): boolean {
  return /^\s*(?:[-*+]\s+)?(?:[A-ZＡ-Ｚ][A-ZＡ-Ｚ .'-]{0,30}|[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]{1,16})\s*[：:]\s+/u.test(line);
}

function semanticBlocks(section: MarkdownSection): string[] {
  const lines = section.content.split(/(?<=\n)/u);
  const blocks: string[] = [];
  let current = '';
  let mode: 'normal' | 'table' | 'dialogue' | 'fence' = 'normal';

  const flush = (): void => {
    if (/\S/u.test(current)) blocks.push(current);
    current = '';
  };

  for (const line of lines) {
    const isFence = /^\s*```/u.test(line);
    const table = isTableLine(line);
    const dialogue = isDialogueLine(line);
    const blank = /^\s*$/u.test(line);

    if (mode === 'fence') {
      current += line;
      if (isFence) mode = 'normal';
      continue;
    }
    if (isFence) {
      flush();
      current = line;
      mode = 'fence';
      continue;
    }
    if (mode === 'table') {
      if (table) {
        current += line;
        continue;
      }
      flush();
      mode = 'normal';
    }
    if (mode === 'dialogue') {
      if (dialogue || blank) {
        current += line;
        continue;
      }
      flush();
      mode = 'normal';
    }
    if (table) {
      flush();
      current = line;
      mode = 'table';
      continue;
    }
    if (dialogue) {
      flush();
      current = line;
      mode = 'dialogue';
      continue;
    }
    current += line;
    if (blank) flush();
  }
  flush();
  return blocks;
}

function fallbackChunks(section: MarkdownSection): MarkdownSection[] {
  if (section.content.length <= FALLBACK_CHUNK_MAX_CHARACTERS) return [section];

  const blocks = semanticBlocks(section);
  const chunks: MarkdownSection[] = [];
  let current = '';
  const packedChunkLimit = FALLBACK_CHUNK_MAX_CHARACTERS - FALLBACK_CHUNK_OVERLAP_CHARACTERS;

  const flush = (): void => {
    if (/\S/u.test(current)) {
      chunks.push({ ...section, content: current });
    }
    current = '';
  };

  for (const block of blocks) {
    if (block.length > FALLBACK_CHUNK_MAX_CHARACTERS) {
      flush();
      for (let start = 0; start < block.length; start += FALLBACK_CHUNK_MAX_CHARACTERS - FALLBACK_CHUNK_OVERLAP_CHARACTERS) {
        chunks.push({
          ...section,
          content: block.slice(start, start + FALLBACK_CHUNK_MAX_CHARACTERS),
        });
      }
      continue;
    }

    if (current.length + block.length > packedChunkLimit && /\S/u.test(current)) {
      flush();
    }
    current += block;
  }
  flush();

  if (chunks.length < 2) return chunks;
  return chunks.map((chunk, index) => {
    if (index === 0 || chunk.content.length > packedChunkLimit) return chunk;
    const previous = chunks[index - 1].content;
    return {
      ...chunk,
      content: previous.slice(-FALLBACK_CHUNK_OVERLAP_CHARACTERS) + chunk.content,
    };
  });
}

export function chunkJapaneseOcrMarkdown(
  markdown: string,
  defaultPageNumber: number | null,
): JapaneseOcrChunk[] {
  return headingSections(markdown, defaultPageNumber)
    .flatMap(fallbackChunks)
    .filter((section) => /\S/u.test(section.content))
    .map((section, chunkIndex) => ({
      chunkIndex,
      content: section.content,
      headingPath: section.headingPath,
      pageNumber: section.pageNumber,
    }));
}
