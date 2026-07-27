const punctuation = /[。、，．,.!?！？「」『』（）()［］【】【：:・]/gu;
const whitespace = /[\s　]+/gu;

/** Normalizes deterministic Japanese exercise answers without trying to judge free writing. */
export function normalizeJapaneseAnswer(value: string): string {
  return value.normalize('NFKC').trim().replace(whitespace, '').replace(punctuation, '');
}

export function answerMatchesAcceptedVariants(answer: string, acceptedAnswers: readonly string[]): boolean {
  const normalized = normalizeJapaneseAnswer(answer);
  return normalized.length > 0 && acceptedAnswers.some((expected) => normalizeJapaneseAnswer(expected) === normalized);
}

export function containsRequiredJapanesePattern(answer: string, pattern: string): boolean {
  return normalizeJapaneseAnswer(answer).includes(normalizeJapaneseAnswer(pattern));
}
