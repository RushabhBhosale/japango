import type { VocabularyRecord } from "./schemas/content-schemas";
import type { JmdictSense } from "./types";

const PART_OF_SPEECH_LABELS: Readonly<Record<string, string>> = {
  "adj-i": "i-adjective",
  "adj-ix": "i-adjective",
  "adj-na": "na-adjective",
  adv: "adverb",
  aux: "auxiliary",
  "aux-v": "auxiliary-verb",
  conj: "conjunction",
  cop: "copula",
  ctr: "counter",
  exp: "expression",
  int: "interjection",
  n: "noun",
  "n-adv": "adverbial-noun",
  "n-pref": "prefix-noun",
  "n-suf": "suffix-noun",
  num: "numeric",
  pn: "pronoun",
  pref: "prefix",
  prt: "particle",
  suf: "suffix",
  v1: "ichidan-verb",
  "v1-s": "ichidan-verb",
  vi: "intransitive-verb",
  vt: "transitive-verb",
  vk: "kuru-verb",
  vs: "suru-verb",
  "vs-i": "suru-verb",
};

export function normalizePartOfSpeech(tags: readonly string[]): string[] {
  const output = tags.flatMap((tag) => {
    if (PART_OF_SPEECH_LABELS[tag]) {
      return [PART_OF_SPEECH_LABELS[tag]];
    }
    if (/^v5/u.test(tag)) {
      return ["godan-verb", tag];
    }
    if (/^(?:adj|v\d|v-unspec)/u.test(tag)) {
      return [tag];
    }
    return [];
  });
  return [...new Set(output)];
}

export function conjugationClass(tags: readonly string[]): string | null {
  if (tags.some((tag) => tag === "v1" || tag === "v1-s")) {
    return "ichidan";
  }
  if (tags.some((tag) => /^v5/u.test(tag))) {
    return "godan";
  }
  if (tags.some((tag) => tag === "vs" || tag === "vs-i")) {
    return "suru-irregular";
  }
  if (tags.includes("vk")) {
    return "kuru-irregular";
  }
  return null;
}

export function transitivity(
  tags: readonly string[],
): VocabularyRecord["transitivity"] {
  if (tags.includes("vt")) {
    return "transitive";
  }
  if (tags.includes("vi")) {
    return "intransitive";
  }
  return null;
}

export function normalizeSense(
  sense: JmdictSense,
): VocabularyRecord["senses"][number] {
  const partsOfSpeech = normalizePartOfSpeech(sense.tags);
  const consumedTags = new Set([
    ...Object.keys(PART_OF_SPEECH_LABELS),
    ...sense.tags.filter((tag) => /^v5/u.test(tag)),
  ]);
  return {
    definitions: sense.definitions,
    partsOfSpeech,
    fields: [],
    dialects: [],
    usageNotes: sense.tags.filter(
      (tag) => !consumedTags.has(tag) && !/^\d+$/u.test(tag),
    ),
    restrictions: [],
  };
}

