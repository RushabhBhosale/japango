import { z } from 'zod';

import { loadJapaneseRetrievalConfig } from './config';
import { OllamaEmbeddingClient } from './embeddings';
import { JapaneseRetrievalError } from './errors';
import { createJapaneseRetrievalSupabaseClient, asDatabaseError } from './supabase';
import type { JapaneseSearchResult, JapaneseSourceType } from './types';

const sourceTypeSchema = z.enum(['textbook', 'grammar', 'workbook', 'question-paper', 'reference']);

export const japaneseSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(20).default(8),
  book: z.string().trim().min(1).max(160).optional(),
  sourceType: sourceTypeSchema.optional(),
}).strict();

export type JapaneseSearchRequest = z.infer<typeof japaneseSearchRequestSchema>;

const searchResultSchema = z.object({
  chunk_id: z.string().uuid(),
  content: z.string().min(1),
  score: z.number().finite(),
  book: z.string().min(1),
  page: z.number().int().positive().nullable(),
  source_type: sourceTypeSchema,
  filename: z.string().min(1),
}).strict();

function parseSearchResults(value: unknown): JapaneseSearchResult[] {
  const rows = z.array(searchResultSchema).parse(value);
  return rows.map((row) => ({
    chunkId: row.chunk_id,
    content: row.content,
    score: row.score,
    book: row.book,
    page: row.page,
    sourceType: row.source_type as JapaneseSourceType,
    filename: row.filename,
  }));
}

export async function searchJapaneseOcr(input: JapaneseSearchRequest): Promise<JapaneseSearchResult[]> {
  const config = loadJapaneseRetrievalConfig();
  const embeddingClient = new OllamaEmbeddingClient(config);
  const [embedding] = await embeddingClient.embedMany([input.query]);
  const supabase = createJapaneseRetrievalSupabaseClient(config);
  const { data, error } = await supabase.rpc('search_japanese_ocr', {
    p_query: input.query,
    p_embedding: embedding,
    p_limit: input.limit,
    p_book: input.book ?? null,
    p_source_type: input.sourceType ?? null,
  });
  if (error) throw asDatabaseError(error);
  try {
    return parseSearchResults(data ?? []);
  } catch {
    throw new JapaneseRetrievalError(
      'INVALID_DATABASE_RESPONSE',
      true,
      'Japanese search returned an invalid response.',
    );
  }
}
