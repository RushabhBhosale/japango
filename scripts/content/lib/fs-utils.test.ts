import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { sha256Text, writeJson } from "./fs-utils";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("deterministic serialization", () => {
  it("writes byte-identical pretty JSON with a trailing newline", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "japango-content-test-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "nested", "fixture.json");
    const value = {
      id: "vocab-食べる-たべる",
      readings: ["たべる"],
      metadata: { level: "N5", confidence: 0.99 },
    };

    await writeJson(filePath, value);
    const first = await readFile(filePath, "utf8");
    await writeJson(filePath, value);
    const second = await readFile(filePath, "utf8");

    expect(second).toBe(first);
    expect(first).toBe(`${JSON.stringify(value, null, 2)}\n`);
    expect(sha256Text(first)).toBe(sha256Text(second));
  });
});
