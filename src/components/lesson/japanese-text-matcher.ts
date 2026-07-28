import type { JapaneseTextItem } from '@/services/database/japanese-text-repository';

export type JapaneseTextSegment =
  | { kind: 'plain'; text: string }
  | { kind: 'item'; item: JapaneseTextItem; text: string; reading?: string };

function isJapaneseWordCharacter(value: string | undefined): boolean {
  return Boolean(value && /[\u3040-\u30ff\u3400-\u9fff]/u.test(value));
}

function isSafeFollowingBoundary(item: JapaneseTextItem, value: string | undefined): boolean {
  if (!isJapaneseWordCharacter(value)) return true;
  if (value && /^[はをにでとものへやかよね]$/u.test(value)) return true;
  // が can also be a verb ending (for example 急がず), so only use it for an
  // explicitly authored course word such as 何 or 私.
  return value === 'が' && item.id.startsWith('course-vocab-');
}

function canUseInContext(text: string, item: JapaneseTextItem, position: number): boolean {
  if (item.title.length > 1) return true;
  // A character's standalone reading is not reliable inside an unknown compound.
  // A following particle still makes a word boundary (駅の, 何が), even when
  // the previous word ends directly before it without a space.
  return isSafeFollowingBoundary(item, text.at(position + item.title.length));
}

function inflectedVocabularyMatch(
  text: string,
  position: number,
  item: JapaneseTextItem,
): { text: string; reading: string } | undefined {
  if (item.type !== 'vocabulary' || !item.reading) return undefined;
  if (item.title === '来る') {
    if (!text.startsWith('来', position)) return undefined;
    const inflection = text.slice(position + 1).match(/^[\u3040-\u30ffー]+/u)?.[0];
    if (!inflection) return undefined;
    const readingStart = /^(ます|ました|ません|ませんでした|たい|て|た)/u.test(inflection) ? 'き' : 'こ';
    return { text: `来${inflection}`, reading: `${readingStart}${inflection}` };
  }
  const trailingKana = item.title.match(/[\u3040-\u30ffー]+$/u)?.[0];
  if (!trailingKana || !item.reading.endsWith(trailingKana)) return undefined;
  const writtenStem = item.title.slice(0, -trailingKana.length);
  const readingStem = item.reading.slice(0, -trailingKana.length);
  if (!writtenStem || !readingStem || !text.startsWith(writtenStem, position)) return undefined;
  const inflection = text.slice(position + writtenStem.length).match(/^[\u3040-\u30ffー]+/u)?.[0];
  if (!inflection) return undefined;
  return { text: `${writtenStem}${inflection}`, reading: `${readingStem}${inflection}` };
}

/** Splits text into the longest context-safe vocabulary/kanji matches. */
export function splitJapaneseText(text: string, items: JapaneseTextItem[]): JapaneseTextSegment[] {
  if (!items.length) return [{ kind: 'plain', text }];
  const segments: JapaneseTextSegment[] = [];
  let cursor = 0;
  let plainStart = 0;
  while (cursor < text.length) {
    const exactCandidates = items.filter((candidate) => text.startsWith(candidate.title, cursor) && canUseInContext(text, candidate, cursor));
    // A complete word, including an inflected vocabulary word, must take
    // priority over a matching single kanji. Otherwise 急がず could become
    // 急 (きゅう) instead of 急ぐ (いそぐ) in its actual sentence context.
    const exactItem = exactCandidates.find((candidate) => candidate.title.length > 1);
    const inflected = exactItem ? undefined : items
      .map((candidate) => ({ item: candidate, match: inflectedVocabularyMatch(text, cursor, candidate) }))
      .find((candidate) => candidate.match);
    const standalone = exactItem || inflected ? undefined : exactCandidates[0];
    const item = exactItem ?? inflected?.item ?? standalone;
    if (!item) {
      cursor += 1;
      continue;
    }
    if (plainStart < cursor) segments.push({ kind: 'plain', text: text.slice(plainStart, cursor) });
    const match = inflected?.match;
    const matchedText = match?.text ?? item.title;
    segments.push({ kind: 'item', item, text: matchedText, reading: match?.reading ?? item.reading });
    cursor += matchedText.length;
    plainStart = cursor;
  }
  if (plainStart < text.length) segments.push({ kind: 'plain', text: text.slice(plainStart) });
  return segments;
}
