import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let parser: typeof import("./parse-jmdict");

beforeAll(async () => {
  const fixtureDirectory = path.join(
    import.meta.dirname,
    "__fixtures__/jmdict-invalid",
  );
  vi.doMock("./config", () => ({
    CACHE_ROOT: "/virtual-cache",
    SOURCE_PATHS: { jmdict: fixtureDirectory },
  }));
  parser = await import("./parse-jmdict");
});

afterAll(() => {
  vi.doUnmock("./config");
});

describe("Yomitan source schema detection", () => {
  it("rejects a term bank whose rows are not format-3 tuples", async () => {
    await expect(
      parser.matchJmdictVocabulary([
        {
          sourceRow: 2,
          written: "食べる",
          reading: "たべる",
          englishHint: "to eat",
          level: "N5",
        },
      ]),
    ).rejects.toThrow(
      "JMdict term bank term_bank_1.json contains an unknown row schema",
    );
  });
});
