import { createHash } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { chunkJapaneseOcrMarkdown } from './chunking';
import { loadJapaneseRetrievalConfig } from './config';
import { OllamaEmbeddingClient } from './embeddings';
import { JapaneseRetrievalError } from './errors';
import { inferJapaneseOcrMetadata } from './metadata';
import { withRetry } from './retry';
import { asDatabaseError, createJapaneseRetrievalSupabaseClient } from './supabase';
import type { EmbeddedJapaneseOcrChunk, JapaneseOcrFileMetadata } from './types';

export interface IngestionOptions {
  sourceDirectory: string;
  dryRun: boolean;
  force: boolean;
  rejectedLogPath: string;
  log: (message: string) => void;
}

export interface IngestionSummary {
  discovered: number;
  ingested: number;
  skipped: number;
  rejected: number;
  chunks: number;
}

interface DocumentState {
  content_hash: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function discoverMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return discoverMarkdownFiles(entryPath);
    return entry.isFile() && entry.name.toLocaleLowerCase('en-US').endsWith('.md') ? [entryPath] : [];
  }));
  return files.flat().sort((left, right) => left.localeCompare(right, 'en-US'));
}

async function logRejected(
  rejectedLogPath: string,
  sourcePath: string,
  reason: 'EMPTY_FILE' | 'READ_FAILED',
): Promise<void> {
  await mkdir(path.dirname(rejectedLogPath), { recursive: true });
  await appendFile(rejectedLogPath, `${JSON.stringify({ sourcePath, reason, rejectedAt: new Date().toISOString() })}\n`, 'utf8');
}

async function existingDocumentHash(
  sourcePath: string,
  config: ReturnType<typeof loadJapaneseRetrievalConfig>,
): Promise<string | null> {
  const supabase = createJapaneseRetrievalSupabaseClient(config);
  const { data, error } = await supabase
    .from('japanese_ocr_documents')
    .select('content_hash')
    .eq('source_path', sourcePath)
    .maybeSingle();
  if (error) throw asDatabaseError(error);
  if (!data) return null;
  const candidate = data as unknown;
  if (
    typeof candidate !== 'object'
    || candidate === null
    || !('content_hash' in candidate)
    || typeof candidate.content_hash !== 'string'
  ) {
    throw new JapaneseRetrievalError(
      'INVALID_DATABASE_RESPONSE',
      true,
      'The ingestion state could not be read.',
    );
  }
  return candidate.content_hash;
}

async function replaceDocument(
  metadata: JapaneseOcrFileMetadata,
  contentHash: string,
  chunks: EmbeddedJapaneseOcrChunk[],
  config: ReturnType<typeof loadJapaneseRetrievalConfig>,
): Promise<void> {
  const supabase = createJapaneseRetrievalSupabaseClient(config);
  const { error } = await supabase.rpc('replace_japanese_ocr_document', {
    p_source_path: metadata.sourcePath,
    p_content_hash: contentHash,
    p_book: metadata.book,
    p_volume: metadata.volume,
    p_source_type: metadata.sourceType,
    p_filename: metadata.filename,
    p_page_number: metadata.pageNumber,
    p_chunks: chunks.map((chunk) => ({
      chunk_index: chunk.chunkIndex,
      chunk_hash: chunk.chunkHash,
      content: chunk.content,
      heading_path: chunk.headingPath,
      page_number: chunk.pageNumber,
      embedding: chunk.embedding,
    })),
  });
  if (error) throw asDatabaseError(error);
}

export async function ingestJapaneseOcr(options: IngestionOptions): Promise<IngestionSummary> {
  const files = await discoverMarkdownFiles(options.sourceDirectory);
  const summary: IngestionSummary = { discovered: files.length, ingested: 0, skipped: 0, rejected: 0, chunks: 0 };
  options.log(`Discovered ${files.length} Markdown files under ${options.sourceDirectory}.`);

  const config = options.dryRun ? null : loadJapaneseRetrievalConfig();
  const embeddingClient = config ? new OllamaEmbeddingClient(config) : null;

  for (const absolutePath of files) {
    const metadata = inferJapaneseOcrMetadata(options.sourceDirectory, absolutePath);
    let content: string;
    try {
      content = await readFile(absolutePath, 'utf8');
    } catch {
      summary.rejected += 1;
      options.log(`Rejected ${metadata.sourcePath}: unable to read.`);
      if (!options.dryRun) await logRejected(options.rejectedLogPath, metadata.sourcePath, 'READ_FAILED');
      continue;
    }
    if (!/\S/u.test(content)) {
      summary.rejected += 1;
      options.log(`Rejected ${metadata.sourcePath}: empty file.`);
      if (!options.dryRun) await logRejected(options.rejectedLogPath, metadata.sourcePath, 'EMPTY_FILE');
      continue;
    }

    const contentHash = sha256(content);
    if (config && !options.force) {
      const storedHash = await withRetry(
        () => existingDocumentHash(metadata.sourcePath, config),
        { attempts: 3, initialDelayMs: 400, shouldRetry: (error) => error instanceof JapaneseRetrievalError && error.retryable },
      );
      if (storedHash === contentHash) {
        summary.skipped += 1;
        options.log(`Skipped unchanged ${metadata.sourcePath}.`);
        continue;
      }
    }

    const chunks = chunkJapaneseOcrMarkdown(content, metadata.pageNumber);
    if (chunks.length === 0) {
      summary.rejected += 1;
      options.log(`Rejected ${metadata.sourcePath}: no meaningful Markdown sections.`);
      if (!options.dryRun) await logRejected(options.rejectedLogPath, metadata.sourcePath, 'EMPTY_FILE');
      continue;
    }
    summary.chunks += chunks.length;
    if (options.dryRun) {
      summary.ingested += 1;
      options.log(`Would ingest ${metadata.sourcePath} (${chunks.length} chunks).`);
      continue;
    }

    const embeddings = await embeddingClient?.embedMany(chunks.map((chunk) => chunk.content));
    if (!embeddings || embeddings.length !== chunks.length || !config) {
      throw new JapaneseRetrievalError('INVALID_EMBEDDING', true, 'Could not prepare OCR embeddings.');
    }
    const embeddedChunks: EmbeddedJapaneseOcrChunk[] = chunks.map((chunk, index) => ({
      ...chunk,
      chunkHash: sha256(`${metadata.sourcePath}\u0000${chunk.chunkIndex}\u0000${chunk.content}`),
      embedding: embeddings[index],
    }));
    await withRetry(
      () => replaceDocument(metadata, contentHash, embeddedChunks, config),
      {
        attempts: 3,
        initialDelayMs: 500,
        shouldRetry: (error) => error instanceof JapaneseRetrievalError && error.retryable,
        onRetry: (_error, attempt, delayMs) => options.log(`Retrying ${metadata.sourcePath} after attempt ${attempt} in ${delayMs}ms.`),
      },
    );
    summary.ingested += 1;
    options.log(`Ingested ${metadata.sourcePath} (${chunks.length} chunks).`);
  }

  options.log(`Finished: ${summary.ingested} ingested, ${summary.skipped} unchanged, ${summary.rejected} rejected, ${summary.chunks} chunks.`);
  return summary;
}
