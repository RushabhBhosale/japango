import { createReadStream } from "node:fs";

import { CACHE_ROOT, SOURCE_PATHS } from "./config";
import { writeJson } from "./lib/fs-utils";
import {
  elementTexts,
  elementValuesWithAttributes,
  firstElementText,
} from "./lib/xml";
import type { KanjidicEntry } from "./types";

function numberOrNull(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseKanjidicCharacter(xml: string): KanjidicEntry {
  const character = firstElementText(xml, "literal") ?? "";
  const meanings = elementValuesWithAttributes(xml, "meaning")
    .filter(({ attributes }) => !attributes.m_lang || attributes.m_lang === "en")
    .map(({ value }) => value);
  const readings = elementValuesWithAttributes(xml, "reading");
  const radicals = elementValuesWithAttributes(xml, "rad_value")
    .map(({ attributes, value }) => `${attributes.rad_type ?? "unknown"}:${value}`);

  return {
    character,
    meanings: [...new Set(meanings)],
    onReadings: [
      ...new Set(
        readings
          .filter(({ attributes }) => attributes.r_type === "ja_on")
          .map(({ value }) => value),
      ),
    ],
    kunReadings: [
      ...new Set(
        readings
          .filter(({ attributes }) => attributes.r_type === "ja_kun")
          .map(({ value }) => value),
      ),
    ],
    nanori: [...new Set(elementTexts(xml, "nanori"))],
    strokeCount: numberOrNull(firstElementText(xml, "stroke_count")),
    radicals,
    grade: numberOrNull(firstElementText(xml, "grade")),
    frequencyRank: numberOrNull(firstElementText(xml, "freq")),
    legacyJlpt: numberOrNull(firstElementText(xml, "jlpt")),
  };
}

export async function parseKanjidic(
  targetCharacters?: ReadonlySet<string>,
): Promise<Map<string, KanjidicEntry>> {
  const output = new Map<string, KanjidicEntry>();
  const stream = createReadStream(SOURCE_PATHS.kanjidic, { encoding: "utf8" });
  let buffer = "";
  for await (const chunk of stream) {
    buffer += chunk;
    let start = buffer.indexOf("<character>");
    let end = buffer.indexOf("</character>", start);
    while (start >= 0 && end >= 0) {
      const characterXml = buffer.slice(start, end + "</character>".length);
      const parsed = parseKanjidicCharacter(characterXml);
      if (!targetCharacters || targetCharacters.has(parsed.character)) {
        output.set(parsed.character, parsed);
      }
      buffer = buffer.slice(end + "</character>".length);
      start = buffer.indexOf("<character>");
      end = buffer.indexOf("</character>", start);
    }
    if (start < 0 && buffer.length > 1_000_000) {
      buffer = buffer.slice(-128);
    } else if (start > 0) {
      buffer = buffer.slice(start);
    }
  }
  await writeJson(
    `${CACHE_ROOT}/normalized/kanjidic.json`,
    [...output.values()].sort((left, right) =>
      left.character.localeCompare(right.character, "ja"),
    ),
  );
  return output;
}

