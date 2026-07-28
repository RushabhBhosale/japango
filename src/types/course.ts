import type { CurriculumItemType, MasteryStatus } from './learning';

export type CourseLevel = 'foundations' | 'N5' | 'N4';
export type CourseReferenceType = CurriculumItemType | 'vocabulary-question' | 'practice-question' | 'assessment-question';
export type CourseSectionKind =
  | 'introduction'
  | 'vocabulary'
  | 'grammar'
  | 'kanji'
  | 'dialogue'
  | 'listening'
  | 'reading'
  | 'practice'
  | 'checkpoint'
  | 'summary';
export type LessonActivityType =
  | 'introduction'
  | 'warm_up'
  | 'story'
  | 'vocabulary_intro'
  | 'vocabulary_practice'
  | 'grammar_explanation'
  | 'substitution_drill'
  | 'conjugation_drill'
  | 'sentence_transformation'
  | 'sentence_ordering'
  | 'sentence_production'
  | 'error_correction'
  | 'kanji_intro'
  | 'kanji_practice'
  | 'dialogue'
  | 'reading'
  | 'timed_reading'
  | 'listening'
  | 'dictation'
  | 'shadowing'
  | 'mixed_practice'
  | 'checkpoint'
  | 'reflection';
export type LessonActivityResponseKind = 'continue' | 'select' | 'typed' | 'production';
export type LessonExperienceTemplate =
  | 'conversation_first'
  | 'pattern_workshop'
  | 'reading_first'
  | 'situation_challenge'
  | 'story_chapter'
  | 'review_workshop';
export type ExpectedJapaneseScript = 'hiragana' | 'katakana' | 'kanji_or_kana' | 'japanese_sentence' | 'choice' | 'none';
export type ExpectedPoliteness = 'polite' | 'casual' | 'either';
export type VerbFormId = 'masu' | 'dictionary' | 'nai' | 'past' | 'te' | 'potential' | 'volitional' | 'tara' | 'nara' | 'ba' | 'passive' | 'causative' | 'causative_passive';
export type AdjectiveFormId = 'i_present_negative' | 'i_past' | 'i_past_negative' | 'na_present_negative' | 'na_past' | 'na_past_negative' | 'noun_past' | 'noun_past_negative';
export type CourseLessonState =
  | 'locked'
  | 'available'
  | 'in_progress'
  | 'needs_review'
  | 'completed'
  | 'strong'
  | 'skipped_by_placement';

export interface CourseDefinition {
  id: string;
  level: CourseLevel;
  title: string;
  description: string;
  manifestVersion: number;
  units: CourseUnitDefinition[];
}

export interface CourseUnitDefinition {
  id: string;
  order: number;
  title: string;
  goal: string;
  lessons: CourseLessonDefinition[];
}

export interface CourseLessonDefinition {
  id: string;
  order: number;
  number: number;
  /** Curriculum difficulty used inside a course. Foundations deliberately teaches N5 material. */
  contentLevel: 'N5' | 'N4';
  title: string;
  theme: string;
  communicationGoal: string;
  objectives: string[];
  patternObjectives: string[];
  estimatedMinutes: number;
  kind?: 'lesson' | 'workshop';
  depthException?: 'kana' | 'focused-workshop' | 'final-review';
  depthExceptionReason?: string;
  prerequisiteLessonIds: string[];
  vocabularyIds: string[];
  grammarIds: string[];
  kanjiIds: string[];
  readingIds: string[];
  listeningIds: string[];
  vocabularyQuestionIds: string[];
  practiceQuestionIds: string[];
  assessmentQuestionIds: string[];
  verbForms: VerbFormId[];
  adjectiveForms: AdjectiveFormId[];
  experience: LessonExperienceConfig;
  activities: LessonActivityDefinition[];
  sections: CourseSectionDefinition[];
}

export interface LessonExperienceConfig {
  template: LessonExperienceTemplate;
  primarySkill: string;
  sectionOrder: string[];
  feedbackStyle: 'concise' | 'instructional';
  allowOptionalSpeaking: boolean;
  showFullOverviewAtStart: boolean;
  transitionStyle: 'minimal' | 'story' | 'workbook';
}

export interface LessonActivityExercise {
  id: string;
  responseKind: LessonActivityResponseKind;
  category: 'vocabulary' | 'grammar' | 'conjugation' | 'kanji' | 'reading' | 'listening' | 'production';
  prompt: string;
  itemId?: string;
  options?: { id: string; label: string }[];
  acceptedAnswers?: string[];
  explanation?: string;
  readingText?: string;
  listeningText?: string;
  secondsTarget?: number;
  optional?: boolean;
  /** A learner-facing format promise shown directly above the response control. */
  expectedResponse?: {
    script: ExpectedJapaneseScript;
    politeness?: ExpectedPoliteness;
    format?: string;
  };
  /** Hints are intentionally authored as a small progression, not generated at runtime. */
  hints?: [string, string, string?];
  correctReinforcement?: string;
}

export interface LessonActivityDefinition {
  id: string;
  order: number;
  type: LessonActivityType;
  title: string;
  instruction: string;
  estimatedMinutes: number;
  required: boolean;
  interactionCount: number;
  contentRefs: string[];
  exercises: LessonActivityExercise[];
}

export interface CourseSectionDefinition {
  id: string;
  order: number;
  kind: CourseSectionKind;
  title: string;
  instruction: string;
  estimatedMinutes: number;
}

export interface CourseManifest {
  schemaVersion: 1;
  hash: string;
  courses: CourseDefinition[];
  supplementalItemIds: string[];
}

export interface CourseLessonProgress {
  lessonId: string;
  state: CourseLessonState;
  currentSectionId?: string;
  completedSectionIds: string[];
  bestCheckpointScore?: number;
  latestCheckpointScore?: number;
  startedAt?: string;
  completedAt?: string;
  timeSpentSeconds: number;
  placedByAssessment: boolean;
}

export interface CourseLessonActivityProgress {
  activityId: string;
  currentInteractionIndex: number;
  completedAt?: string;
  timeSpentSeconds: number;
}

export interface CourseLessonActivitySummary extends LessonActivityDefinition {
  progress: CourseLessonActivityProgress;
}

export interface GuidedCourseLesson {
  lesson: CourseLessonSummary;
  activities: CourseLessonActivitySummary[];
  currentActivity?: CourseLessonActivitySummary;
}

export interface CourseActivitySubmission {
  activityId: string;
  response?: string;
  responseTimeMs?: number;
  hintLevel?: number;
  continueAfterTeaching?: boolean;
}

export type CourseAnswerFeedbackKind = 'correct' | 'partial' | 'incorrect' | 'teaching';

export interface CourseAnswerFeedback {
  kind: CourseAnswerFeedbackKind;
  title: string;
  learnerAnswer?: string;
  acceptedAnswer?: string;
  explanation: string;
  hint?: string;
  hintLevel: number;
  canRetry: boolean;
  canContinue: boolean;
  scheduleForReview: boolean;
}

export interface CourseActivitySubmissionResult {
  correct: boolean;
  explanation?: string;
  feedback?: CourseAnswerFeedback;
  lesson: GuidedCourseLesson;
}

export interface CourseLessonAnalytics {
  firstAttemptAccuracy?: number;
  correctedAccuracy?: number;
  transformationAccuracy?: number;
  conjugationAccuracy?: number;
  readingAccuracy?: number;
  listeningAccuracy?: number;
  productionAttempts: number;
}

export interface CourseLessonSummary extends CourseLessonDefinition {
  courseId: string;
  unitId: string;
  unitOrder: number;
  progress: CourseLessonProgress;
  prerequisiteState: 'met' | 'unmet' | 'browsable';
}

export interface CourseHomeData {
  course: Pick<CourseDefinition, 'id' | 'level' | 'title' | 'description'>;
  units: (Pick<CourseUnitDefinition, 'id' | 'order' | 'title' | 'goal'> & { lessons: CourseLessonSummary[]; reviewAvailable: boolean; reviewCompleted: boolean })[];
  currentLesson?: CourseLessonSummary;
  totalProgress: number;
  reviewDueCount: number;
  estimatedRemainingMinutes: number;
}

export interface CourseQuestion {
  id: string;
  itemId: string;
  type: CourseReferenceType;
  domain: CurriculumItemType;
  prompt: string;
  explanation?: string;
  correctOptionId: string;
  options: { id: string; label: string }[];
}

export interface CourseCheckpointResult {
  score: number;
  classification: 'needs_review' | 'developing' | 'passed' | 'strong';
  byDomain: Partial<Record<CurriculumItemType, { correct: number; total: number; score: number }>>;
  weakItemIds: string[];
}

export interface CoursePlacementRecommendation {
  courseId: string;
  unitId: string;
  lessonId: string;
  reason: string;
}

export interface CourseItemUsage {
  introducedIn?: { lessonId: string; lessonNumber: number; title: string };
  usedIn: { lessonId: string; lessonNumber: number; title: string }[];
  mastery?: MasteryStatus;
}
