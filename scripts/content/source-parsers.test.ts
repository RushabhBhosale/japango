import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { JlptVocabularyCandidate } from "./types";

const fixtureRoot = path.join(import.meta.dirname, "__fixtures__");

let jmdict: typeof import("./parse-jmdict");
let kanjidic: typeof import("./parse-kanjidic");
let kanjiVg: typeof import("./parse-kanjivg");
let jlptVocabulary: typeof import("./parse-jlpt-vocabulary");
let jlptKanji: typeof import("./parse-jlpt-kanji");
let grammarSource: typeof import("./parse-grammar-source");

beforeAll(async () => {
  vi.doMock("./config", () => ({
    CACHE_ROOT: "/virtual-cache",
    PROJECT_ROOT: fixtureRoot,
    SOURCE_PATHS: {
      jmdict: path.join(fixtureRoot, "jmdict"),
      kanjidic: path.join(fixtureRoot, "kanjidic2.xml"),
      kanjivg: path.join(fixtureRoot, "kanjivg"),
      jlptVocabulary: path.join(fixtureRoot, "jlpt-vocabulary.csv"),
      jlptKanji: path.join(fixtureRoot, "jlpt-kanji.json"),
      grammar: path.join(fixtureRoot, "grammar.csv"),
    },
  }));
  vi.doMock("./lib/fs-utils", async () => {
    const actual = await vi.importActual<typeof import("./lib/fs-utils")>(
      "./lib/fs-utils",
    );
    return { ...actual, writeJson: vi.fn(async () => undefined) };
  });

  [jmdict, kanjidic, kanjiVg, jlptVocabulary, jlptKanji, grammarSource] =
    await Promise.all([
      import("./parse-jmdict"),
      import("./parse-kanjidic"),
      import("./parse-kanjivg"),
      import("./parse-jlpt-vocabulary"),
      import("./parse-jlpt-kanji"),
      import("./parse-grammar-source"),
    ]);
});

afterAll(() => {
  vi.doUnmock("./config");
  vi.doUnmock("./lib/fs-utils");
});

describe("fixture-sized JLPT and grammar mapping parsers", () => {
  it("maps only N5/N4 vocabulary and normalizes its canonical identity", async () => {
    await expect(jlptVocabulary.parseJlptVocabulary()).resolves.toEqual([
      {
        sourceRow: 3,
        written: "お茶",
        reading: "おちゃ",
        englishHint: "tea, green",
        level: "N4",
      },
      {
        sourceRow: 2,
        written: "食べる",
        reading: "たべる",
        englishHint: "to eat",
        level: "N5",
      },
    ]);
  });

  it("accepts only single-kanji keys with numeric N5/N4 mappings", async () => {
    const output = await jlptKanji.parseJlptKanji();
    const byCharacter = new Map(output.map((entry) => [entry.character, entry]));

    expect([...byCharacter.keys()].sort()).toEqual(["食", "飲"].sort());
    expect(byCharacter.get("食")).toMatchObject({
      character: "食",
      level: "N5",
      sourceMetadata: { jlpt: 5, strokes: 9 },
    });
    expect(byCharacter.get("飲")).toMatchObject({ character: "飲", level: "N4" });
  });

  it("normalizes grammar rows, skips blank patterns, and sorts source order", async () => {
    await expect(grammarSource.parseGrammarSource()).resolves.toEqual([
      {
        sourceRow: 3,
        order: 1,
        pattern: "です",
        meaningLabel: "Copula",
        level: "N5",
      },
      {
        sourceRow: 2,
        order: 2,
        pattern: "～てください・～て下さい",
        meaningLabel: "Polite request, please",
        level: "N5",
      },
    ]);
  });
});

describe("canonical kanji parsers", () => {
  it("streams only requested KANJIDIC2 characters and normalizes metadata", async () => {
    const output = await kanjidic.parseKanjidic(new Set(["食"]));

    expect([...output.keys()]).toEqual(["食"]);
    expect(output.get("食")).toEqual({
      character: "食",
      meanings: ["eat", "food"],
      onReadings: ["ショク"],
      kunReadings: ["た.べる"],
      nanori: ["じき"],
      strokeCount: 9,
      radicals: ["classical:184", "nelson_c:8"],
      grade: 2,
      frequencyRank: 328,
      legacyJlpt: 4,
    });
  });

  it("matches canonical unsuffixed KanjiVG files by Unicode code point", async () => {
    const output = await kanjiVg.parseKanjiVg(new Set(["食", "飲"]));

    expect([...output.keys()]).toEqual(["食"]);
    expect(output.get("食")).toEqual({
      character: "食",
      svgPath: "kanjivg/098df.svg",
      components: ["人", "良"],
      elementIds: [
        "kvg:StrokePaths_098df",
        "kvg:098df-g1",
        "kvg:098df-g2",
        "kvg:098df-g3",
      ],
    });
  });
});

describe("JMdict definition normalization and vocabulary matching", () => {
  it("extracts only structured glossary text, normalizes whitespace, and deduplicates", () => {
    expect(
      jmdict.extractJmdictDefinitions([
        "fallback text",
        {
          content: {
            data: { content: "glossary" },
            content: [" to eat ", { content: "to consume" }, "to eat"],
          },
        },
      ]),
    ).toEqual(["to eat", "to consume"]);
    expect(jmdict.extractJmdictDefinitions(["plain", "plain", 42])).toEqual([
      "plain",
    ]);
  });

  it("requires compatible form and reading while reporting alternate and ambiguous matches", async () => {
    const candidates: JlptVocabularyCandidate[] = [
      {
        sourceRow: 2,
        written: "食べる",
        reading: "たべる",
        englishHint: "to eat",
        level: "N5",
      },
      {
        sourceRow: 3,
        written: "喰べる",
        reading: "たべる",
        englishHint: "alternate spelling",
        level: "N5",
      },
      {
        sourceRow: 4,
        written: "こんびに",
        reading: "こんびに",
        englishHint: "convenience store",
        level: "N5",
      },
      {
        sourceRow: 5,
        written: "橋",
        reading: "はし",
        englishHint: "bridge",
        level: "N4",
      },
      {
        sourceRow: 6,
        written: "食べる",
        reading: "くう",
        englishHint: "wrong reading must not match by meaning",
        level: "N5",
      },
    ];

    const first = await jmdict.matchJmdictVocabulary(candidates);
    const second = await jmdict.matchJmdictVocabulary(candidates);

    expect(second).toEqual(first);
    expect(first[0]).toMatchObject({
      status: "matched",
      matches: [
        {
          sequence: 1358280,
          matchMethod: "exact",
          common: true,
          forms: ["食べる"],
          senses: [
            {
              definitions: ["to eat", "to consume"],
              tags: ["v1", "vt"],
            },
          ],
        },
      ],
    });
    expect(first[1].matches[0]?.matchMethod).toBe("alternate-form");
    expect(first[2].matches[0]?.matchMethod).toBe("kana-only");
    expect(first[3]).toMatchObject({
      status: "ambiguous",
      matches: [{ sequence: 2000001 }, { sequence: 2000002 }],
    });
    expect(first[4]).toMatchObject({ status: "unmatched", matches: [] });
  });
});
