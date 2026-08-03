function normalized(value: string): string {
  return value.normalize('NFKC').replace(/[\s\p{P}]/gu, '').toLocaleLowerCase('ja-JP');
}

function trigrams(value: string): Set<string> {
  const source = normalized(value);
  if (source.length < 3) return new Set(source ? [source] : []);
  return new Set(Array.from({ length: source.length - 2 }, (_, index) => source.slice(index, index + 3)));
}

/** Jaccard trigram similarity is deterministic and suitable for a publication guard. */
export function japaneseTextSimilarity(left: string, right: string): number {
  const leftSet = trigrams(left);
  const rightSet = trigrams(right);
  if (!leftSet.size || !rightSet.size) return 0;
  let overlap = 0;
  for (const gram of leftSet) if (rightSet.has(gram)) overlap += 1;
  return overlap / (leftSet.size + rightSet.size - overlap);
}

export function highestSourceSimilarity(candidate: string, sources: readonly string[]): number {
  return sources.reduce((highest, source) => Math.max(highest, japaneseTextSimilarity(candidate, source)), 0);
}
