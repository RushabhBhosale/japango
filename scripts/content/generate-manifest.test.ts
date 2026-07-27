import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("content manifest determinism regression", () => {
  it("keeps derived reports out of canonical output checksums", () => {
    const manifest = JSON.parse(readFileSync("assets/generated-content/content-manifest.json", "utf8")) as { reproducibleTimestamp: boolean; outputFileChecksums: Record<string, string> };
    expect(manifest.reproducibleTimestamp).toBe(true);
    expect(Object.keys(manifest.outputFileChecksums).every((path) => !path.startsWith("reports/"))).toBe(true);
  });
});
