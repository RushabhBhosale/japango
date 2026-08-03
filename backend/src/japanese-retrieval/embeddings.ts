import { z } from 'zod';

import type { JapaneseRetrievalConfig } from './config';
import { JapaneseRetrievalError } from './errors';
import { withRetry } from './retry';

const ollamaEmbeddingResponseSchema = z.object({
  embeddings: z.array(z.array(z.number().finite()).min(1)),
}).passthrough();

const EMBEDDING_BATCH_SIZE = 32;

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export class OllamaEmbeddingClient {
  constructor(private readonly config: JapaneseRetrievalConfig) {}

  async embedMany(inputs: string[]): Promise<number[][]> {
    const batches: string[][] = [];
    for (let index = 0; index < inputs.length; index += EMBEDDING_BATCH_SIZE) {
      batches.push(inputs.slice(index, index + EMBEDDING_BATCH_SIZE));
    }

    const embeddings: number[][] = [];
    for (const batch of batches) {
      embeddings.push(...await this.embedBatch(batch));
    }
    return embeddings;
  }

  private async embedBatch(inputs: string[]): Promise<number[][]> {
    return withRetry(
      async () => {
        try {
          const response = await fetch(`${this.config.ollamaBaseUrl.replace(/\/$/u, '')}/api/embed`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({ model: this.config.ollamaEmbeddingModel, input: inputs }),
          });
          if (!response.ok) {
            throw new JapaneseRetrievalError(
              'EMBEDDING_FAILED',
              retryableStatus(response.status),
              'Japanese search embeddings could not be created.',
            );
          }
          const body = ollamaEmbeddingResponseSchema.parse(await response.json() as unknown);
          if (body.embeddings.length !== inputs.length) {
            throw new JapaneseRetrievalError(
              'INVALID_EMBEDDING',
              true,
              'The embedding provider returned an incomplete response.',
            );
          }
          const vectors = body.embeddings;
          if (vectors.some((vector) => vector.length !== this.config.embeddingDimensions)) {
            throw new JapaneseRetrievalError(
              'INVALID_EMBEDDING',
              false,
              `The embedding model must return ${this.config.embeddingDimensions} dimensions.`,
            );
          }
          return vectors;
        } catch (error) {
          if (error instanceof JapaneseRetrievalError) throw error;
          throw new JapaneseRetrievalError(
            'EMBEDDING_FAILED',
            true,
            'Japanese search embeddings could not be created.',
          );
        }
      },
      {
        attempts: 3,
        initialDelayMs: 500,
        shouldRetry: (error) => error instanceof JapaneseRetrievalError && error.retryable,
      },
    );
  }
}
