import { describe, expect, it, vi } from "vitest";

import type { GrammarCandidate } from "./types";

vi.mock("./config", () => ({ CACHE_ROOT: "/virtual-cache" }));
vi.mock("./lib/fs-utils", () => ({
  writeJson: vi.fn(async () => undefined),
}));

import { mergeGrammar } from "./merge-grammar";
import {
  grammarSemanticId,
  splitGrammarPattern,
} from "./normalize-grammar";

describe("grammar normalization", () => {
  it("splits the canonical pattern from dot-separated alternate forms", () => {
    expect(splitGrammarPattern("～てください・～て下さい・ ～てくれ")).toEqual({
      pattern: "～てください",
      alternates: ["～て下さい", "～てくれ"],
    });
  });

  it("adds a semantic title suffix only when a base pattern collides", () => {
    expect(grammarSemanticId("～そうです", "Hearsay / reported speech", false)).toBe(
      "grammar-soudesu",
    );
    expect(grammarSemanticId("～そうです", "Hearsay / reported speech", true)).toBe(
      "grammar-soudesu-hearsay-reported-speech",
    );
    expect(grammarSemanticId("～そうです", "Appearance", true)).toBe(
      "grammar-soudesu-appearance",
    );
  });
});

describe("grammar collision IDs", () => {
  const candidates: GrammarCandidate[] = [
    {
      sourceRow: 2,
      order: 1,
      pattern: "～そうです",
      meaningLabel: "Hearsay",
      level: "N5",
    },
    {
      sourceRow: 3,
      order: 2,
      pattern: "～そうです",
      meaningLabel: "Appearance",
      level: "N5",
    },
    {
      sourceRow: 4,
      order: 3,
      pattern: "～そうです",
      meaningLabel: "Hearsay",
      level: "N5",
    },
  ];

  it("resolves title and repeated-title collisions deterministically", async () => {
    const first = await mergeGrammar(candidates);
    const second = await mergeGrammar(candidates);

    expect(second).toEqual(first);
    expect(first.n5.map(({ id }) => id)).toEqual([
      "grammar-soudesu-pattern-そうです",
      "grammar-soudesu-pattern-そうです-2",
      "grammar-soudesu-pattern-そうです-3",
    ]);
    expect(first.duplicates).toHaveLength(3);
    expect(
      first.n5.every((record) => record.relatedGrammarIds.length === 2),
    ).toBe(true);
  });
});
