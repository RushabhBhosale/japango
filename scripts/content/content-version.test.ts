import { describe, expect, it } from "vitest";

import { contentVersionForSources, sourceFingerprint } from "./content-version";

const sources = [
  { id: "source-b", checksum: `sha256:${"b".repeat(64)}` },
  { id: "source-a", checksum: `sha256:${"a".repeat(64)}` },
] as const;

describe("generated content versioning", () => {
  it("is independent of source-registry input order", () => {
    expect(sourceFingerprint(sources)).toBe(
      sourceFingerprint([...sources].reverse()),
    );
    expect(contentVersionForSources(sources)).toMatch(/^2\.2\.0\+[a-f0-9]{12}$/u);
  });

  it("changes when a source checksum changes", () => {
    const changed = [
      sources[0],
      { ...sources[1], checksum: `sha256:${"c".repeat(64)}` },
    ];

    expect(sourceFingerprint(changed)).not.toBe(sourceFingerprint(sources));
  });
});
