import { describe, expect, it } from 'vitest';

import {
  LEARNING_CONTENT_SCHEMA_VERSION,
  createEmptyLearningContentCollections,
  grammarExampleViewSchema,
  learningContentCollectionsSchema,
  learningItemMetadataSchema,
  questionOptionSchema,
  questionSchema,
  reviewQueueSchema,
  sentenceSchema,
} from './schemas';

// These values are structural contract fixtures only. They are deliberately
// placeholders and are not Japanese-learning or curriculum content.
const placeholderSentence = {
  schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION,
  id: 'sentence-test-placeholder',
  japanese: '[structural-placeholder]',
  reading: '[structural-placeholder]',
  english: 'Structural placeholder.',
  sentenceType: 'statement' as const,
  estimatedReadingSeconds: 1,
  register: 'neutral' as const,
  difficulty: { jlptLevel: null, rank: 1 },
  tags: ['test-placeholder'],
  context: {
    kind: 'standalone' as const,
    speaker: null,
    addressee: null,
    settingTags: [],
  },
  curriculumUnitIds: [],
  media: { audioAssetIds: [], imageAssetIds: [] },
  sourceIds: ['test-placeholder'],
  attribution: ['Structural test fixture.'],
  provenance: {
    sourceType: 'original-japango' as const,
    authoringMethod: 'original-editorial-authoring' as const,
  },
  reviewStatus: 'development-only' as const,
  usageNote: null,
  commonMistakeNote: null,
  futureQuestionSuitability: [],
  releaseBlockers: ['test-placeholder'],
  confidence: 0.5,
  needsReview: true,
  releaseReady: false,
};

const placeholderQuestion = {
  schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION,
  id: 'question-test-placeholder',
  domain: 'grammar' as const,
  presentation: 'multiple-choice' as const,
  prompt: { text: 'Structural placeholder prompt.', language: 'en' as const },
  stimulusReferences: [],
  explanation: null,
  difficulty: { jlptLevel: null, rank: 1 },
  examMetadata: null,
  usageContexts: ['assessment' as const],
  tags: ['test-placeholder'],
  sourceIds: ['test-placeholder'],
  attribution: ['Structural test fixture.'],
  confidence: 0.5,
  needsReview: true,
  releaseReady: false,
  responseType: 'single-select' as const,
  correctOptionIds: ['question-option-test-a'] as const,
};

const placeholderOptions = [
  {
    schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION,
    id: 'question-option-test-a',
    questionId: placeholderQuestion.id,
    position: 1,
    content: { type: 'text' as const, text: 'A', language: 'en' as const },
    feedback: null,
    confidence: 0.5,
    needsReview: true,
    releaseReady: false,
  },
  {
    schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION,
    id: 'question-option-test-b',
    questionId: placeholderQuestion.id,
    position: 2,
    content: { type: 'text' as const, text: 'B', language: 'en' as const },
    feedback: null,
    confidence: 0.5,
    needsReview: true,
    releaseReady: false,
  },
];

const placeholderTarget = {
  schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION,
  id: 'question-target-test-placeholder',
  questionId: placeholderQuestion.id,
  targetType: 'grammar' as const,
  targetId: 'grammar-test-placeholder',
  role: 'primary' as const,
  skill: 'form' as const,
  confidence: 0.5,
  needsReview: true,
  releaseReady: false,
};

describe('learning-content architecture schemas', () => {
  it('creates fresh, versioned empty collections without content records', () => {
    const first = createEmptyLearningContentCollections();
    const second = createEmptyLearningContentCollections();

    expect(first).toEqual({
      schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION,
      sentences: [],
      readingPassages: [],
      listeningSpeakers: [],
      listeningActivities: [],
      grammarExampleViews: [],
      vocabularyExampleViews: [],
      kanjiExampleViews: [],
      questions: [],
      questionOptions: [],
      learningItemMetadata: [],
      questionTargetRelationships: [],
    });
    expect(learningContentCollectionsSchema.safeParse(first).success).toBe(true);
    expect(first.sentences).not.toBe(second.sentences);
  });

  it('enforces stable sentence IDs and release-readiness invariants', () => {
    expect(sentenceSchema.safeParse(placeholderSentence).success).toBe(true);
    expect(
      sentenceSchema.safeParse({
        ...placeholderSentence,
        id: 'unstable-id',
      }).success,
    ).toBe(false);
    expect(
      sentenceSchema.safeParse({
        ...placeholderSentence,
        confidence: 0.5,
        needsReview: true,
        releaseReady: true,
      }).success,
    ).toBe(false);
  });

  it('keeps example views normalized and rejects duplicated sentence text', () => {
    const view = {
      schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION,
      id: 'grammar-example-test-placeholder',
      sentenceId: placeholderSentence.id,
      grammarId: 'grammar-test-placeholder',
      role: 'focus' as const,
      focusRanges: [{ startCodePoint: 0, endCodePoint: 1 }],
      note: null,
      confidence: 0.5,
      needsReview: true,
      releaseReady: false,
    };

    expect(grammarExampleViewSchema.safeParse(view).success).toBe(true);
    expect(
      grammarExampleViewSchema.safeParse({
        ...view,
        japanese: placeholderSentence.japanese,
      }).success,
    ).toBe(false);
  });

  it('uses discriminated question responses and normalized sentence options', () => {
    expect(questionSchema.safeParse(placeholderQuestion).success).toBe(true);
    expect(
      questionSchema.safeParse({
        ...placeholderQuestion,
        presentation: 'sentence-order',
      }).success,
    ).toBe(false);

    const sentenceReferenceOption = {
      ...placeholderOptions[0],
      content: {
        type: 'sentence-reference' as const,
        sentenceId: placeholderSentence.id,
      },
    };
    expect(questionOptionSchema.safeParse(sentenceReferenceOption).success).toBe(
      true,
    );
    expect(
      questionOptionSchema.safeParse({
        ...sentenceReferenceOption,
        content: {
          ...sentenceReferenceOption.content,
          text: placeholderSentence.japanese,
        },
      }).success,
    ).toBe(false);
  });

  it('parses every reusable response shape without a second question model', () => {
    const { correctOptionIds: _correctOptionIds, ...shared } =
      placeholderQuestion;

    expect(
      questionSchema.safeParse({
        ...shared,
        responseType: 'multiple-select',
        correctOptionIds: [
          'question-option-test-a',
          'question-option-test-b',
        ],
      }).success,
    ).toBe(true);
    expect(
      questionSchema.safeParse({
        ...shared,
        presentation: 'sentence-order',
        responseType: 'ordering',
        correctOptionIds: [
          'question-option-test-b',
          'question-option-test-a',
        ],
      }).success,
    ).toBe(true);
    expect(
      questionSchema.safeParse({
        ...shared,
        presentation: 'short-answer',
        responseType: 'text-input',
        acceptedAnswers: ['[structural-placeholder]'],
        answerNormalization: {
          trimWhitespace: true,
          caseSensitive: false,
          normalizeUnicode: true,
        },
      }).success,
    ).toBe(true);
  });

  it('keeps learning metadata generic and free of scheduling state', () => {
    const metadata = {
      schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION,
      id: 'learning-item-grammar-test-placeholder',
      itemType: 'grammar' as const,
      itemId: 'grammar-test-placeholder',
      reviewable: true,
      skills: ['form-recognition' as const],
      availableModes: ['quiz' as const],
      estimatedReviewSeconds: null,
      tags: ['test-placeholder'],
      confidence: 0.5,
      needsReview: true,
      releaseReady: false,
    };

    expect(learningItemMetadataSchema.safeParse(metadata).success).toBe(true);
    expect(
      learningItemMetadataSchema.safeParse({
        ...metadata,
        nextReviewAt: '2026-07-26T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('validates normalized references and deterministic option ordering', () => {
    const collections = {
      ...createEmptyLearningContentCollections(),
      sentences: [placeholderSentence],
      questions: [placeholderQuestion],
      questionOptions: placeholderOptions,
      questionTargetRelationships: [placeholderTarget],
    };

    expect(learningContentCollectionsSchema.safeParse(collections).success).toBe(
      true,
    );
    expect(
      learningContentCollectionsSchema.safeParse({
        ...collections,
        questionOptions: [...placeholderOptions].reverse(),
      }).success,
    ).toBe(false);
    expect(
      learningContentCollectionsSchema.safeParse({
        ...collections,
        sentences: [],
        grammarExampleViews: [
          {
            schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION,
            id: 'grammar-example-test-placeholder',
            sentenceId: placeholderSentence.id,
            grammarId: 'grammar-test-placeholder',
            role: 'focus',
            focusRanges: [{ startCodePoint: 0, endCodePoint: 1 }],
            note: null,
            confidence: 0.5,
            needsReview: true,
            releaseReady: false,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('keeps review queues versioned without implementing scheduling', () => {
    const queued = {
      schemaVersion: LEARNING_CONTENT_SCHEMA_VERSION,
      id: 'review-queue-test-placeholder',
      userId: 'test-user',
      learningItemMetadataId: 'learning-item-grammar-test-placeholder',
      reason: 'manual' as const,
      status: 'queued' as const,
      position: 0,
      sourceAttemptId: null,
      enqueuedAt: '2026-07-26T00:00:00.000Z',
      availableAt: null,
      completedAt: null,
      updatedAt: '2026-07-26T00:00:00.000Z',
    };

    expect(reviewQueueSchema.safeParse(queued).success).toBe(true);
    expect(
      reviewQueueSchema.safeParse({
        ...queued,
        status: 'completed',
      }).success,
    ).toBe(false);
  });
});
