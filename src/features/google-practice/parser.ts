import { practiceLogMetadataSchema } from './schemas';
import type { PracticeLogMessage, PracticeLogSession } from '@/types/google-practice';

interface GoogleTextRun {
  content?: string;
}

interface GoogleParagraphElement {
  startIndex?: number;
  endIndex?: number;
  textRun?: GoogleTextRun;
}

interface GoogleStructuralElement {
  startIndex?: number;
  endIndex?: number;
  paragraph?: { elements?: GoogleParagraphElement[] };
  table?: {
    tableRows?: { tableCells?: { content?: GoogleStructuralElement[] }[] }[];
  };
  tableOfContents?: { content?: GoogleStructuralElement[] };
}

export interface GooglePracticeDocument {
  documentId: string;
  title: string;
  body?: { content?: GoogleStructuralElement[] };
}

interface IndexedText {
  text: string;
  startIndex: number;
  endIndex: number;
}

const sessionHeaderPattern = /^#\s*Session:\s*(\d{4}-\d{2}-\d{2})\s*$/gimu;
const rolePattern = /^(USER|ASSISTANT):\s*$/gimu;

function flattenElements(elements: readonly GoogleStructuralElement[], afterIndex: number): IndexedText[] {
  const result: IndexedText[] = [];
  const visit = (element: GoogleStructuralElement) => {
    const paragraphElements = element.paragraph?.elements ?? [];
    for (const child of paragraphElements) {
      const text = child.textRun?.content;
      const startIndex = child.startIndex ?? element.startIndex ?? 0;
      const endIndex = child.endIndex ?? element.endIndex ?? startIndex + (text?.length ?? 0);
      if (text && endIndex > afterIndex) {
        const visibleStart = Math.max(startIndex, afterIndex);
        const offset = Math.max(0, Math.min(text.length, visibleStart - startIndex));
        const visibleText = text.slice(offset);
        if (visibleText) result.push({ text: visibleText, startIndex: visibleStart, endIndex });
      }
    }
    for (const row of element.table?.tableRows ?? []) {
      for (const cell of row.tableCells ?? []) flattenElements(cell.content ?? [], afterIndex).forEach((item) => result.push(item));
    }
    flattenElements(element.tableOfContents?.content ?? [], afterIndex).forEach((item) => result.push(item));
  };
  elements.forEach(visit);
  return result.sort((left, right) => left.startIndex - right.startIndex);
}

function buildIndexedTail(document: GooglePracticeDocument, afterIndex: number): IndexedText {
  const chunks = flattenElements(document.body?.content ?? [], afterIndex);
  if (!chunks.length) return { text: '', startIndex: afterIndex, endIndex: afterIndex };
  const startIndex = chunks[0]!.startIndex;
  return {
    text: chunks.map((chunk) => chunk.text).join(''),
    startIndex,
    endIndex: Math.max(...chunks.map((chunk) => chunk.endIndex)),
  };
}

function stripMetadataBlock(value: string): { transcript: string; metadata?: PracticeLogSession['metadata'] } {
  const candidates = [...value.matchAll(/```(?:json)?\s*([\s\S]*?)```/gimu)];
  const rawCandidate = value.match(/(\{\s*"mistakes"[\s\S]*\})\s*$/u);
  const candidate = candidates.at(-1)?.[1] ?? rawCandidate?.[1];
  if (!candidate) return { transcript: value.trim() };
  try {
    const parsed = practiceLogMetadataSchema.safeParse(JSON.parse(candidate) as unknown);
    if (!parsed.success) return { transcript: value.trim() };
    const marker = candidates.length ? candidates.at(-1)![0] : rawCandidate![0];
    return { transcript: value.slice(0, value.lastIndexOf(marker)).trim(), metadata: parsed.data };
  } catch {
    return { transcript: value.trim() };
  }
}

function parseMessages(value: string): PracticeLogMessage[] {
  const matches = [...value.matchAll(rolePattern)];
  return matches.flatMap((match, index) => {
    const contentStart = (match.index ?? 0) + match[0].length;
    const contentEnd = matches[index + 1]?.index ?? value.length;
    const content = value.slice(contentStart, contentEnd).trim();
    if (!content) return [];
    return [{ role: match[1]!.toLowerCase() as PracticeLogMessage['role'], content }];
  });
}

export function parsePracticeLogText(
  text: string,
  baseIndex = 0,
): PracticeLogSession[] {
  const headers = [...text.matchAll(sessionHeaderPattern)];
  return headers.flatMap((header, index) => {
    const sectionStart = header.index ?? 0;
    const sectionEnd = headers[index + 1]?.index ?? text.length;
    const section = text.slice(sectionStart, sectionEnd).trim();
    const id = section.match(/^ID:\s*([A-Za-z0-9._:-]+)\s*$/imu)?.[1];
    if (!id) return [];
    const withoutHeader = section.slice(header[0].length).replace(/^\s*ID:\s*[A-Za-z0-9._:-]+\s*$/imu, '').trim();
    const parsed = stripMetadataBlock(withoutHeader);
    const messages = parseMessages(parsed.transcript);
    if (!messages.some((message) => message.role === 'user') || !messages.some((message) => message.role === 'assistant')) return [];
    return [{
      id,
      practicedAt: header[1]!,
      messages,
      transcript: parsed.transcript,
      startIndex: baseIndex + sectionStart,
      endIndex: baseIndex + sectionEnd,
      metadata: parsed.metadata,
    }];
  });
}

export function parseGooglePracticeDocument(
  document: GooglePracticeDocument,
  afterIndex: number,
): PracticeLogSession[] {
  const tail = buildIndexedTail(document, afterIndex);
  return parsePracticeLogText(tail.text, tail.startIndex);
}
