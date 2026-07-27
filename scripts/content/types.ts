export type TargetLevel = "N5" | "N4";

export interface JlptVocabularyCandidate {
  sourceRow: number;
  sourceId?: string;
  /**
   * Additional independent comparison evidence retained on the canonical
   * record. The primary sourceId identifies the local editorial source.
   */
  supportingSourceIds?: string[];
  written: string;
  reading: string;
  englishHint: string;
  level: TargetLevel;
}

export interface JlptKanjiCandidate {
  character: string;
  level: TargetLevel;
  sourceMetadata: Record<string, unknown>;
}

export interface GrammarCandidate {
  sourceRow: number;
  order: number;
  pattern: string;
  meaningLabel: string;
  level: TargetLevel;
}

export interface KanjidicEntry {
  character: string;
  meanings: string[];
  onReadings: string[];
  kunReadings: string[];
  nanori: string[];
  strokeCount: number | null;
  radicals: string[];
  grade: number | null;
  frequencyRank: number | null;
  legacyJlpt: number | null;
}

export interface KanjiVgEntry {
  character: string;
  svgPath: string;
  components: string[];
  elementIds: string[];
}

export interface JmdictSense {
  definitions: string[];
  tags: string[];
  score: number;
}

export interface JmdictMatch {
  sequence: number;
  written: string;
  reading: string;
  forms: string[];
  senses: JmdictSense[];
  common: boolean;
  matchMethod: "exact" | "normalized" | "kana-only" | "alternate-form";
}

export interface VocabularyMatchResult {
  candidate: JlptVocabularyCandidate;
  status: "matched" | "unmatched" | "ambiguous";
  matches: JmdictMatch[];
  reason: string;
}

export interface PdfInspection {
  fileName: string;
  displayName: string;
  sizeBytes: number;
  format: "PDF";
  pageCount: number | null;
  pageCountMethod: "pdfinfo" | "pdf-structure" | "unknown";
  title: string | null;
  author: string | null;
  producer: string | null;
  edition: string | null;
  textLayer: "usable" | "sparse" | "unavailable" | "unknown";
  extractedCharacters: number;
  japaneseCharacters: number;
  ocrRequired: boolean;
  verticalText: "detected" | "not-detected" | "unknown";
  multiColumn: "detected" | "not-detected" | "unknown";
  notes: string[];
}
