export {
  lessonV2QuestionSchema,
  lessonV2ProgressSchema,
  lessonV2VersionSchema,
  structuredJapaneseTextSchema,
  type JapaneseToken,
  type LessonV2Progress,
  type LessonV2Explanation,
  type LessonV2Question,
  type LessonV2Section,
  type LessonV2ValidationIssue,
  type LessonV2Version,
  type StructuredJapaneseText,
} from '../../shared/lessons-v2/contract';

export type LessonsV2FuriganaMode = 'hidden' | 'always';

export interface LessonsV2WordAction {
  dependencyType: 'vocabulary' | 'kanji';
  dependencyId: string;
  isFavorite: boolean;
  markedForReview: boolean;
}
