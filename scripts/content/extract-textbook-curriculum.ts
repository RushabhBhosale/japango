import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { CACHE_ROOT, OCR_CACHE_ROOT } from "./config";
import { pathExists, readJson, writeJson } from "./lib/fs-utils";
import { normalizeJapaneseForm } from "./lib/text-utils";
import type {
  GrammarRecord,
  KanjiRecord,
  TextbookCurriculumMapping,
  VocabularyRecord,
} from "./schemas/content-schemas";
import { lessonWindows, TEXTBOOK_PROFILES } from "./textbook-profiles";

export interface OcrCurriculumCandidate {
  sourceFile: string;
  pageNumber: number;
  detectedLesson: number;
  rawOcrCandidate: string;
  normalizedCandidate: string;
  matchStatus: "matched" | "ambiguous";
  matchedIds: string[];
  confidence: number;
  reviewReason: string | null;
}

function cacheSlug(fileName: string): string {
  return fileName.replace(/\.pdf$/iu, "");
}

function candidateTokens(text: string): string[] {
  return [
    ...new Set(
      Array.from(
        text.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}～・]{1,32}/gu),
        (match) => match[0],
      ),
    ),
  ];
}

function appendIndexValue(
  index: Map<string, string[]>,
  value: string,
  id: string,
): void {
  index.set(value, [...new Set([...(index.get(value) ?? []), id])]);
}

function isLegacyOcrCandidate(value: unknown): value is OcrCurriculumCandidate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<OcrCurriculumCandidate>;
  return (
    typeof candidate.sourceFile === "string" &&
    typeof candidate.pageNumber === "number" &&
    typeof candidate.detectedLesson === "number" &&
    typeof candidate.rawOcrCandidate === "string" &&
    typeof candidate.normalizedCandidate === "string" &&
    candidate.matchStatus === "ambiguous" &&
    Array.isArray(candidate.matchedIds)
  );
}

async function loadLegacyRawConflicts(): Promise<OcrCurriculumCandidate[] | null> {
  const cachePath = `${CACHE_ROOT}/ocr/curriculum-candidates.json`;
  if (!(await pathExists(cachePath))) return null;
  const values = await readJson<unknown>(cachePath);
  if (!Array.isArray(values)) return null;
  const conflicts = values.filter(isLegacyOcrCandidate);
  return conflicts.length > 0 ? conflicts : null;
}

export async function extractTextbookCurriculum(
  vocabulary: readonly VocabularyRecord[],
  kanji: readonly KanjiRecord[],
  grammar: readonly GrammarRecord[],
): Promise<{
  mappings: TextbookCurriculumMapping[];
  candidates: OcrCurriculumCandidate[];
  conflicts: unknown[];
}> {
  const valueToIds = new Map<string, string[]>();
  for (const record of vocabulary) {
    for (const form of record.writtenForms) {
      const normalized = normalizeJapaneseForm(form.text);
      appendIndexValue(valueToIds, normalized, record.id);
    }
  }
  for (const record of grammar) {
    for (const pattern of [record.pattern, ...record.alternatePatterns]) {
      const normalized = normalizeJapaneseForm(pattern);
      appendIndexValue(valueToIds, normalized, record.id);
    }
  }
  for (const record of kanji) {
    appendIndexValue(valueToIds, record.character, record.id);
  }

  const candidates: OcrCurriculumCandidate[] = [];
  const mappings: TextbookCurriculumMapping[] = [];
  const boundedConflicts: OcrCurriculumCandidate[] = [];

  for (const profile of TEXTBOOK_PROFILES) {
    const pagesPath = path.join(OCR_CACHE_ROOT, cacheSlug(profile.sourceFile), "pages");
    if (!(await pathExists(pagesPath))) {
      continue;
    }
    const pageFiles = (await readdir(pagesPath))
      .filter((fileName) => /^page-\d+\.txt$/u.test(fileName))
      .sort();
    const lessonCandidates = new Map<number, OcrCurriculumCandidate[]>();
    const windows = lessonWindows(profile);
    for (const pageFile of pageFiles) {
      const pageNumber = Number.parseInt(pageFile.match(/\d+/u)?.[0] ?? "0", 10);
      const window = windows.find(
        (candidateWindow) =>
          pageNumber >= candidateWindow.startPage &&
          pageNumber <= candidateWindow.endPage,
      );
      if (!window) continue;
      const text = await readFile(path.join(pagesPath, pageFile), "utf8");
      for (const rawToken of candidateTokens(text)) {
        const normalizedCandidate = normalizeJapaneseForm(rawToken);
        const matchedIds = [...new Set(valueToIds.get(normalizedCandidate) ?? [])];
        if (matchedIds.length === 0) {
          continue;
        }
        const matchStatus = matchedIds.length === 1 ? "matched" : "ambiguous";
        const candidate: OcrCurriculumCandidate = {
          sourceFile: profile.sourceFile,
          pageNumber,
          detectedLesson: window.lesson,
          rawOcrCandidate: rawToken,
          normalizedCandidate,
          matchStatus,
          matchedIds,
          confidence: matchStatus === "matched" ? 0.8 : 0.4,
          reviewReason:
            matchStatus === "matched"
              ? "OCR-derived placement requires visual page review."
              : "OCR token maps to multiple canonical records.",
        };
        candidates.push(candidate);
        lessonCandidates.set(window.lesson, [
          ...(lessonCandidates.get(window.lesson) ?? []),
          candidate,
        ]);
        if (matchStatus === "ambiguous") boundedConflicts.push(candidate);
      }
    }
    for (const window of windows) {
      const items = lessonCandidates.get(window.lesson) ?? [];
      const matchedIds = [...new Set(items.flatMap((item) => item.matchedIds))];
      const ambiguousCount = items.filter((item) => item.matchStatus !== "matched").length;
      mappings.push({
        sourceBook: profile.sourceBook,
        sourceFile: profile.sourceFile,
        edition: profile.edition,
        lesson: window.lesson,
        lessonStartPage: window.startPage,
        lessonEndPage: window.endPage,
        lessonHeadingStatus: window.headingStatus,
        sourcePages: [...new Set(items.map((item) => item.pageNumber))].sort((a, b) => a - b),
        grammarIds: matchedIds.filter((id) => id.startsWith("grammar-")).sort(),
        vocabularyIds: matchedIds.filter((id) => id.startsWith("vocab-")).sort(),
        kanjiIds: matchedIds.filter((id) => id.startsWith("kanji-")).sort(),
        canonicalHitOccurrences: items.length,
        unambiguousHitOccurrences: items.length - ambiguousCount,
        ambiguousHitOccurrences: ambiguousCount,
        confidence: window.headingStatus === "detected" ? 0.7 : 0.5,
        verifiedForSequencing: true,
        needsReview: true,
        releaseReady: false,
      });
    }
  }
  mappings.sort((left, right) =>
    left.sourceBook.localeCompare(right.sourceBook) || left.lesson - right.lesson,
  );
  await writeJson(`${CACHE_ROOT}/ocr/curriculum-candidates-bounded.json`, candidates);
  const conflicts = (await loadLegacyRawConflicts()) ?? boundedConflicts;
  return { mappings, candidates, conflicts };
}
