export type JapaneseSourceType =
  | 'textbook'
  | 'grammar'
  | 'workbook'
  | 'question-paper'
  | 'reference';

export interface JapaneseOcrFileMetadata {
  sourcePath: string;
  filename: string;
  book: string;
  volume: string | null;
  sourceType: JapaneseSourceType;
  pageNumber: number | null;
}

export interface JapaneseOcrChunk {
  chunkIndex: number;
  content: string;
  headingPath: string[];
  pageNumber: number | null;
}

export interface EmbeddedJapaneseOcrChunk extends JapaneseOcrChunk {
  chunkHash: string;
  embedding: number[];
}

export interface JapaneseSearchResult {
  chunkId: string;
  content: string;
  score: number;
  book: string;
  page: number | null;
  sourceType: JapaneseSourceType;
  filename: string;
}
