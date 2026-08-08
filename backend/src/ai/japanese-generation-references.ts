import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { searchJapaneseOcr } from '../japanese-retrieval/search';
import type { JapaneseGenerationInput, JapaneseGenerationReference } from './japanese-generation';

interface CorpusSentence {
  id: string;
  japanese: string;
  context?: { settingTags?: string[] };
  register?: string;
  reviewStatus?: string;
}

interface CorpusGrammarView {
  grammarId: string;
  sentenceId: string;
  role: string;
}

interface CorpusFile {
  sentences: CorpusSentence[];
  grammarExampleViews: CorpusGrammarView[];
}

let corpusFilesPromise: Promise<CorpusFile[]> | undefined;

function corpusDirectories(): string[] {
  return [
    process.env.JAPANGO_SENTENCE_CORPUS_DIR,
    path.resolve(process.cwd(), 'assets/docs-reference/japango-sentences'),
    path.resolve(process.cwd(), '../assets/docs-reference/japango-sentences'),
  ].filter((value): value is string => Boolean(value));
}

async function firstExistingCorpusDirectory(): Promise<string | undefined> {
  for (const directory of corpusDirectories()) {
    try {
      await access(path.join(directory, 'sentence-corpus-n4.json'));
      return directory;
    } catch {
      // A deployed backend may intentionally omit private editorial corpora.
    }
  }
  return undefined;
}

async function loadCorpusFiles(): Promise<CorpusFile[]> {
  if (!corpusFilesPromise) {
    corpusFilesPromise = (async () => {
      const directory = await firstExistingCorpusDirectory();
      if (!directory) return [];
      const files = await Promise.all(['N5', 'N4'].map(async (level) => {
        const raw = await readFile(path.join(directory, `sentence-corpus-${level.toLowerCase()}.json`), 'utf8');
        const parsed = JSON.parse(raw) as Partial<CorpusFile>;
        return {
          sentences: Array.isArray(parsed.sentences) ? parsed.sentences : [],
          grammarExampleViews: Array.isArray(parsed.grammarExampleViews) ? parsed.grammarExampleViews : [],
        } satisfies CorpusFile;
      }));
      return files;
    })();
  }
  return corpusFilesPromise;
}

async function corpusReferences(input: JapaneseGenerationInput, limit: number): Promise<JapaneseGenerationReference[]> {
  if (!input.targetGrammar.id) return [];
  const files = await loadCorpusFiles();
  const references: JapaneseGenerationReference[] = [];
  for (const corpus of files) {
    const sentenceById = new Map(corpus.sentences.map((sentence) => [sentence.id, sentence]));
    for (const view of corpus.grammarExampleViews) {
      if (view.grammarId !== input.targetGrammar.id || view.role !== 'focus') continue;
      const sentence = sentenceById.get(view.sentenceId);
      if (!sentence || sentence.reviewStatus === 'rejected') continue;
      references.push({
        source: 'corpus',
        referenceId: sentence.id,
        japanese: sentence.japanese,
        context: [sentence.register, ...(sentence.context?.settingTags ?? [])].filter(Boolean).join(', '),
      });
      if (references.length >= limit) return references;
    }
  }
  return references;
}

function ocrConfigured(): boolean {
  return Boolean(
    process.env.EMBEDDING_PROVIDER === 'ollama'
    && process.env.OLLAMA_BASE_URL
    && process.env.OLLAMA_EMBEDDING_MODEL
    && process.env.SUPABASE_URL
    && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

async function ocrReferences(input: JapaneseGenerationInput, limit: number): Promise<JapaneseGenerationReference[]> {
  if (!ocrConfigured()) return [];
  try {
    const results = await searchJapaneseOcr({
      query: `${input.targetGrammar.pattern} ${input.targetGrammar.meaning} JLPT ${input.level} example usage`,
      limit,
    });
    return results.map((result) => ({
      source: 'ocr',
      referenceId: result.chunkId,
      japanese: result.content.slice(0, 1200),
      context: `${result.book}${result.page ? `, page ${result.page}` : ''}; private usage reference`,
    }));
  } catch {
    // Retrieval is optional. Generation remains available with curated corpus
    // grounding, and the normal quality gates still apply.
    return [];
  }
}

/**
 * References guide situations and collocations only. They are never returned
 * directly as generated lesson content.
 */
export async function loadJapaneseGenerationReferences(
  rawInput: JapaneseGenerationInput,
  limit = 5,
): Promise<JapaneseGenerationReference[]> {
  const perSourceLimit = Math.max(1, Math.min(limit, 5));
  const [ocr, corpus] = await Promise.all([
    ocrReferences(rawInput, perSourceLimit),
    corpusReferences(rawInput, perSourceLimit),
  ]);
  const unique = new Map<string, JapaneseGenerationReference>();
  for (const reference of [...ocr, ...corpus]) {
    const key = reference.japanese.normalize('NFKC').replace(/\s+/gu, ' ').trim();
    if (!unique.has(key)) unique.set(key, reference);
  }
  return [...unique.values()].slice(0, limit);
}

export function resetJapaneseGenerationReferenceCache(): void {
  corpusFilesPromise = undefined;
}
