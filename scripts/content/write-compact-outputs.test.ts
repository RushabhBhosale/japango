import { describe, expect, it } from "vitest";

import { makeValidContentBundle } from "./__fixtures__/content-bundle";
import { createCompactContentBundle } from "./write-compact-outputs";

describe("compact content separation", () => {
  it("keeps review content in development and excludes it from release", () => {
    const bundle = makeValidContentBundle();
    const development = createCompactContentBundle(bundle, {
      profile: "development",
      releaseReadyOnly: false,
    });
    const release = createCompactContentBundle(bundle, {
      profile: "release",
      releaseReadyOnly: true,
    });

    expect(development.profile).toBe("development");
    expect(development.releaseReadyOnly).toBe(false);
    expect(development.records.map(({ id }) => id)).toContain("grammar-desu");
    expect(development.curriculumUnits).toHaveLength(1);
    expect(release.profile).toBe("release");
    expect(release.releaseReadyOnly).toBe(true);
    expect(release.records.map(({ id }) => id)).not.toContain("grammar-desu");
    expect(release.curriculumUnits).toHaveLength(0);
    expect(release.records.every(({ releaseReady }) => releaseReady)).toBe(true);
    expect(release.learningContent).toEqual(development.learningContent);
    expect(release.learningContent.sentences).toEqual([]);
    expect(release.learningContent.questions).toEqual([]);
    expect(release.learningContent.learningItemMetadata).toEqual([]);
    expect(release.counts.learningContent).toEqual({
      sentences: 0,
      readingPassages: 0,
      listeningSpeakers: 0,
      listeningActivities: 0,
      grammarExampleViews: 0,
      vocabularyExampleViews: 0,
      kanjiExampleViews: 0,
      questions: 0,
      questionOptions: 0,
      learningItemMetadata: 0,
      questionTargetRelationships: 0,
    });
    expect(release.contentVersion).toMatch(/^2\.2\.0\+[a-f0-9]{12}$/u);
    expect(release.checksum).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("orders and checksums the same empty future sections deterministically", () => {
    const bundle = makeValidContentBundle();
    const first = createCompactContentBundle(bundle, {
      profile: "development",
      releaseReadyOnly: false,
    });
    const second = createCompactContentBundle(structuredClone(bundle), {
      profile: "development",
      releaseReadyOnly: false,
    });

    expect(second).toEqual(first);
  });

  it("keeps review-needed learning metadata in development only", () => {
    const bundle = makeValidContentBundle();
    bundle.learningContent.learningItemMetadata.push(
      {
        schemaVersion: 1,
        id: "learning-item-grammar-review-placeholder",
        itemType: "grammar",
        itemId: "grammar-desu",
        reviewable: true,
        skills: [],
        availableModes: [],
        estimatedReviewSeconds: null,
        tags: ["test-placeholder"],
        confidence: 0.5,
        needsReview: true,
        releaseReady: false,
      },
      {
        schemaVersion: 1,
        id: "learning-item-vocabulary-ready-placeholder",
        itemType: "vocabulary",
        itemId: "vocab-食べる-たべる",
        reviewable: true,
        skills: [],
        availableModes: [],
        estimatedReviewSeconds: null,
        tags: ["test-placeholder"],
        confidence: 0.95,
        needsReview: false,
        releaseReady: true,
      },
    );
    bundle.learningContent.learningItemMetadata.reverse();

    const development = createCompactContentBundle(bundle, {
      profile: "development",
      releaseReadyOnly: false,
    });
    const release = createCompactContentBundle(bundle, {
      profile: "release",
      releaseReadyOnly: true,
    });

    expect(
      development.learningContent.learningItemMetadata.map(({ id }) => id),
    ).toEqual([
      "learning-item-grammar-review-placeholder",
      "learning-item-vocabulary-ready-placeholder",
    ]);
    expect(release.learningContent.learningItemMetadata.map(({ id }) => id)).toEqual([
      "learning-item-vocabulary-ready-placeholder",
    ]);
  });
});
