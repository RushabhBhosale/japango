export interface OcrQuestionSourceChunk {
  id: string;
  sourcePath: string;
  content: string;
}

export type SourceQuestionQuality = 'verified' | 'needs_review' | 'corrupted' | 'rejected';

export interface ExtractedSourceQuestion {
  sourceChunkId: string;
  sourcePath: string;
  sourceTranscription: string;
  level?: 'N5' | 'N4';
  section?: 'vocabulary_kanji' | 'grammar' | 'reading' | 'listening';
  questionNumber?: string;
  sourceQuality: SourceQuestionQuality;
  warnings: string[];
}

function sectionFor(content: string): ExtractedSourceQuestion['section'] {
  if (/聴解|ちょうかい/u.test(content)) return 'listening';
  if (/読解|どっかい/u.test(content)) return 'reading';
  if (/文法|ぶんぽう/u.test(content)) return 'grammar';
  if (/文字・語彙|もじ・ごい/u.test(content)) return 'vocabulary_kanji';
  return undefined;
}

/** Raw transcription is stored byte-for-byte; normalized data is produced separately. */
export function extractSourceQuestion(chunk: OcrQuestionSourceChunk): ExtractedSourceQuestion | undefined {
  if (!/(?:もんだい|問題|问題|问题)/u.test(chunk.content)) return undefined;
  const warnings: string[] = [];
  if (/\[UNREADABLE TEXT\]|```markdown/u.test(chunk.content)) warnings.push('structural-ocr-corruption');
  if (/[问题]/u.test(chunk.content)) warnings.push('mixed-chinese-glyph');
  if (/micii|JLPt|リゥ|于|采/u.test(chunk.content)) warnings.push('suspect-ocr-token');
  const level = chunk.content.match(/\b(N[45])\b/u)?.[1] as 'N5' | 'N4' | undefined;
  const questionNumber = chunk.content.match(/(?:^|\n)\s*(\d{1,2})\s+/mu)?.[1];
  return {
    sourceChunkId: chunk.id,
    sourcePath: chunk.sourcePath,
    sourceTranscription: chunk.content,
    level,
    section: sectionFor(chunk.content),
    questionNumber,
    sourceQuality: warnings.length ? 'needs_review' : 'verified',
    warnings,
  };
}
