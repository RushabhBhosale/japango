import type { KanjidicEntry } from "./types";

export function canonicalKanjiUnicode(character: string): string {
  const codePoint = character.codePointAt(0);
  if (codePoint === undefined) {
    throw new Error("Cannot derive Unicode code point from an empty character");
  }
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function legacyJlptLevel(
  entry: KanjidicEntry,
): "N5" | "N4" | null {
  if (entry.legacyJlpt === 4) return "N5";
  if (entry.legacyJlpt === 3) return "N4";
  return null;
}

