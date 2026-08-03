import type { LessonV2Question } from './contracts';

export interface JlptQuestionGenerationBrief {
  level: 'N5' | 'N4';
  lessonObjective: string;
  grammarIds: string[];
  vocabularyIds: string[];
  kanjiIds: string[];
  sourcePatternIds: string[];
  sourceChunkIds: string[];
}

/**
 * An AI/provider adapter may consume this brief later. Keeping it data-only
 * guarantees that generation cannot bypass dependency, similarity, or publish validation.
 */
export function createJlptQuestionGenerationBrief(input: JlptQuestionGenerationBrief): JlptQuestionGenerationBrief {
  return {
    ...input,
    grammarIds: [...new Set(input.grammarIds)],
    vocabularyIds: [...new Set(input.vocabularyIds)],
    kanjiIds: [...new Set(input.kanjiIds)],
    sourcePatternIds: [...new Set(input.sourcePatternIds)],
    sourceChunkIds: [...new Set(input.sourceChunkIds)],
  };
}

export function generatedQuestionMustRemainDraft(question: LessonV2Question): boolean {
  return question.validationStatus !== 'valid' || question.sourceReferences.length === 0;
}
