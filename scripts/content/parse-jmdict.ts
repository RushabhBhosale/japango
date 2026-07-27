import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { CACHE_ROOT, SOURCE_PATHS } from "./config";
import { writeJson } from "./lib/fs-utils";
import {
  normalizeJapaneseForm,
  normalizeKana,
  stripPatternMarkers,
} from "./lib/text-utils";
import type {
  JlptVocabularyCandidate,
  JmdictMatch,
  JmdictSense,
  VocabularyMatchResult,
} from "./types";

type YomitanTermEntry = [
  term: string,
  reading: string,
  definitionTags: string,
  rules: string,
  score: number,
  glossary: unknown[],
  sequence: number,
  termTags: string,
];

interface CandidateState {
  candidate: JlptVocabularyCandidate;
  sequences: Map<number, JmdictMatch["matchMethod"]>;
}

function isYomitanTermEntry(value: unknown): value is YomitanTermEntry {
  return (
    Array.isArray(value) &&
    value.length >= 8 &&
    typeof value[0] === "string" &&
    typeof value[1] === "string" &&
    typeof value[2] === "string" &&
    typeof value[4] === "number" &&
    Array.isArray(value[5]) &&
    typeof value[6] === "number" &&
    typeof value[7] === "string"
  );
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function collectText(value: unknown): string[] {
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/gu, " ").trim();
    return normalized ? [normalized] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectText);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return collectText(record.content);
  }
  return [];
}

function collectGlossaryNodes(value: unknown, output: string[][]): void {
  if (Array.isArray(value)) {
    for (const child of value) {
      collectGlossaryNodes(child, output);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  const record = value as Record<string, unknown>;
  const data = record.data;
  if (
    data &&
    typeof data === "object" &&
    (data as Record<string, unknown>).content === "glossary"
  ) {
    const definitions = collectText(record.content);
    if (definitions.length > 0) {
      output.push(definitions);
    }
    return;
  }
  collectGlossaryNodes(record.content, output);
}

export function extractJmdictDefinitions(glossary: unknown[]): string[] {
  const groups: string[][] = [];
  collectGlossaryNodes(glossary, groups);
  if (groups.length > 0) {
    return unique(groups.flat());
  }
  return unique(glossary.filter((value): value is string => typeof value === "string"));
}

function formVariants(value: string): Set<string> {
  const normalized = normalizeJapaneseForm(value);
  const stripped = stripPatternMarkers(normalized);
  return new Set([normalized, stripped].filter(Boolean));
}

function readingVariants(value: string): Set<string> {
  const normalized = normalizeKana(value);
  const stripped = normalizeKana(stripPatternMarkers(value));
  return new Set([normalized, stripped].filter(Boolean));
}

function matchMethod(
  candidate: JlptVocabularyCandidate,
  term: string,
  reading: string,
): JmdictMatch["matchMethod"] | null {
  const normalizedTerm = normalizeJapaneseForm(term);
  const normalizedReading = normalizeKana(reading);
  if (term === candidate.written && normalizedReading === candidate.reading) {
    return "exact";
  }
  if (
    formVariants(candidate.written).has(normalizedTerm) &&
    readingVariants(candidate.reading).has(normalizedReading)
  ) {
    return "normalized";
  }
  if (
    normalizeKana(candidate.written) === candidate.reading &&
    normalizeKana(term) === normalizedReading &&
    normalizedReading === candidate.reading
  ) {
    return "kana-only";
  }
  return null;
}

function priority(method: JmdictMatch["matchMethod"]): number {
  return ["exact", "normalized", "kana-only", "alternate-form"].indexOf(method);
}

function selectBetterMethod(
  current: JmdictMatch["matchMethod"] | undefined,
  candidate: JmdictMatch["matchMethod"],
): JmdictMatch["matchMethod"] {
  return !current || priority(candidate) < priority(current) ? candidate : current;
}

function termBankNumber(fileName: string): number {
  return Number.parseInt(fileName.match(/\d+/u)?.[0] ?? "0", 10);
}

async function termBankFiles(): Promise<string[]> {
  return (await readdir(SOURCE_PATHS.jmdict))
    .filter((fileName) => /^term_bank_\d+\.json$/u.test(fileName))
    .sort((left, right) => termBankNumber(left) - termBankNumber(right));
}

async function readTermBank(fileName: string): Promise<YomitanTermEntry[]> {
  const parsed = JSON.parse(
    await readFile(path.join(SOURCE_PATHS.jmdict, fileName), "utf8"),
  ) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`JMdict term bank ${fileName} is not an array`);
  }
  const entries = parsed.filter(isYomitanTermEntry);
  if (entries.length !== parsed.length) {
    throw new Error(`JMdict term bank ${fileName} contains an unknown row schema`);
  }
  return entries;
}

function alternateForms(entry: YomitanTermEntry): string[] {
  if (!entry[2].split(/\s+/u).includes("forms")) {
    return [];
  }
  return entry[5].filter((value): value is string => typeof value === "string");
}

function buildSense(entry: YomitanTermEntry): JmdictSense | null {
  const definitions = extractJmdictDefinitions(entry[5]);
  if (definitions.length === 0) {
    return null;
  }
  return {
    definitions,
    tags: entry[2]
      .split(/\s+/u)
      .filter((tag) => tag && !/^\d+$/u.test(tag) && tag !== "forms"),
    score: entry[4],
  };
}

export async function matchJmdictVocabulary(
  candidates: readonly JlptVocabularyCandidate[],
): Promise<VocabularyMatchResult[]> {
  const states: CandidateState[] = candidates.map((candidate) => ({
    candidate,
    sequences: new Map(),
  }));
  const byReading = new Map<string, CandidateState[]>();
  for (const state of states) {
    for (const reading of readingVariants(state.candidate.reading)) {
      byReading.set(reading, [...(byReading.get(reading) ?? []), state]);
    }
  }

  const files = await termBankFiles();
  for (const fileName of files) {
    for (const entry of await readTermBank(fileName)) {
      if (entry[6] <= 0 || entry[6] >= 5_000_000) {
        continue;
      }
      const possible = byReading.get(normalizeKana(entry[1])) ?? [];
      if (possible.length === 0) {
        continue;
      }
      const forms = alternateForms(entry);
      for (const state of possible) {
        const direct = matchMethod(state.candidate, entry[0], entry[1]);
        if (direct) {
          state.sequences.set(
            entry[6],
            selectBetterMethod(state.sequences.get(entry[6]), direct),
          );
          continue;
        }
        if (
          forms.some((form) =>
            formVariants(state.candidate.written).has(normalizeJapaneseForm(form)),
          )
        ) {
          state.sequences.set(
            entry[6],
            selectBetterMethod(
              state.sequences.get(entry[6]),
              "alternate-form",
            ),
          );
        }
      }
    }
  }

  const wantedSequences = new Set(
    states.flatMap((state) => [...state.sequences.keys()]),
  );
  const rowsBySequence = new Map<number, YomitanTermEntry[]>();
  for (const fileName of files) {
    for (const entry of await readTermBank(fileName)) {
      if (entry[6] > 0 && entry[6] < 5_000_000 && wantedSequences.has(entry[6])) {
        rowsBySequence.set(entry[6], [
          ...(rowsBySequence.get(entry[6]) ?? []),
          entry,
        ]);
      }
    }
  }

  const results = states.map<VocabularyMatchResult>((state) => {
    const matches = [...state.sequences.entries()].flatMap(
      ([sequence, method]): JmdictMatch[] => {
        const rows = rowsBySequence.get(sequence) ?? [];
        const readingRows = rows.filter(
          (entry) =>
            normalizeKana(entry[1]) === state.candidate.reading &&
            !entry[2].split(/\s+/u).includes("forms"),
        );
        const senses = readingRows.flatMap((entry) => {
          const sense = buildSense(entry);
          return sense ? [sense] : [];
        });
        const uniqueSenses = Array.from(
          new Map(
            senses.map((sense) => [
              JSON.stringify([sense.definitions, sense.tags]),
              sense,
            ]),
          ).values(),
        );
        // A concrete sense tuple verifies this written-form/reading pairing.
        // Structured forms tables carry applicability flags whose legend is not
        // bundled, so they are used for candidate discovery but never flattened
        // into canonical written forms.
        const forms = unique(readingRows.map((entry) => entry[0])).filter(Boolean);
        if (uniqueSenses.length === 0) {
          return [];
        }
        const verifiedDisplayForm = readingRows.find((entry) =>
          formVariants(state.candidate.written).has(normalizeJapaneseForm(entry[0])),
        )?.[0];
        return [
          {
            sequence,
            written: verifiedDisplayForm ?? state.candidate.written,
            reading: state.candidate.reading,
            forms,
            senses: uniqueSenses,
            common: rows.some((entry) =>
              /(?:⭐|\bichi\b|\bnews\d*\b|\bspec\d*\b)/u.test(entry[7]),
            ),
            matchMethod: method,
          },
        ];
      },
    );
    matches.sort((left, right) => left.sequence - right.sequence);
    if (matches.length === 0) {
      return {
        candidate: state.candidate,
        status: "unmatched",
        matches,
        reason: "No JMdict entry matched both a verified form and reading.",
      };
    }
    if (matches.length > 1) {
      return {
        candidate: state.candidate,
        status: "ambiguous",
        matches,
        reason: "More than one JMdict sequence matched the same form and reading.",
      };
    }
    return {
      candidate: state.candidate,
      status: "matched",
      matches,
      reason: `Matched by ${matches[0].matchMethod}.`,
    };
  });

  await writeJson(`${CACHE_ROOT}/normalized/jmdict-matches.json`, results);
  return results;
}
