import { randomUUID } from 'node:crypto';

import type { StructuredJapaneseText } from './contracts';

/**
 * Conservative fallback only. It never invents readings or lexical links, so
 * the result cannot be published before an editor verifies each meaningful token.
 */
export function createFallbackTokenization(raw: string): StructuredJapaneseText {
  return {
    raw,
    tokens: [{ id: `token-${randomUUID()}`, kind: 'plain', surface: raw, kanjiIds: [], status: 'needs_review' }],
    status: 'needs_review',
  };
}
