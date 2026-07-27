import { z } from 'zod';

export const LEARNING_CONTENT_SCHEMA_VERSION = 1 as const;

const schemaVersionSchema = z.literal(LEARNING_CONTENT_SCHEMA_VERSION);
const confidenceSchema = z.number().min(0).max(1);

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueArray<T extends z.ZodType>(itemSchema: T) {
  return z.array(itemSchema).superRefine((values, context) => {
    const serialized = values.map((value) => JSON.stringify(value));
    if (new Set(serialized).size !== serialized.length) {
      context.addIssue({
        code: 'custom',
        message: 'Values must not contain duplicates.',
      });
    }
  });
}

function sortedUniqueStringArray<T extends z.ZodType<string>>(itemSchema: T) {
  return z.array(itemSchema).superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: 'custom',
        message: 'Values must not contain duplicates.',
      });
    }
    const sorted = [...values].sort(compareStable);
    if (values.some((value, index) => value !== sorted[index])) {
      context.addIssue({
        code: 'custom',
        message: 'Values must use deterministic lexical ordering.',
      });
    }
  });
}

const stableTagSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const tagsSchema = sortedUniqueStringArray(stableTagSchema);
const sourceIdsSchema = sortedUniqueStringArray(z.string().min(1)).min(1);

const lifecycleShape = {
  confidence: confidenceSchema,
  needsReview: z.boolean(),
  releaseReady: z.boolean(),
} as const;

function addReadinessIssue(
  value: { confidence: number; needsReview: boolean; releaseReady: boolean },
  context: z.RefinementCtx,
): void {
  if (value.releaseReady && value.needsReview) {
    context.addIssue({
      code: 'custom',
      path: ['releaseReady'],
      message: 'Release-ready content cannot require review.',
    });
  }
  if (value.releaseReady && value.confidence < 0.9) {
    context.addIssue({
      code: 'custom',
      path: ['confidence'],
      message: 'Release-ready content requires confidence of at least 0.9.',
    });
  }
}

const sentenceIdSchema = z
  .string()
  .regex(/^sentence-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const grammarIdSchema = z.string().regex(/^grammar-[^\s]+$/u);
const vocabularyIdSchema = z.string().regex(/^vocab-[^\s]+$/u);
const kanjiIdSchema = z.string().regex(/^kanji-[^\s]+$/u);
const questionIdSchema = z
  .string()
  .regex(/^question-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const questionOptionIdSchema = z
  .string()
  .regex(/^question-option-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const learningItemMetadataIdSchema = z
  .string()
  .regex(/^learning-item-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const curriculumUnitIdSchema = z.string().regex(/^n[45]-unit-\d{3}$/u);
const readingPassageIdSchema = z
  .string()
  .regex(/^reading-passage-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const listeningActivityIdSchema = z
  .string()
  .regex(/^listening-activity-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const listeningSpeakerIdSchema = z
  .string()
  .regex(/^listening-speaker-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const listeningTurnIdSchema = z
  .string()
  .regex(/^listening-turn-[a-z0-9]+(?:-[a-z0-9]+)*$/u);

export const textRangeSchema = z
  .object({
    startCodePoint: z.number().int().nonnegative(),
    endCodePoint: z.number().int().positive(),
  })
  .strict()
  .refine(
    ({ startCodePoint, endCodePoint }) => endCodePoint > startCodePoint,
    'A text range must end after it starts.',
  );

const difficultySchema = z
  .object({
    jlptLevel: z.enum(['N5', 'N4']).nullable(),
    rank: z.number().int().min(1).max(5),
  })
  .strict();

export const sentenceSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    id: sentenceIdSchema,
    japanese: z.string().min(1),
    reading: z.string().min(1),
    english: z.string().min(1),
    sentenceType: z.enum([
      'statement',
      'question',
      'request',
      'suggestion',
      'permission',
      'prohibition',
      'intention',
      'explanation',
      'reported-speech',
      'dialogue-turn',
    ]),
    estimatedReadingSeconds: z.number().int().positive(),
    register: z.enum([
      'neutral',
      'plain',
      'polite',
      'honorific',
      'humble',
      'mixed',
    ]),
    difficulty: difficultySchema,
    tags: tagsSchema,
    context: z
      .object({
        kind: z.enum([
          'standalone',
          'dialogue',
          'narrative',
          'notice',
          'instruction',
        ]),
        speaker: z.string().min(1).nullable(),
        addressee: z.string().min(1).nullable(),
        settingTags: tagsSchema,
      })
      .strict(),
    curriculumUnitIds: sortedUniqueStringArray(curriculumUnitIdSchema),
    media: z
      .object({
        audioAssetIds: sortedUniqueStringArray(
          z.string().regex(/^audio-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
        ),
        imageAssetIds: sortedUniqueStringArray(
          z.string().regex(/^image-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
        ),
      })
      .strict(),
    sourceIds: sourceIdsSchema,
    attribution: z.array(z.string().min(1)).min(1),
    provenance: z
      .object({
        sourceType: z.literal('original-japango'),
        authoringMethod: z.literal('original-editorial-authoring'),
      })
      .strict(),
    reviewStatus: z.enum(['approved', 'development-only', 'rejected']),
    usageNote: z.string().min(1).nullable(),
    commonMistakeNote: z.string().min(1).nullable(),
    futureQuestionSuitability: sortedUniqueStringArray(
      z.enum(['grammar-fill-blank']),
    ),
    releaseBlockers: sortedUniqueStringArray(stableTagSchema),
    ...lifecycleShape,
  })
  .strict()
  .superRefine((sentence, context) => {
    addReadinessIssue(sentence, context);
    if (sentence.releaseReady && sentence.reviewStatus !== 'approved') {
      context.addIssue({
        code: 'custom',
        path: ['reviewStatus'],
        message: 'Release-ready sentences must be approved.',
      });
    }
    if (sentence.releaseReady && sentence.releaseBlockers.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['releaseBlockers'],
        message: 'Release-ready sentences cannot have release blockers.',
      });
    }
    if (sentence.reviewStatus === 'rejected' && sentence.releaseReady) {
      context.addIssue({
        code: 'custom',
        path: ['releaseReady'],
        message: 'Rejected sentences cannot be release-ready.',
      });
    }
  });

const passageLineSchema = z
  .object({
    position: z.number().int().positive(),
    japanese: z.string().min(1),
    reading: z.string().min(1),
    english: z.string().min(1),
  })
  .strict();

export const readingPassageSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    id: readingPassageIdSchema,
    level: z.enum(['N5', 'N4']),
    passageType: z.enum(['short', 'medium', 'practical']),
    title: z.string().min(1).nullable(),
    japanese: z.string().min(1),
    reading: z.string().min(1),
    english: z.string().min(1),
    structuredContent: z
      .object({
        kind: z.enum([
          'notice',
          'schedule',
          'message',
          'email',
          'menu',
          'advertisement',
          'event-information',
          'transport-information',
          'store-notice',
          'school-announcement',
          'appointment-reminder',
          'instructions',
          'form',
          'building-sign',
          'weather-notice',
          'delivery-note',
        ]),
        lines: z.array(passageLineSchema).min(2),
      })
      .strict()
      .nullable(),
    glossary: z.array(
      z
        .object({
          term: z.string().min(1),
          reading: z.string().min(1),
          meaning: z.string().min(1),
          outOfLevel: z.boolean(),
        })
        .strict(),
    ),
    difficulty: difficultySchema,
    topicTags: tagsSchema.min(1),
    grammarIds: sortedUniqueStringArray(grammarIdSchema).min(1).max(3),
    vocabularyIds: sortedUniqueStringArray(vocabularyIdSchema),
    kanjiIds: sortedUniqueStringArray(kanjiIdSchema),
    curriculumUnitIds: sortedUniqueStringArray(curriculumUnitIdSchema).min(1),
    questionIds: sortedUniqueStringArray(questionIdSchema).min(3).max(5),
    estimatedReadingSeconds: z.number().int().positive(),
    sourceIds: sourceIdsSchema,
    attribution: z.array(z.string().min(1)).min(1),
    provenance: z
      .object({
        sourceType: z.literal('original-japango'),
        authoringMethod: z.literal('original-editorial-authoring'),
      })
      .strict(),
    reviewStatus: z.enum(['approved', 'development-only', 'rejected']),
    releaseBlockers: sortedUniqueStringArray(stableTagSchema),
    ...lifecycleShape,
  })
  .strict()
  .superRefine((passage, context) => {
    addReadinessIssue(passage, context);
    if (passage.difficulty.jlptLevel !== passage.level) {
      context.addIssue({ code: 'custom', path: ['difficulty'], message: 'Passage level and difficulty level must match.' });
    }
    if (passage.passageType === 'practical' && !passage.structuredContent) {
      context.addIssue({ code: 'custom', path: ['structuredContent'], message: 'Practical passages require structured content.' });
    }
    if (passage.passageType !== 'practical' && passage.structuredContent) {
      context.addIssue({ code: 'custom', path: ['structuredContent'], message: 'Only practical passages use structured content.' });
    }
    if (passage.releaseReady && passage.reviewStatus !== 'approved') {
      context.addIssue({ code: 'custom', path: ['reviewStatus'], message: 'Release-ready passages must be approved.' });
    }
    if (passage.releaseReady && passage.releaseBlockers.length > 0) {
      context.addIssue({ code: 'custom', path: ['releaseBlockers'], message: 'Release-ready passages cannot have release blockers.' });
    }
  });

export const listeningSpeakerSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    id: listeningSpeakerIdSchema,
    label: z.string().min(1),
    role: z.enum(['learner-peer', 'friend', 'family', 'teacher', 'coworker', 'customer', 'staff', 'announcer']),
    ageCategory: z.enum(['child', 'teen', 'adult', 'older-adult']).nullable(),
    speechStyle: z.enum(['neutral-polite', 'neutral-casual', 'customer-service-polite', 'teacher-to-student', 'coworker-neutral', 'family-casual', 'public-announcement']),
    voicePreference: z.object({ locale: z.literal('ja-JP'), gender: z.literal('unspecified'), voiceId: z.string().min(1).nullable() }).strict(),
    ...lifecycleShape,
  })
  .strict()
  .superRefine(addReadinessIssue);

const listeningTurnSchema = z
  .object({
    id: listeningTurnIdSchema,
    position: z.number().int().positive(),
    speakerId: listeningSpeakerIdSchema,
    displayText: z.string().min(1),
    speechNormalizedText: z.string().min(1),
    reading: z.string().min(1),
    english: z.string().min(1),
    pauseAfterMs: z.number().int().min(0).max(3000),
  })
  .strict();

export const listeningActivitySchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    id: listeningActivityIdSchema,
    level: z.enum(['N5', 'N4']),
    activityType: z.enum(['short-monologue', 'dialogue', 'practical-information', 'appropriate-response']),
    title: z.string().min(1),
    speakerIds: sortedUniqueStringArray(listeningSpeakerIdSchema).min(1),
    turns: z.array(listeningTurnSchema).min(1),
    transcript: z.string().min(1),
    learnerTranscript: z.string().min(1).nullable(),
    speechNormalizedTranscript: z.string().min(1),
    english: z.string().min(1),
    glossary: z.array(z.object({ term: z.string().min(1), reading: z.string().min(1), meaning: z.string().min(1), outOfLevel: z.boolean() }).strict()),
    difficulty: difficultySchema,
    topicTags: tagsSchema.min(1),
    grammarIds: sortedUniqueStringArray(grammarIdSchema).min(1).max(4),
    vocabularyIds: sortedUniqueStringArray(vocabularyIdSchema),
    kanjiIds: sortedUniqueStringArray(kanjiIdSchema),
    curriculumUnitIds: sortedUniqueStringArray(curriculumUnitIdSchema).min(1),
    questionIds: sortedUniqueStringArray(questionIdSchema).min(1).max(4),
    estimatedDurationSeconds: z.number().int().positive(),
    playback: z.object({ locale: z.literal('ja-JP'), learningRate: z.number().min(0.8).max(0.9), challengeRate: z.number().min(1).max(1.05), futureAudioKey: z.string().regex(/^audio-future-[a-z0-9]+(?:-[a-z0-9]+)*$/u) }).strict(),
    replay: z.object({ maxFirstAttemptReplays: z.number().int().min(1).max(2), hintAvailable: z.boolean(), transcriptUnlock: z.literal('after-answer'), slowPlaybackAvailable: z.boolean(), sentenceBySentenceReplay: z.boolean(), speakerIsolation: z.boolean() }).strict(),
    sourceIds: sourceIdsSchema,
    attribution: z.array(z.string().min(1)).min(1),
    provenance: z.object({ sourceType: z.literal('original-japango'), authoringMethod: z.literal('original-editorial-authoring') }).strict(),
    reviewStatus: z.enum(['approved', 'development-only', 'rejected']),
    releaseBlockers: sortedUniqueStringArray(stableTagSchema),
    ...lifecycleShape,
  })
  .strict()
  .superRefine((activity, context) => {
    addReadinessIssue(activity, context);
    if (activity.difficulty.jlptLevel !== activity.level) context.addIssue({ code: 'custom', path: ['difficulty'], message: 'Listening level and difficulty level must match.' });
    if (activity.turns.some(({ position }, index) => position !== index + 1)) context.addIssue({ code: 'custom', path: ['turns'], message: 'Speaker turns must use contiguous order.' });
    const speakers = new Set(activity.speakerIds);
    if (activity.turns.some(({ speakerId }) => !speakers.has(speakerId))) context.addIssue({ code: 'custom', path: ['turns'], message: 'Every turn speaker must belong to the activity.' });
    if (activity.activityType === 'appropriate-response' && activity.questionIds.length !== 1) context.addIssue({ code: 'custom', path: ['questionIds'], message: 'Appropriate-response activities require exactly one question.' });
    if (activity.releaseReady && (activity.reviewStatus !== 'approved' || activity.releaseBlockers.length > 0)) context.addIssue({ code: 'custom', path: ['releaseReady'], message: 'Release-ready listening content must be approved and unblocked.' });
  });

const exampleViewSharedShape = {
  schemaVersion: schemaVersionSchema,
  sentenceId: sentenceIdSchema,
  role: z.enum(['focus', 'supporting']),
  focusRanges: uniqueArray(textRangeSchema).min(1),
  note: z.string().min(1).nullable(),
  ...lifecycleShape,
} as const;

export const grammarExampleViewSchema = z
  .object({
    ...exampleViewSharedShape,
    id: z
      .string()
      .regex(/^grammar-example-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    grammarId: grammarIdSchema,
  })
  .strict()
  .superRefine(addReadinessIssue);

export const vocabularyExampleViewSchema = z
  .object({
    ...exampleViewSharedShape,
    id: z
      .string()
      .regex(/^vocabulary-example-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    vocabularyId: vocabularyIdSchema,
  })
  .strict()
  .superRefine(addReadinessIssue);

export const kanjiExampleViewSchema = z
  .object({
    ...exampleViewSharedShape,
    id: z.string().regex(/^kanji-example-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    kanjiId: kanjiIdSchema,
  })
  .strict()
  .superRefine(addReadinessIssue);

const questionDomainSchema = z.enum([
  'grammar',
  'vocabulary',
  'kanji',
  'reading',
  'listening',
]);

const questionPresentationSchema = z.enum([
  'multiple-choice',
  'choose-reading',
  'fill-blank',
  'sentence-order',
  'short-answer',
]);

const stimulusReferenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('sentence'), id: sentenceIdSchema }).strict(),
  z
    .object({
      type: z.literal('reading-passage'),
      id: readingPassageIdSchema,
    })
    .strict(),
  z.object({ type: z.literal('listening-activity'), id: listeningActivityIdSchema }).strict(),
  z
    .object({
      type: z.literal('audio'),
      id: z.string().regex(/^audio-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    })
    .strict(),
  z
    .object({
      type: z.literal('image'),
      id: z.string().regex(/^image-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    })
    .strict(),
]);

const questionSharedShape = {
  schemaVersion: schemaVersionSchema,
  id: questionIdSchema,
  domain: questionDomainSchema,
  presentation: questionPresentationSchema,
  prompt: z
    .object({
      text: z.string().min(1),
      language: z.enum(['ja', 'en', 'bilingual']),
    })
    .strict(),
  stimulusReferences: uniqueArray(stimulusReferenceSchema),
  explanation: z.string().min(1).nullable(),
  difficulty: difficultySchema,
  examMetadata: z
    .object({
      jlptLevel: z.enum(['N5', 'N4']),
      section: z.enum([
        'grammar',
        'vocabulary',
        'kanji',
        'reading',
        'listening',
      ]),
      formatCode: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
      recommendedSeconds: z.number().int().positive().nullable(),
    })
    .strict()
    .nullable(),
  usageContexts: sortedUniqueStringArray(
    z.enum(['lesson', 'review', 'assessment', 'mock-exam']),
  ).min(1),
  tags: tagsSchema,
  sourceIds: sourceIdsSchema,
  attribution: z.array(z.string().min(1)).min(1),
  ...lifecycleShape,
} as const;

const singleSelectQuestionSchema = z
  .object({
    ...questionSharedShape,
    responseType: z.literal('single-select'),
    correctOptionIds: z.tuple([questionOptionIdSchema]),
  })
  .strict()
  .superRefine(addReadinessIssue);

const multipleSelectQuestionSchema = z
  .object({
    ...questionSharedShape,
    responseType: z.literal('multiple-select'),
    correctOptionIds: sortedUniqueStringArray(questionOptionIdSchema).min(2),
  })
  .strict()
  .superRefine(addReadinessIssue);

const orderingQuestionSchema = z
  .object({
    ...questionSharedShape,
    responseType: z.literal('ordering'),
    correctOptionIds: uniqueArray(questionOptionIdSchema).min(2),
  })
  .strict()
  .superRefine(addReadinessIssue);

const textInputQuestionSchema = z
  .object({
    ...questionSharedShape,
    responseType: z.literal('text-input'),
    acceptedAnswers: uniqueArray(z.string().min(1)).min(1),
    answerNormalization: z
      .object({
        trimWhitespace: z.boolean(),
        caseSensitive: z.boolean(),
        normalizeUnicode: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine(addReadinessIssue);

export const questionSchema = z
  .discriminatedUnion('responseType', [
    singleSelectQuestionSchema,
    multipleSelectQuestionSchema,
    orderingQuestionSchema,
    textInputQuestionSchema,
  ])
  .superRefine((question, context) => {
    if (
      question.presentation === 'sentence-order' &&
      question.responseType !== 'ordering'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['responseType'],
        message: 'Sentence-order questions require an ordering response.',
      });
    }
    if (
      question.presentation === 'short-answer' &&
      question.responseType !== 'text-input'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['responseType'],
        message: 'Short-answer questions require a text-input response.',
      });
    }
  });

const optionContentSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('text'),
      text: z.string().min(1),
      language: z.enum(['ja', 'en', 'bilingual']),
    })
    .strict(),
  z
    .object({
      type: z.literal('sentence-reference'),
      sentenceId: sentenceIdSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('audio-reference'),
      audioAssetId: z
        .string()
        .regex(/^audio-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    })
    .strict(),
  z
    .object({
      type: z.literal('image-reference'),
      imageAssetId: z
        .string()
        .regex(/^image-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    })
    .strict(),
]);

export const questionOptionSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    id: questionOptionIdSchema,
    questionId: questionIdSchema,
    position: z.number().int().positive(),
    content: optionContentSchema,
    feedback: z.string().min(1).nullable(),
    ...lifecycleShape,
  })
  .strict()
  .superRefine(addReadinessIssue);

const learningSkillSchema = z.enum([
  'meaning-recognition',
  'form-recognition',
  'reading-recognition',
  'listening-recognition',
  'recall',
  'production',
  'contextual-usage',
]);

const learningItemMetadataSharedShape = {
  schemaVersion: schemaVersionSchema,
  id: learningItemMetadataIdSchema,
  reviewable: z.boolean(),
  skills: sortedUniqueStringArray(learningSkillSchema),
  availableModes: sortedUniqueStringArray(
    z.enum(['reading', 'listening', 'quiz', 'assessment']),
  ),
  estimatedReviewSeconds: z.number().int().positive().nullable(),
  tags: tagsSchema,
  ...lifecycleShape,
} as const;

export const learningItemMetadataSchema = z.discriminatedUnion('itemType', [
  z
    .object({
      ...learningItemMetadataSharedShape,
      itemType: z.literal('grammar'),
      itemId: grammarIdSchema,
    })
    .strict()
    .superRefine(addReadinessIssue),
  z
    .object({
      ...learningItemMetadataSharedShape,
      itemType: z.literal('vocabulary'),
      itemId: vocabularyIdSchema,
    })
    .strict()
    .superRefine(addReadinessIssue),
  z
    .object({
      ...learningItemMetadataSharedShape,
      itemType: z.literal('kanji'),
      itemId: kanjiIdSchema,
    })
    .strict()
    .superRefine(addReadinessIssue),
  z
    .object({
      ...learningItemMetadataSharedShape,
      itemType: z.literal('sentence'),
      itemId: sentenceIdSchema,
    })
    .strict()
    .superRefine(addReadinessIssue),
  z
    .object({
      ...learningItemMetadataSharedShape,
      itemType: z.literal('question'),
      itemId: questionIdSchema,
    })
    .strict()
    .superRefine(addReadinessIssue),
]);

const questionTargetSharedShape = {
  schemaVersion: schemaVersionSchema,
  id: z
    .string()
    .regex(/^question-target-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  questionId: questionIdSchema,
  role: z.enum(['primary', 'supporting', 'distractor-source']),
  skill: z.enum([
    'meaning',
    'reading',
    'form',
    'usage',
    'comprehension',
    'listening',
  ]),
  ...lifecycleShape,
} as const;

export const questionTargetRelationshipSchema = z.discriminatedUnion(
  'targetType',
  [
    z
      .object({
        ...questionTargetSharedShape,
        targetType: z.literal('grammar'),
        targetId: grammarIdSchema,
      })
      .strict()
      .superRefine(addReadinessIssue),
    z
      .object({
        ...questionTargetSharedShape,
        targetType: z.literal('vocabulary'),
        targetId: vocabularyIdSchema,
      })
      .strict()
      .superRefine(addReadinessIssue),
    z
      .object({
        ...questionTargetSharedShape,
        targetType: z.literal('kanji'),
        targetId: kanjiIdSchema,
      })
      .strict()
      .superRefine(addReadinessIssue),
    z
      .object({
        ...questionTargetSharedShape,
        targetType: z.literal('sentence'),
        targetId: sentenceIdSchema,
      })
      .strict()
      .superRefine(addReadinessIssue),
    z
      .object({
        ...questionTargetSharedShape,
        targetType: z.literal('reading-passage'),
        targetId: readingPassageIdSchema,
      })
      .strict()
      .superRefine(addReadinessIssue),
    z.object({ ...questionTargetSharedShape, targetType: z.literal('listening-activity'), targetId: listeningActivityIdSchema }).strict().superRefine(addReadinessIssue),
  ],
);

export const reviewQueueSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    id: z
      .string()
      .regex(/^review-queue-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    userId: z.string().min(1),
    learningItemMetadataId: learningItemMetadataIdSchema,
    reason: z.enum([
      'manual',
      'weak',
      'due',
      'lesson-followup',
      'assessment-followup',
    ]),
    status: z.enum(['queued', 'in-progress', 'completed', 'dismissed']),
    position: z.number().int().nonnegative(),
    sourceAttemptId: z.string().min(1).nullable(),
    enqueuedAt: z.string().datetime({ offset: true }),
    availableAt: z.string().datetime({ offset: true }).nullable(),
    completedAt: z.string().datetime({ offset: true }).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.status === 'completed' && !entry.completedAt) {
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: 'Completed review queue entries require completedAt.',
      });
    }
    if (entry.status !== 'completed' && entry.completedAt) {
      context.addIssue({
        code: 'custom',
        path: ['completedAt'],
        message: 'Only completed review queue entries may set completedAt.',
      });
    }
    if (Date.parse(entry.updatedAt) < Date.parse(entry.enqueuedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'updatedAt cannot precede enqueuedAt.',
      });
    }
  });

function recordId(record: { id: string }): string {
  return record.id;
}

function reportDuplicateIds(
  collections: readonly (readonly { id: string }[])[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  for (const records of collections) {
    for (const record of records) {
      if (seen.has(record.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate learning-content ID: ${record.id}`,
        });
      }
      seen.add(record.id);
    }
  }
}

function reportUnsortedIds(
  label: string,
  records: readonly { id: string }[],
  context: z.RefinementCtx,
): void {
  const ids = records.map(recordId);
  const sorted = [...ids].sort(compareStable);
  if (ids.some((id, index) => id !== sorted[index])) {
    context.addIssue({
      code: 'custom',
      path: [label],
      message: `${label} must be sorted by stable ID.`,
    });
  }
}

export const learningContentCollectionsSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    sentences: z.array(sentenceSchema),
    readingPassages: z.array(readingPassageSchema).default([]),
    listeningSpeakers: z.array(listeningSpeakerSchema).default([]),
    listeningActivities: z.array(listeningActivitySchema).default([]),
    grammarExampleViews: z.array(grammarExampleViewSchema),
    vocabularyExampleViews: z.array(vocabularyExampleViewSchema),
    kanjiExampleViews: z.array(kanjiExampleViewSchema),
    questions: z.array(questionSchema),
    questionOptions: z.array(questionOptionSchema),
    learningItemMetadata: z.array(learningItemMetadataSchema),
    questionTargetRelationships: z.array(questionTargetRelationshipSchema),
  })
  .strict()
  .superRefine((collections, context) => {
    const recordCollections = [
      collections.sentences,
      collections.readingPassages,
      collections.listeningSpeakers,
      collections.listeningActivities,
      collections.grammarExampleViews,
      collections.vocabularyExampleViews,
      collections.kanjiExampleViews,
      collections.questions,
      collections.questionOptions,
      collections.learningItemMetadata,
      collections.questionTargetRelationships,
    ] as const;
    reportDuplicateIds(recordCollections, context);
    for (const [label, records] of [
      ['sentences', collections.sentences],
      ['readingPassages', collections.readingPassages],
      ['listeningSpeakers', collections.listeningSpeakers],
      ['listeningActivities', collections.listeningActivities],
      ['grammarExampleViews', collections.grammarExampleViews],
      ['vocabularyExampleViews', collections.vocabularyExampleViews],
      ['kanjiExampleViews', collections.kanjiExampleViews],
      ['questions', collections.questions],
      ['learningItemMetadata', collections.learningItemMetadata],
      ['questionTargetRelationships', collections.questionTargetRelationships],
    ] as const) {
      reportUnsortedIds(label, records, context);
    }

    const sentenceById = new Map(
      collections.sentences.map((sentence) => [sentence.id, sentence]),
    );
    const questionById = new Map(
      collections.questions.map((question) => [question.id, question]),
    );
    const passageById = new Map(
      collections.readingPassages.map((passage) => [passage.id, passage]),
    );
    const listeningById = new Map(collections.listeningActivities.map((activity) => [activity.id, activity]));
    const speakerById = new Map(collections.listeningSpeakers.map((speaker) => [speaker.id, speaker]));
    const optionById = new Map(
      collections.questionOptions.map((option) => [option.id, option]),
    );

    for (const view of [
      ...collections.grammarExampleViews,
      ...collections.vocabularyExampleViews,
      ...collections.kanjiExampleViews,
    ]) {
      const sentence = sentenceById.get(view.sentenceId);
      if (!sentence) {
        context.addIssue({
          code: 'custom',
          message: `${view.id} references missing sentence ${view.sentenceId}.`,
        });
        continue;
      }
      const codePointLength = [...sentence.japanese].length;
      if (view.focusRanges.some(({ endCodePoint }) => endCodePoint > codePointLength)) {
        context.addIssue({
          code: 'custom',
          message: `${view.id} contains a focus range outside its sentence.`,
        });
      }
      if (view.releaseReady && !sentence.releaseReady) {
        context.addIssue({
          code: 'custom',
          message: `${view.id} is release-ready but its sentence is not.`,
        });
      }
    }

    const optionsByQuestion = new Map<string, typeof collections.questionOptions>();
    for (const option of collections.questionOptions) {
      const question = questionById.get(option.questionId);
      if (!question) {
        context.addIssue({
          code: 'custom',
          message: `${option.id} references missing question ${option.questionId}.`,
        });
      }
      optionsByQuestion.set(option.questionId, [
        ...(optionsByQuestion.get(option.questionId) ?? []),
        option,
      ]);
      if (
        option.content.type === 'sentence-reference' &&
        !sentenceById.has(option.content.sentenceId)
      ) {
        context.addIssue({
          code: 'custom',
          message: `${option.id} references missing sentence ${option.content.sentenceId}.`,
        });
      }
    }

    const expectedOptionOrder = [...collections.questionOptions].sort(
      (left, right) =>
        compareStable(left.questionId, right.questionId) ||
        left.position - right.position ||
        compareStable(left.id, right.id),
    );
    if (
      collections.questionOptions.some(
        (option, index) => option.id !== expectedOptionOrder[index]?.id,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['questionOptions'],
        message:
          'questionOptions must be sorted by question ID, position, and option ID.',
      });
    }

    for (const question of collections.questions) {
      const options = optionsByQuestion.get(question.id) ?? [];
      const positions = options.map(({ position }) => position).sort((a, b) => a - b);
      if (
        positions.some((position, index) => position !== index + 1) ||
        new Set(positions).size !== positions.length
      ) {
        context.addIssue({
          code: 'custom',
          message: `${question.id} options must use unique contiguous positions.`,
        });
      }
      if (question.responseType !== 'text-input') {
        for (const optionId of question.correctOptionIds) {
          const option = optionById.get(optionId);
          if (!option || option.questionId !== question.id) {
            context.addIssue({
              code: 'custom',
              message: `${question.id} references invalid answer option ${optionId}.`,
            });
          }
        }
      }
      for (const stimulus of question.stimulusReferences) {
        if (stimulus.type === 'sentence' && !sentenceById.has(stimulus.id)) {
          context.addIssue({
            code: 'custom',
            message: `${question.id} references missing sentence ${stimulus.id}.`,
          });
        } else if (stimulus.type === 'reading-passage' && !passageById.has(stimulus.id)) {
          context.addIssue({ code: 'custom', message: `${question.id} references missing reading passage ${stimulus.id}.` });
        } else if (stimulus.type === 'listening-activity' && !listeningById.has(stimulus.id)) context.addIssue({ code: 'custom', message: `${question.id} references missing listening activity ${stimulus.id}.` });
      }
      if (
        question.releaseReady &&
        options.some((option) => !option.releaseReady)
      ) {
        context.addIssue({
          code: 'custom',
          message: `${question.id} is release-ready but has a non-release option.`,
        });
      }
    }

    const metadataTargets = new Set<string>();
    for (const metadata of collections.learningItemMetadata) {
      const key = `${metadata.itemType}:${metadata.itemId}`;
      if (metadataTargets.has(key)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate learning metadata target: ${key}.`,
        });
      }
      metadataTargets.add(key);
      const internalTarget =
        metadata.itemType === 'sentence'
          ? sentenceById.get(metadata.itemId)
          : metadata.itemType === 'question'
            ? questionById.get(metadata.itemId)
            : undefined;
      if (
        (metadata.itemType === 'sentence' || metadata.itemType === 'question') &&
        !internalTarget
      ) {
        context.addIssue({
          code: 'custom',
          message: `${metadata.id} references missing ${metadata.itemType} ${metadata.itemId}.`,
        });
      }
      if (metadata.releaseReady && internalTarget && !internalTarget.releaseReady) {
        context.addIssue({
          code: 'custom',
          message: `${metadata.id} is release-ready but its target is not.`,
        });
      }
    }

    const primaryTargets = new Set<string>();
    for (const relationship of collections.questionTargetRelationships) {
      const question = questionById.get(relationship.questionId);
      if (!question) {
        context.addIssue({
          code: 'custom',
          message: `${relationship.id} references missing question ${relationship.questionId}.`,
        });
      }
      if (
        relationship.targetType === 'sentence' &&
        !sentenceById.has(relationship.targetId)
      ) {
        context.addIssue({
          code: 'custom',
          message: `${relationship.id} references missing sentence ${relationship.targetId}.`,
        });
      }
      if (
        relationship.targetType === 'reading-passage' &&
        !passageById.has(relationship.targetId)
      ) {
        context.addIssue({ code: 'custom', message: `${relationship.id} references missing reading passage ${relationship.targetId}.` });
      }
      if (relationship.targetType === 'listening-activity' && !listeningById.has(relationship.targetId)) context.addIssue({ code: 'custom', message: `${relationship.id} references missing listening activity ${relationship.targetId}.` });
      if (relationship.role === 'primary') {
        primaryTargets.add(relationship.questionId);
      }
      if (question?.releaseReady && !relationship.releaseReady) {
        context.addIssue({
          code: 'custom',
          message: `${question.id} is release-ready but has a non-release target relationship.`,
        });
      }
    }
    for (const question of collections.questions) {
      if (!primaryTargets.has(question.id)) {
        context.addIssue({
          code: 'custom',
          message: `${question.id} requires at least one primary target relationship.`,
        });
      }
    }
    for (const passage of collections.readingPassages) {
      for (const questionId of passage.questionIds) {
        const question = questionById.get(questionId);
        if (!question || question.domain !== 'reading') {
          context.addIssue({ code: 'custom', message: `${passage.id} references invalid reading question ${questionId}.` });
        }
        if (!question?.stimulusReferences.some(({ type, id }) => type === 'reading-passage' && id === passage.id)) {
          context.addIssue({ code: 'custom', message: `${questionId} does not point back to ${passage.id}.` });
        }
      }
    }
    for (const activity of collections.listeningActivities) {
      for (const speakerId of activity.speakerIds) if (!speakerById.has(speakerId)) context.addIssue({ code: 'custom', message: `${activity.id} references missing speaker ${speakerId}.` });
      for (const questionId of activity.questionIds) {
        const question = questionById.get(questionId);
        if (!question || question.domain !== 'listening') context.addIssue({ code: 'custom', message: `${activity.id} references invalid listening question ${questionId}.` });
        if (!question?.stimulusReferences.some(({ type, id }) => type === 'listening-activity' && id === activity.id)) context.addIssue({ code: 'custom', message: `${questionId} does not point back to ${activity.id}.` });
      }
    }
  });

export type TextRange = z.infer<typeof textRangeSchema>;
export type Sentence = z.infer<typeof sentenceSchema>;
export type ReadingPassage = z.infer<typeof readingPassageSchema>;
export type ListeningSpeaker = z.infer<typeof listeningSpeakerSchema>;
export type ListeningActivity = z.infer<typeof listeningActivitySchema>;
export type GrammarExampleView = z.infer<typeof grammarExampleViewSchema>;
export type VocabularyExampleView = z.infer<
  typeof vocabularyExampleViewSchema
>;
export type KanjiExampleView = z.infer<typeof kanjiExampleViewSchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionOption = z.infer<typeof questionOptionSchema>;
export type LearningItemMetadata = z.infer<
  typeof learningItemMetadataSchema
>;
export type QuestionTargetRelationship = z.infer<
  typeof questionTargetRelationshipSchema
>;
export type ReviewQueue = z.infer<typeof reviewQueueSchema>;
export type LearningContentCollections = z.infer<
  typeof learningContentCollectionsSchema
>;

export function createEmptyLearningContentCollections(): LearningContentCollections {
  return learningContentCollectionsSchema.parse({
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
}
