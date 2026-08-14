const readingTargetPattern = /[\u3400-\u9fff々ヶ〇0-9０-９]/u;
const kanaReadingPattern = /^[\u3041-\u3096\u309d\u309eー]+$/u;

export interface ContextualReadingSegment {
  start: number;
  text: string;
  reading?: string;
}

interface ReadingToken {
  start: number;
  text: string;
  requiresReading: boolean;
}

interface AlignmentResult {
  score: number;
  segments: ContextualReadingSegment[];
}

/** Normalizes a pronunciation to hiragana while preserving punctuation. */
export function normalizeJapaneseReading(value: string): string {
  return Array.from(value.replace(/\s/gu, ''), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code >= 0x30a1 && code <= 0x30f6
      ? String.fromCodePoint(code - 0x60)
      : character;
  }).join('');
}

function readingTokens(text: string): ReadingToken[] {
  const tokens: ReadingToken[] = [];
  let start = 0;
  let current = '';
  let currentRequiresReading = readingTargetPattern.test(text[0] ?? '');

  for (const [index, character] of Array.from(text).entries()) {
    const requiresReading = readingTargetPattern.test(character);
    if (current && requiresReading !== currentRequiresReading) {
      tokens.push({ start, text: current, requiresReading: currentRequiresReading });
      start = index;
      current = '';
    }
    current += character;
    currentRequiresReading = requiresReading;
  }
  if (current) tokens.push({ start, text: current, requiresReading: currentRequiresReading });
  return tokens;
}

function alignTokens(
  tokens: ReadingToken[],
  reading: string,
  tokenIndex: number,
  readingIndex: number,
  memo: Map<string, AlignmentResult | undefined>,
): AlignmentResult | undefined {
  if (tokenIndex === tokens.length) {
    return readingIndex === reading.length ? { score: 0, segments: [] } : undefined;
  }
  const cacheKey = `${tokenIndex}:${readingIndex}`;
  if (memo.has(cacheKey)) return memo.get(cacheKey);
  const token = tokens[tokenIndex]!;

  if (!token.requiresReading) {
    const literal = normalizeJapaneseReading(token.text);
    let variants = new Set(['']);
    for (const character of Array.from(literal)) {
      const pronunciations = character === 'は'
        ? ['は', 'わ']
        : character === 'へ'
          ? ['へ', 'え']
          : character === 'を'
            ? ['を', 'お']
            : [character];
      variants = new Set([...variants].flatMap((prefix) => pronunciations.map((pronunciation) => `${prefix}${pronunciation}`)));
    }
    let best: AlignmentResult | undefined;
    for (const variant of variants) {
      if (!reading.startsWith(variant, readingIndex)) continue;
      const rest = alignTokens(tokens, reading, tokenIndex + 1, readingIndex + variant.length, memo);
      if (!rest) continue;
      const substitutions = Array.from(variant).filter((character, index) => character !== Array.from(literal)[index]).length;
      const result = {
        score: rest.score - substitutions,
        segments: [{ start: token.start, text: token.text }, ...rest.segments],
      };
      if (!best || result.score > best.score) best = result;
    }
    memo.set(cacheKey, best);
    return best;
  }

  const remainingTokens = tokens.length - tokenIndex - 1;
  const lastPossibleEnd = reading.length - remainingTokens;
  const targetCharacterCount = Array.from(token.text).filter((character) => readingTargetPattern.test(character)).length;
  const expectedLength = Math.max(1, targetCharacterCount * 2);
  let best: AlignmentResult | undefined;
  for (let end = readingIndex + 1; end <= lastPossibleEnd; end += 1) {
    const candidate = reading.slice(readingIndex, end);
    if (!kanaReadingPattern.test(candidate)) continue;
    const rest = alignTokens(tokens, reading, tokenIndex + 1, end, memo);
    if (!rest) continue;
    const result = {
      score: rest.score + 10 - Math.abs(candidate.length - expectedLength),
      segments: [{ start: token.start, text: token.text, reading: candidate }, ...rest.segments],
    };
    if (!best || result.score > best.score) best = result;
  }
  memo.set(cacheKey, best);
  return best;
}

/**
 * Aligns a reviewed full pronunciation with its written Japanese. Kanji runs
 * receive only the reading used at that exact occurrence, so repeated words
 * and context-sensitive readings never fall back to an isolated kanji guess.
 */
export function alignContextualReading(
  text: string,
  fullReading: string,
): ContextualReadingSegment[] | undefined {
  if (!text || !fullReading) return undefined;
  const normalizedReading = normalizeJapaneseReading(fullReading);
  return alignTokens(readingTokens(text), normalizedReading, 0, 0, new Map())?.segments;
}

export function hasCompleteContextualReading(
  text: string,
  fullReading: string,
): boolean {
  const segments = alignContextualReading(text, fullReading);
  return Boolean(
    segments
    && segments.map(({ text: segmentText }) => segmentText).join('') === text
    && segments.every((segment) => !readingTargetPattern.test(segment.text) || Boolean(segment.reading)),
  );
}
