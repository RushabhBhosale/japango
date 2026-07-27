import { readFile } from "node:fs/promises";

import { beforeAll, describe, expect, it } from "vitest";

import { makeValidContentBundle } from "./__fixtures__/content-bundle";
import { SOURCE_PATHS } from "./config";
import { mergeGrammar } from "./merge-grammar";
import {
  parseGrammarSource,
  parseReviewedN4GrammarSource,
  sortReviewedN4Grammar,
} from "./parse-grammar-source";
import {
  n4GrammarEditorialDecisionLedgerSchema,
  reviewedN4GrammarRecordSchema,
  reviewedN4GrammarSourceSchema,
  type ReviewedN4GrammarRecord,
} from "./schemas/content-schemas";
import {
  grammarPrerequisiteCycles,
  validateContentBundle,
} from "./validate-content";
import { createCompactContentBundle } from "./write-compact-outputs";

let reviewed: ReviewedN4GrammarRecord[];

beforeAll(async () => {
  reviewed = await parseReviewedN4GrammarSource();
});

function manualRegistryEntry() {
  return {
    id: "japango-n4-grammar-reviewed",
    displayName: "Fixture reviewed N4 grammar",
    localPath: "assets/docs-reference/japango-n4-grammar-reviewed.json",
    format: "UTF-8 JSON",
    version: "1",
    licence: "Fixture",
    attributionText: "Fixture manual curation.",
    redistributionNotes: "Fixture only.",
    role: "canonical" as const,
    parserVersion: "fixture",
    checksum: `sha256:${"0".repeat(64)}`,
  };
}

describe("reviewed N4 grammar source", () => {
  it("parses the exact wrapper and all stable reviewed IDs", async () => {
    const source = reviewedN4GrammarSourceSchema.parse(
      JSON.parse(
        await readFile(SOURCE_PATHS.reviewedN4Grammar, "utf8"),
      ) as unknown,
    );

    expect(source.grammar).toHaveLength(113);
    expect(source.grammar.every(({ id }) => /^grammar-n4-[a-z0-9-]+$/u.test(id))).toBe(
      true,
    );
    expect(new Set(source.grammar.map(({ id }) => id)).size).toBe(113);
    expect(
      source.grammar.filter(({ reviewStatus }) => reviewStatus === "approved"),
    ).toHaveLength(111);
    expect(
      source.grammar.filter(
        ({ reviewStatus }) => reviewStatus === "needs-more-review",
      ),
    ).toHaveLength(2);
    expect(
      source.grammar
        .filter(({ reviewStatus }) => reviewStatus === "needs-more-review")
        .every(({ needsReview, releaseReady }) => needsReview && !releaseReady),
    ).toBe(true);
  });

  it("rejects invalid types, empty meanings, and inconsistent approval flags", () => {
    const base = structuredClone(reviewed[0]);
    expect(
      reviewedN4GrammarRecordSchema.safeParse({
        ...base,
        contentType: "adverb",
      }).success,
    ).toBe(false);
    expect(
      reviewedN4GrammarRecordSchema.safeParse({ ...base, meanings: [] }).success,
    ).toBe(false);
    expect(
      reviewedN4GrammarRecordSchema.safeParse({
        ...base,
        releaseReady: false,
      }).success,
    ).toBe(false);
  });

  it("sorts equivalent input deterministically by the editorial contract", () => {
    const reversed = [...reviewed].reverse();
    expect(sortReviewedN4Grammar(reversed).map(({ id }) => id)).toEqual(
      reviewed.map(({ id }) => id),
    );
    expect(JSON.stringify(sortReviewedN4Grammar(reversed))).toBe(
      JSON.stringify(sortReviewedN4Grammar(reviewed)),
    );
  });

  it("merges variants but retains same-surface different meanings", () => {
    const mitai = reviewed.find(({ id }) => id === "grammar-n4-mitai-da");
    expect(mitai?.alternatePatterns).toEqual(["～みたいな", "～みたいに"]);
    expect(reviewed.some(({ id }) => id === "grammar-n4-mitai-na")).toBe(false);

    const sameSurfacePairs = [
      ["grammar-n4-souda-hearsay", "grammar-n4-souda-appearance"],
      ["grammar-n4-noni-contrast", "grammar-n4-noni-purpose"],
      ["grammar-n4-potential-form", "grammar-n4-passive-form"],
    ];
    for (const [leftId, rightId] of sameSurfacePairs) {
      const left = reviewed.find(({ id }) => id === leftId);
      const right = reviewed.find(({ id }) => id === rightId);
      expect(left?.normalizedPattern).toBe(right?.normalizedPattern);
      expect(left?.confusedWithGrammarIds).toContain(rightId);
      expect(right?.confusedWithGrammarIds).toContain(leftId);
    }
  });

  it("preserves every candidate decision and reconciled count", async () => {
    const ledger = n4GrammarEditorialDecisionLedgerSchema.parse(
      JSON.parse(
        await readFile(SOURCE_PATHS.n4GrammarEditorialDecisions, "utf8"),
      ) as unknown,
    );
    const count = (decision: (typeof ledger.decisions)[number]["decision"]) =>
      ledger.decisions.filter((item) => item.decision === decision).length;

    expect(ledger.decisions).toHaveLength(131);
    expect(count("approved")).toBe(105);
    expect(count("merged")).toBe(6);
    expect(count("rejected")).toBe(7);
    expect(count("moved-to-vocabulary")).toBe(11);
    expect(count("unresolved")).toBe(2);
    expect(ledger.manualAdditions).toHaveLength(6);
    expect(
      ledger.decisions.filter(
        ({ n5Overlap }) => n5Overlap.classification === "valid-n4-extension",
      ),
    ).toHaveLength(45);
  });
});

describe("N4 integration and validation", () => {
  it("merges the actual duplicate N5 permission record and never promotes OCR candidates", async () => {
    const merged = await mergeGrammar(await parseGrammarSource(), reviewed);

    expect(merged.n5).toHaveLength(124);
    expect(merged.n5.some(({ id }) => id === "grammar-verb-temoii")).toBe(false);
    expect(
      merged.n5.find(({ id }) => id === "grammar-temoii")?.alternatePatterns,
    ).toContain("Verb + てもいい");
    expect(merged.n4).toEqual(reviewed);
    expect(merged.n4.every(({ id }) => id.startsWith("grammar-n4-"))).toBe(true);
  });

  it("detects grammar cycles, missing relationships, and accidental N5 duplicates", async () => {
    const cycleA = {
      ...structuredClone(reviewed[0]),
      id: "grammar-n4-cycle-a",
      normalizedPattern: "cycle-a",
      pattern: "～cycle-a",
      curriculumOrder: 1,
      prerequisiteGrammarIds: ["grammar-n4-cycle-b"],
    };
    const cycleB = {
      ...structuredClone(reviewed[1]),
      id: "grammar-n4-cycle-b",
      normalizedPattern: "cycle-b",
      pattern: "～cycle-b",
      curriculumOrder: 2,
      prerequisiteGrammarIds: ["grammar-n4-cycle-a"],
    };
    expect(grammarPrerequisiteCycles([cycleA, cycleB])).toEqual([
      ["grammar-n4-cycle-a", "grammar-n4-cycle-b", "grammar-n4-cycle-a"],
    ]);

    const bundle = makeValidContentBundle();
    bundle.sourceRegistry.push(manualRegistryEntry());
    bundle.grammar.n4.push({
      ...structuredClone(reviewed[0]),
      id: "grammar-n4-desu-duplicate",
      pattern: "です",
      normalizedPattern: "です",
      relatedGrammarIds: ["grammar-missing"],
      curriculumOrder: 1,
    });
    const result = await validateContentBundle(bundle);
    expect(result.errors).toContain(
      "grammar-n4-desu-duplicate references missing grammar grammar-missing",
    );
    expect(result.errors).toContain(
      "grammar-n4-desu-duplicate duplicates an N5 surface without an explicit extension or semantic relationship",
    );
  });

  it("accepts an explicit N4 extension and includes approved N4 only in release", async () => {
    const bundle = makeValidContentBundle();
    bundle.sourceRegistry.push(manualRegistryEntry());
    const approved = {
      ...structuredClone(reviewed[0]),
      id: "grammar-n4-desu-extension",
      pattern: "です",
      normalizedPattern: "です",
      prerequisiteGrammarIds: ["grammar-desu"],
      relatedGrammarIds: [],
      confusedWithGrammarIds: [],
      extendsGrammarId: "grammar-desu",
      curriculumOrder: 1,
    };
    const unresolved = {
      ...structuredClone(reviewed[1]),
      id: "grammar-n4-unresolved-fixture",
      pattern: "～unresolved",
      normalizedPattern: "unresolved",
      prerequisiteGrammarIds: [],
      relatedGrammarIds: [],
      confusedWithGrammarIds: [],
      extendsGrammarId: null,
      reviewStatus: "needs-more-review" as const,
      needsReview: true,
      releaseReady: false,
      curriculumOrder: 2,
    };
    bundle.grammar.n4.push(approved, unresolved);

    const validation = await validateContentBundle(bundle);
    expect(validation.errors).toEqual([]);
    const development = createCompactContentBundle(bundle, {
      profile: "development",
      releaseReadyOnly: false,
    });
    const release = createCompactContentBundle(bundle, {
      profile: "release",
      releaseReadyOnly: true,
    });
    expect(development.records.map(({ id }) => id)).toContain(unresolved.id);
    expect(release.records.map(({ id }) => id)).toContain(approved.id);
    expect(release.records.map(({ id }) => id)).not.toContain(unresolved.id);
  });
});
