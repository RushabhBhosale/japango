import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface JlptPaperAudit {
  paperId: string;
  level: 'N5' | 'N4';
  edition: string;
  sourceFiles: string[];
  pageNumbers: number[];
  missingPages: number[];
  sectionTypes: Array<'vocabulary_kanji' | 'grammar' | 'reading' | 'listening'>;
  answerKeyFiles: string[];
  answerSheetFiles: string[];
  listeningScriptFiles: string[];
  qualityWarnings: Array<{ sourcePath: string; warnings: string[] }>;
  duplicateSourcePaths: string[][];
}

interface SourceFile { sourcePath: string; content: string; level: 'N5' | 'N4'; edition: string; page: number; }

async function discover(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const next = path.join(directory, entry.name);
    if (entry.isDirectory()) return discover(next);
    return entry.isFile() && entry.name.endsWith('.md') ? [next] : [];
  }));
  return nested.flat();
}

function parseSource(root: string, absolutePath: string, content: string): SourceFile | undefined {
  const sourcePath = path.relative(root, absolutePath).split(path.sep).join('/');
  const match = sourcePath.match(/question-papers-jlpt_jlpt-(n[45])-([\d-]+)_page-(\d+)\.md$/iu);
  if (!match) return undefined;
  return { sourcePath, content, level: match[1].toUpperCase() as 'N5' | 'N4', edition: match[2], page: Number(match[3]) };
}

function sections(content: string): JlptPaperAudit['sectionTypes'] {
  const found: JlptPaperAudit['sectionTypes'] = [];
  if (/文字・語彙|もじ・ごい/u.test(content)) found.push('vocabulary_kanji');
  if (/文法|ぶんぽう/u.test(content)) found.push('grammar');
  if (/読解|どっかい/u.test(content)) found.push('reading');
  if (/聴解|ちょうかい/u.test(content)) found.push('listening');
  return found;
}

function warnings(content: string): string[] {
  const found: string[] = [];
  if (/\[UNREADABLE TEXT\]/u.test(content)) found.push('unreadable-text-marker');
  if (/```markdown/u.test(content)) found.push('duplicated-markdown-block');
  if (/[问题]/u.test(content)) found.push('mixed-chinese-glyph');
  if (/micii|JLPt|リゥ|于|采/u.test(content)) found.push('suspect-ocr-token');
  return found;
}

export async function auditJlptQuestionPaperCorpus(rootDirectory: string): Promise<JlptPaperAudit[]> {
  const files = await discover(rootDirectory);
  const parsed = (await Promise.all(files.map(async (file) => parseSource(rootDirectory, file, await readFile(file, 'utf8'))))).flatMap((value) => value ? [value] : []);
  const byPaper = new Map<string, SourceFile[]>();
  for (const source of parsed) {
    const paperId = `${source.level}-${source.edition}`;
    const group = byPaper.get(paperId) ?? [];
    group.push(source);
    byPaper.set(paperId, group);
  }
  return [...byPaper.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([paperId, sources]) => {
    sources.sort((left, right) => left.page - right.page);
    const pages = sources.map((source) => source.page);
    const allSections = new Set(sources.flatMap((source) => sections(source.content)));
    const hashes = new Map<string, string[]>();
    for (const source of sources) {
      const hash = createHash('sha256').update(source.content.trim(), 'utf8').digest('hex');
      hashes.set(hash, [...(hashes.get(hash) ?? []), source.sourcePath]);
    }
    return {
      paperId,
      level: sources[0].level,
      edition: sources[0].edition,
      sourceFiles: sources.map((source) => source.sourcePath),
      pageNumbers: pages,
      missingPages: Array.from({ length: pages.at(-1)! - pages[0] + 1 }, (_, index) => pages[0] + index).filter((page) => !pages.includes(page)),
      sectionTypes: [...allSections],
      answerKeyFiles: sources.filter((source) => /正答表|せいとうひょう/u.test(source.content)).map((source) => source.sourcePath),
      answerSheetFiles: sources.filter((source) => /解答用紙|かいとうようし/u.test(source.content)).map((source) => source.sourcePath),
      listeningScriptFiles: sources.filter((source) => /聴解スクリプト/u.test(source.content)).map((source) => source.sourcePath),
      qualityWarnings: sources.flatMap((source) => {
        const sourceWarnings = warnings(source.content);
        return sourceWarnings.length ? [{ sourcePath: source.sourcePath, warnings: sourceWarnings }] : [];
      }),
      duplicateSourcePaths: [...hashes.values()].filter((sourcePaths) => sourcePaths.length > 1),
    };
  });
}
