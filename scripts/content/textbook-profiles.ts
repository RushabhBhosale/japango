import { TEXTBOOKS } from "./config";

export interface TextbookLessonAnchor {
  lesson: number;
  startPage: number;
  headingStatus: "detected" | "inferred";
  grammarStartPage?: number;
}

export interface TextbookProfile {
  sourceFile: (typeof TEXTBOOKS)[number]["fileName"];
  sourceBook: (typeof TEXTBOOKS)[number]["displayName"];
  edition: string | null;
  levelBand: "N5" | "N4";
  contentEndPage: number;
  lessonAnchors: readonly TextbookLessonAnchor[];
}

function detected(
  lesson: number,
  startPage: number,
  grammarStartPage?: number,
): TextbookLessonAnchor {
  return { lesson, startPage, headingStatus: "detected", grammarStartPage };
}

function inferred(
  lesson: number,
  startPage: number,
  grammarStartPage?: number,
): TextbookLessonAnchor {
  return { lesson, startPage, headingStatus: "inferred", grammarStartPage };
}

/**
 * Page anchors are a reviewed manifest over the existing OCR cache. They are
 * deliberately explicit because arbitrary in-page lesson mentions occur in
 * contents pages, examples, indexes, and cross-references. Rebuilding content
 * must not replace these anchors with a carry-forward regex.
 */
export const TEXTBOOK_PROFILES: readonly TextbookProfile[] = [
  {
    sourceFile: "genki-1.pdf",
    sourceBook: "Genki I",
    edition: "Third Edition",
    levelBand: "N5",
    contentEndPage: 302,
    lessonAnchors: [
      detected(1, 44),
      detected(2, 64),
      detected(3, 90),
      detected(4, 110),
      detected(5, 136),
      detected(6, 154),
      detected(7, 174),
      detected(8, 194),
      detected(9, 218),
      detected(10, 238),
      detected(11, 262),
      detected(12, 280),
    ],
  },
  {
    sourceFile: "genki-2.pdf",
    sourceBook: "Genki II",
    edition: "Third Edition",
    levelBand: "N4",
    contentEndPage: 280,
    lessonAnchors: [
      detected(13, 30, 34),
      detected(14, 54, 58),
      detected(15, 78, 82),
      detected(16, 100, 104),
      detected(17, 122, 126),
      detected(18, 144, 148),
      detected(19, 168, 172),
      detected(20, 188, 192),
      detected(21, 214, 218),
      detected(22, 236, 240),
      detected(23, 258, 262),
    ],
  },
  {
    sourceFile: "minna-no-nihongo-1-grammer.pdf",
    sourceBook: "Minna no Nihongo I Grammar",
    edition: null,
    levelBand: "N5",
    contentEndPage: 181,
    lessonAnchors: Array.from({ length: 25 }, (_, index) => {
      const lesson = index + 1;
      const startPage = 32 + index * 6;
      return lesson === 11 || lesson === 12
        ? inferred(lesson, startPage, startPage + 4)
        : detected(lesson, startPage, startPage + 4);
    }),
  },
  {
    sourceFile: "minna-no-nihongo-1-textbook.pdf",
    sourceBook: "Minna no Nihongo I",
    edition: null,
    levelBand: "N5",
    contentEndPage: 235,
    lessonAnchors: [
      detected(1, 28),
      inferred(2, 36),
      detected(3, 44),
      detected(4, 52),
      detected(5, 60),
      detected(6, 68),
      detected(7, 78),
      detected(8, 86),
      detected(9, 94),
      detected(10, 102),
      detected(11, 110),
      detected(12, 118),
      detected(13, 126),
      detected(14, 136),
      detected(15, 144),
      detected(16, 152),
      detected(17, 160),
      detected(18, 168),
      detected(19, 176),
      detected(20, 186),
      detected(21, 194),
      detected(22, 202),
      detected(23, 212),
      detected(24, 220),
      detected(25, 228),
    ],
  },
  {
    sourceFile: "minna-no-nihongo-2-grammer.pdf",
    sourceBook: "Minna no Nihongo II Grammar",
    edition: null,
    levelBand: "N4",
    contentEndPage: 171,
    lessonAnchors: Array.from({ length: 25 }, (_, index) => {
      const lesson = index + 26;
      const startPage = 22 + index * 6;
      return detected(lesson, startPage, startPage + 4);
    }),
  },
  {
    sourceFile: "minna-no-nihongo-2-textbook.pdf",
    sourceBook: "Minna no Nihongo II",
    edition: null,
    levelBand: "N4",
    contentEndPage: 229,
    lessonAnchors: [
      detected(26, 20),
      detected(27, 28),
      detected(28, 36),
      detected(29, 44),
      detected(30, 52),
      detected(31, 62),
      inferred(32, 70),
      inferred(33, 80),
      inferred(34, 88),
      inferred(35, 96),
      inferred(36, 106),
      detected(37, 114),
      inferred(38, 122),
      detected(39, 130),
      detected(40, 138),
      inferred(41, 148),
      detected(42, 156),
      inferred(43, 164),
      detected(44, 172),
      detected(45, 180),
      detected(46, 190),
      inferred(47, 198),
      detected(48, 206),
      detected(49, 214),
      detected(50, 222),
    ],
  },
] as const;

export interface TextbookLessonWindow extends TextbookLessonAnchor {
  endPage: number;
}

export function lessonWindows(
  profile: TextbookProfile,
): TextbookLessonWindow[] {
  return profile.lessonAnchors.map((anchor, index) => ({
    ...anchor,
    endPage: profile.lessonAnchors[index + 1]
      ? profile.lessonAnchors[index + 1].startPage - 1
      : profile.contentEndPage,
  }));
}

export function lessonWindowForPage(
  profile: TextbookProfile,
  page: number,
): TextbookLessonWindow | null {
  return (
    lessonWindows(profile).find(
      (window) => page >= window.startPage && page <= window.endPage,
    ) ?? null
  );
}

export function textbookProfileForFile(
  sourceFile: string,
): TextbookProfile | null {
  return (
    TEXTBOOK_PROFILES.find((profile) => profile.sourceFile === sourceFile) ??
    null
  );
}
