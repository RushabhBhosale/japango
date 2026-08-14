const readingTargetPattern = /[\u3400-\u9fff々ヶ〇0-9０-９]/u;
const kanaReadingPattern = /^[\u3041-\u3096\u309d\u309eー]+$/u;

interface ReadingToken {
  text: string;
  requiresReading: boolean;
}

function normalizeReading(value: string): string {
  return Array.from(value.replace(/\s/gu, ''), (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : character;
  }).join('');
}

function tokens(text: string): ReadingToken[] {
  const result: ReadingToken[] = [];
  for (const character of Array.from(text)) {
    const requiresReading = readingTargetPattern.test(character);
    const previous = result.at(-1);
    if (previous?.requiresReading === requiresReading) previous.text += character;
    else result.push({ text: character, requiresReading });
  }
  return result;
}

function aligns(parts: ReadingToken[], reading: string, partIndex: number, readingIndex: number, failed: Set<string>): boolean {
  if (partIndex === parts.length) return readingIndex === reading.length;
  const key = `${partIndex}:${readingIndex}`;
  if (failed.has(key)) return false;
  const part = parts[partIndex]!;
  if (!part.requiresReading) {
    const literal = normalizeReading(part.text);
    if (reading.startsWith(literal, readingIndex) && aligns(parts, reading, partIndex + 1, readingIndex + literal.length, failed)) return true;
    failed.add(key);
    return false;
  }
  const remainingParts = parts.length - partIndex - 1;
  for (let end = readingIndex + 1; end <= reading.length - remainingParts; end += 1) {
    if (!kanaReadingPattern.test(reading.slice(readingIndex, end))) continue;
    if (aligns(parts, reading, partIndex + 1, end, failed)) return true;
  }
  failed.add(key);
  return false;
}

export function hasCompleteContextualReading(text: string, reading: string): boolean {
  return Boolean(text && reading && aligns(tokens(text), normalizeReading(reading), 0, 0, new Set()));
}
