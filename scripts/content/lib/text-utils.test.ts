import { describe, expect, it } from "vitest";

import {
  extractKanji,
  grammarBaseId,
  kanaToRomaji,
  kanjiId,
  normalizeJapaneseForm,
  normalizeKana,
  normalizeUnicode,
  stableSlug,
  vocabularyBaseId,
} from "./text-utils";

describe("Japanese text normalization", () => {
  it("normalizes compatibility characters, spacing, punctuation, and kana", () => {
    expect(normalizeUnicode("  ＡＢＣ\tｶﾞ  ")).toBe("ABC ガ");
    expect(normalizeJapaneseForm(" ～ お茶 ・ 水 ～ ")).toBe("～ お茶・水 ～");
    expect(normalizeKana("ｶﾞ ｯ ｺｳ")).toBe("がっこう");
    expect(normalizeKana("タベル")).toBe("たべる");
  });

  it.each([
    ["がっこう", "gakkou"],
    ["きって", "kitte"],
    ["しんぶん", "shimbun"],
    ["スーパー", "suupaa"],
    ["きょう", "kyou"],
  ])("romanizes %s deterministically", (kana, expected) => {
    expect(kanaToRomaji(kana)).toBe(expected);
    expect(kanaToRomaji(kana)).toBe(expected);
  });
});

describe("stable content identities", () => {
  it("uses written form and normalized kana for vocabulary identity", () => {
    expect(vocabularyBaseId("食べる", "タベル")).toBe(
      "vocab-食べる-たべる",
    );
    expect(vocabularyBaseId("食べる", "たべる")).toBe(
      vocabularyBaseId("食べる", "タベル"),
    );
    expect(vocabularyBaseId("食べる", "くう")).not.toBe(
      vocabularyBaseId("食べる", "たべる"),
    );
  });

  it("generates semantic grammar and Unicode-character IDs without randomness", () => {
    expect(grammarBaseId("～てください")).toBe("grammar-tekudasai");
    expect(kanjiId("食")).toBe("kanji-食");
    expect(stableSlug("「A／B」 + C")).toBe("a-b-c");
    expect(stableSlug("   ")).toBe("unnamed");
  });

  it("extracts each kanji once while preserving first-seen order", () => {
    expect(extractKanji("食べる・食事を食べる")).toEqual(["食", "事"]);
  });
});
