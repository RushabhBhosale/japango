import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseCsv, rowsToObjects } from "./csv";

const fixturePath = path.join(
  import.meta.dirname,
  "../__fixtures__/jlpt-vocabulary.csv",
);

describe("CSV source schema detection", () => {
  it("detects the supplied mapping headers and maps only named columns", async () => {
    const rows = parseCsv(await readFile(fixturePath, "utf8"));

    expect(rows[0]).toEqual([
      "Original",
      "Furigana",
      "English",
      "JLPT Level",
    ]);
    expect(rowsToObjects(rows)[1]).toEqual({
      Original: "お茶",
      Furigana: "おちゃ",
      English: "tea, green",
      "JLPT Level": "N4",
    });
  });

  it("handles escaped quotes, embedded newlines, CRLF, and blank records", () => {
    const rows = parseCsv(
      'id,label,notes\r\n1,"A, B","line one\nline two"\r\n2,"say ""yes""",ok\r\n,,\r\n',
    );

    expect(rowsToObjects(rows)).toEqual([
      { id: "1", label: "A, B", notes: "line one\nline two" },
      { id: "2", label: 'say "yes"', notes: "ok" },
    ]);
  });

  it("rejects an unterminated quoted field", () => {
    expect(() => parseCsv('id,label\n1,"unfinished')).toThrow(
      "Malformed CSV: unterminated quoted field",
    );
  });
});
