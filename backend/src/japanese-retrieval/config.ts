import { JapaneseRetrievalError } from './errors';

export interface JapaneseRetrievalConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  embeddingProvider: 'ollama';
  ollamaBaseUrl: string;
  ollamaEmbeddingModel: string;
  embeddingDimensions: number;
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value?.trim()) {
    throw new JapaneseRetrievalError(
      'CONFIGURATION_ERROR',
      false,
      `Japanese retrieval is not configured (${name} is missing).`,
    );
  }
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new JapaneseRetrievalError(
      'CONFIGURATION_ERROR',
      false,
      `${name} must be a positive integer.`,
    );
  }
  return parsed;
}

export function loadJapaneseRetrievalConfig(): JapaneseRetrievalConfig {
  const provider = (process.env.EMBEDDING_PROVIDER ?? '').trim().toLocaleLowerCase('en-US');
  if (provider !== 'ollama') {
    throw new JapaneseRetrievalError(
      'CONFIGURATION_ERROR',
      false,
      'EMBEDDING_PROVIDER must be set to ollama.',
    );
  }
  return {
    supabaseUrl: required('SUPABASE_URL'),
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    embeddingProvider: 'ollama',
    ollamaBaseUrl: required('OLLAMA_BASE_URL'),
    ollamaEmbeddingModel: required('OLLAMA_EMBEDDING_MODEL'),
    embeddingDimensions: positiveInteger('JAPANESE_EMBEDDING_DIMENSIONS', 2560),
  };
}
