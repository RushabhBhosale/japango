const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const HIRAGANA_OFFSET = 0x60;

export function normalizeUnicode(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function normalizeJapaneseForm(value: string): string {
  return normalizeUnicode(value)
    .replace(/[~〜～]/gu, "～")
    .replace(/\s*([・、。])\s*/gu, "$1");
}

export function stripPatternMarkers(value: string): string {
  return normalizeJapaneseForm(value).replace(/^～|～$/gu, "");
}

export function katakanaToHiragana(value: string): string {
  return Array.from(normalizeUnicode(value), (character) => {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      codePoint >= KATAKANA_START &&
      codePoint <= KATAKANA_END
    ) {
      return String.fromCodePoint(codePoint - HIRAGANA_OFFSET);
    }
    return character;
  }).join("");
}

export function normalizeKana(value: string): string {
  return katakanaToHiragana(value).replace(/\s+/gu, "");
}

const BASIC_ROMAJI: Readonly<Record<string, string>> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "wi", ゑ: "we", を: "o", ん: "n",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
  ゔ: "vu", ゎ: "wa",
};

const COMBINATION_ROMAJI: Readonly<Record<string, string>> = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo",
  しゃ: "sha", しゅ: "shu", しょ: "sho",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
  にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo",
  みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo",
  ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  じゃ: "ja", じゅ: "ju", じょ: "jo",
  びゃ: "bya", びゅ: "byu", びょ: "byo",
  ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
  てぃ: "ti", でぃ: "di", とぅ: "tu", どぅ: "du",
  ふぁ: "fa", ふぃ: "fi", ふぇ: "fe", ふぉ: "fo",
  うぃ: "wi", うぇ: "we", うぉ: "wo", ゔぁ: "va",
  ゔぃ: "vi", ゔぇ: "ve", ゔぉ: "vo",
};

export function kanaToRomaji(value: string): string {
  const kana = Array.from(normalizeKana(value));
  let output = "";
  let geminate = false;

  for (let index = 0; index < kana.length; index += 1) {
    const character = kana[index];
    if (character === "っ") {
      geminate = true;
      continue;
    }
    if (character === "ー") {
      const lastVowel = output.match(/[aeiou](?!.*[aeiou])/u)?.[0];
      output += lastVowel ?? "";
      continue;
    }

    const pair = `${character}${kana[index + 1] ?? ""}`;
    const syllable = COMBINATION_ROMAJI[pair] ?? BASIC_ROMAJI[character] ?? character;
    if (COMBINATION_ROMAJI[pair]) {
      index += 1;
    }
    if (geminate && /^[bcdfghjkmprstvwxyz]/u.test(syllable)) {
      output += syllable.startsWith("ch") ? "t" : syllable[0];
    }
    geminate = false;
    output += syllable;
  }

  return output.replace(/n(?=[bmp])/gu, "m");
}

export function stableSlug(value: string): string {
  const normalized = normalizeUnicode(value)
    .replace(/[〜～~]/gu, "-")
    .replace(/[・･/／+＋]/gu, "-")
    .replace(/[()（）［\]【】「」『』“”"'’]/gu, "")
    .replace(/[^\p{Letter}\p{Number}\p{Script=Hiragana}\p{Script=Katakana}-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  return normalized.toLocaleLowerCase("en-US") || "unnamed";
}

export function vocabularyBaseId(form: string, reading: string): string {
  return `vocab-${stableSlug(form)}-${stableSlug(normalizeKana(reading))}`;
}

export function grammarBaseId(pattern: string): string {
  const romanized = kanaToRomaji(stripPatternMarkers(pattern));
  const useful = /[a-z]/u.test(romanized) ? romanized : stripPatternMarkers(pattern);
  return `grammar-${stableSlug(useful)}`;
}

export function kanjiId(character: string): string {
  return `kanji-${character}`;
}

export function isSingleKanji(value: string): boolean {
  return /^\p{Script=Han}$/u.test(value);
}

export function extractKanji(value: string): string[] {
  return [...new Set(Array.from(value).filter(isSingleKanji))];
}
