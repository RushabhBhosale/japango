import { readFile } from "node:fs/promises";
import path from "node:path";

import { CACHE_ROOT, PROJECT_ROOT, SOURCE_PATHS } from "./config";
import { pathExists, relativePosix, writeJson } from "./lib/fs-utils";
import type { KanjiVgEntry } from "./types";

export function parseKanjiVgSvg(
  character: string,
  svg: string,
  svgPath: string,
): KanjiVgEntry {
  const componentGroups = Array.from(
    svg.matchAll(/<g\s+([^>]*kvg:element="[^"]+"[^>]*)>/gu),
    (match) => match[1],
  );
  const components: string[] = [];
  const elementIds: string[] = [];
  for (const attributes of componentGroups) {
    const element = attributes.match(/kvg:element="([^"]+)"/u)?.[1];
    const id = attributes.match(/\bid="([^"]+)"/u)?.[1];
    if (element && element !== character) {
      components.push(element);
    }
    if (id) {
      elementIds.push(id);
    }
  }
  return {
    character,
    svgPath,
    components: [...new Set(components)],
    elementIds: [...new Set(elementIds)],
  };
}

export async function parseKanjiVg(
  targetCharacters: ReadonlySet<string>,
): Promise<Map<string, KanjiVgEntry>> {
  const output = new Map<string, KanjiVgEntry>();
  for (const character of [...targetCharacters].sort((left, right) => left.localeCompare(right, "ja"))) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }
    const fileName = `${codePoint.toString(16).padStart(5, "0")}.svg`;
    const absolutePath = path.join(SOURCE_PATHS.kanjivg, fileName);
    if (!(await pathExists(absolutePath))) {
      continue;
    }
    const relativePath = relativePosix(PROJECT_ROOT, absolutePath);
    output.set(
      character,
      parseKanjiVgSvg(character, await readFile(absolutePath, "utf8"), relativePath),
    );
  }
  await writeJson(
    `${CACHE_ROOT}/normalized/kanjivg.json`,
    [...output.values()].sort((left, right) =>
      left.character.localeCompare(right.character, "ja"),
    ),
  );
  return output;
}

