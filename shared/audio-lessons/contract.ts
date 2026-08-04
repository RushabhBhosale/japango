import { z } from 'zod';

import {
  lessonV2ExplanationSchema,
  lessonV2LevelSchema,
  lessonV2SourceReferenceSchema,
  lessonV2StatusSchema,
  structuredJapaneseTextSchema,
} from '../lessons-v2/contract';

const idSchema = z.string().trim().min(1).max(160);
const shortTextSchema = z.string().trim().min(1).max(600);
const isoDateSchema = z.string().datetime();

export const audioLessonTypeSchema = z.enum([
  'grammar_explanation',
  'vocabulary_review',
  'dialogue_practice',
  'sentence_pattern_drill',
  'listening_comprehension',
  'short_story',
  'jlpt_listening_practice',
  'lesson_summary',
  'kanji_in_context_review',
  'weak_topic_review',
  'mixed_review',
  'shadowing_practice',
]);

export const audioLessonModeSchema = z.enum([
  'japanese_english',
  'japanese_only',
  'slow_japanese',
  'normal_japanese',
  'shadowing',
  'review',
]);

export const audioSectionTypeSchema = z.enum([
  'introduction',
  'learning_goal',
  'vocabulary',
  'grammar_focus',
  'example',
  'dialogue',
  'passage',
  'drill',
  'shadowing',
  'listening_question',
  'answer',
  'explanation',
  'review',
  'closing',
]);

export const audioSpeakerSchema = z.object({
  id: idSchema,
  name: shortTextSchema,
  voice: z.string().trim().min(1).max(160).optional(),
  language: z.enum(['ja-JP', 'en-US', 'en-GB']).default('ja-JP'),
}).strict();

export const audioScriptSectionSchema = z.object({
  id: idSchema,
  sectionType: audioSectionTypeSchema,
  speaker: audioSpeakerSchema,
  language: z.enum(['japanese', 'english', 'bilingual']),
  /** Exact spoken text; never derive it from a display-only string. */
  text: z.string().trim().min(1).max(12000),
  structuredJapanese: structuredJapaneseTextSchema.optional(),
  transcript: z.string().trim().min(1).max(12000),
  pauseAfterMs: z.number().int().min(0).max(120_000).default(0),
  speakingRate: z.number().min(0.45).max(1.35).default(0.9),
  repeatCount: z.number().int().min(1).max(4).default(1),
  audioUrl: z.string().url().max(2000).optional(),
  audioStatus: z.enum(['pending', 'ready', 'failed', 'system_speech']).default('pending'),
  estimatedDurationMs: z.number().int().min(500).max(300_000),
  sourceReferences: z.array(lessonV2SourceReferenceSchema).max(12).default([]),
}).strict().superRefine((section, context) => {
  if (section.language === 'japanese' && !section.structuredJapanese) {
    context.addIssue({ code: 'custom', path: ['structuredJapanese'], message: 'Japanese script sections need structured Japanese text.' });
  }
  if (section.structuredJapanese && !section.text.includes(section.structuredJapanese.raw)) {
    context.addIssue({ code: 'custom', path: ['text'], message: 'The structured Japanese text must occur exactly in the spoken text.' });
  }
  if (section.audioStatus === 'ready' && !section.audioUrl) {
    context.addIssue({ code: 'custom', path: ['audioUrl'], message: 'Ready audio sections require an audio URL.' });
  }
});

export const audioListeningQuestionTypeSchema = z.enum([
  'meaning',
  'response',
  'detail',
  'intention',
  'next_action',
  'time_place_person_object',
  'dialogue_comprehension',
  'sentence_completion',
  'quick_response',
]);

const bilingualTextSchema = z.object({
  japanese: structuredJapaneseTextSchema.optional(),
  english: z.string().trim().min(1).max(2000).optional(),
}).strict().superRefine((value, context) => {
  if (!value.japanese && !value.english) context.addIssue({ code: 'custom', message: 'Text needs Japanese or English content.' });
});

export const audioListeningQuestionSchema = z.object({
  id: idSchema,
  type: audioListeningQuestionTypeSchema,
  prompt: bilingualTextSchema,
  referencedSectionIds: z.array(idSchema).min(1).max(12),
  thinkingPauseMs: z.number().int().min(2_000).max(30_000),
  choices: z.array(z.object({
    id: idSchema,
    label: bilingualTextSchema,
    isCorrect: z.boolean(),
  }).strict()).length(4),
  explanation: lessonV2ExplanationSchema,
  sourceReferences: z.array(lessonV2SourceReferenceSchema).min(1).max(12),
}).strict().superRefine((question, context) => {
  if (question.choices.filter((choice) => choice.isCorrect).length !== 1) {
    context.addIssue({ code: 'custom', path: ['choices'], message: 'Audio listening questions require exactly one best answer.' });
  }
  if (new Set(question.choices.map((choice) => JSON.stringify(choice.label))).size !== question.choices.length) {
    context.addIssue({ code: 'custom', path: ['choices'], message: 'Audio listening choices must be distinct.' });
  }
  const distractorIds = new Set(question.explanation.distractors.map((item) => item.choiceId));
  for (const choice of question.choices) if (!choice.isCorrect && !distractorIds.has(choice.id)) {
    context.addIssue({ code: 'custom', path: ['explanation', 'distractors'], message: `Missing a distractor explanation for ${choice.id}.` });
  }
});

export const audioGenerationMetadataSchema = z.object({
  generator: z.enum(['authored', 'deterministic_pipeline', 'ai_assisted']).default('authored'),
  model: z.string().trim().min(1).max(160).optional(),
  generatedAt: isoDateSchema,
  ttsProvider: z.string().trim().min(1).max(120).optional(),
  ttsModel: z.string().trim().min(1).max(160).optional(),
  sourceQuery: z.string().trim().min(1).max(500).optional(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
}).strict();

export const audioLessonVersionSchema = z.object({
  id: idSchema,
  lessonId: idSchema,
  version: z.number().int().positive(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  title: shortTextSchema,
  subtitle: z.string().trim().min(1).max(600),
  jlptLevel: lessonV2LevelSchema,
  difficulty: z.number().int().min(1).max(5),
  lessonType: audioLessonTypeSchema,
  estimatedMinutes: z.number().int().min(5).max(12),
  objectives: z.array(shortTextSchema).min(1).max(8),
  prerequisites: z.array(idSchema).max(20).default([]),
  relatedLessonIds: z.array(idSchema).max(30).default([]),
  vocabularyIds: z.array(idSchema).max(80).default([]),
  kanjiIds: z.array(idSchema).max(80).default([]),
  grammarIds: z.array(idSchema).max(40).default([]),
  modes: z.array(audioLessonModeSchema).min(1).max(6),
  scriptSections: z.array(audioScriptSectionSchema).min(6).max(120),
  listeningQuestions: z.array(audioListeningQuestionSchema).min(1).max(12),
  sourceReferences: z.array(lessonV2SourceReferenceSchema).min(1).max(40),
  generationMetadata: audioGenerationMetadataSchema,
  status: lessonV2StatusSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  publishedAt: isoDateSchema.optional(),
}).strict().superRefine((lesson, context) => {
  if (new Set(lesson.scriptSections.map((section) => section.id)).size !== lesson.scriptSections.length) {
    context.addIssue({ code: 'custom', path: ['scriptSections'], message: 'Audio script section IDs must be unique.' });
  }
  if (new Set(lesson.listeningQuestions.map((question) => question.id)).size !== lesson.listeningQuestions.length) {
    context.addIssue({ code: 'custom', path: ['listeningQuestions'], message: 'Audio listening question IDs must be unique.' });
  }
  const sectionIds = new Set(lesson.scriptSections.map((section) => section.id));
  for (const question of lesson.listeningQuestions) for (const sectionId of question.referencedSectionIds) if (!sectionIds.has(sectionId)) {
    context.addIssue({ code: 'custom', path: ['listeningQuestions'], message: `Question ${question.id} references an unknown script section.` });
  }
});

export const audioPlaylistSchema = z.object({
  id: idSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  title: shortTextSchema,
  description: z.string().trim().min(1).max(1000),
  jlptLevel: lessonV2LevelSchema.optional(),
  lessonType: audioLessonTypeSchema.optional(),
  lessonIds: z.array(idSchema).min(1).max(200),
  updatedAt: isoDateSchema,
}).strict();

export const audioLessonProgressSchema = z.object({
  lessonVersionId: idSchema,
  status: z.enum(['not_started', 'in_progress', 'completed']),
  playbackPositionMs: z.number().int().min(0),
  totalListenedMs: z.number().int().min(0),
  completionPercentage: z.number().min(0).max(100),
  lastPlayedAt: isoDateSchema.optional(),
  playbackSpeed: z.number().min(0.5).max(2),
  selectedMode: audioLessonModeSchema,
  completedQuestionIds: z.array(idSchema).default([]),
  correctQuestionIds: z.array(idSchema).default([]),
  updatedAt: isoDateSchema,
}).strict();

export type AudioLessonVersion = z.infer<typeof audioLessonVersionSchema>;
export type AudioLessonType = z.infer<typeof audioLessonTypeSchema>;
export type AudioLessonMode = z.infer<typeof audioLessonModeSchema>;
export type AudioScriptSection = z.infer<typeof audioScriptSectionSchema>;
export type AudioListeningQuestion = z.infer<typeof audioListeningQuestionSchema>;
export type AudioPlaylist = z.infer<typeof audioPlaylistSchema>;
export type AudioLessonProgress = z.infer<typeof audioLessonProgressSchema>;
