import { createHash } from 'node:crypto';

import { z } from 'zod';

// The deployed backend has its own copy so Vercel's backend-only install does
// not need to resolve dependencies from the mobile project's shared directory.
export * from '../shared-contracts/lessons-v2';
export { lessonV2QuestionSchema, lessonV2VersionSchema } from '../shared-contracts/lessons-v2';

import { lessonV2LevelSchema, lessonV2QuestionSchema, lessonV2SectionSchema, lessonV2SourceReferenceSchema } from '../shared-contracts/lessons-v2';

export const lessonV2DraftInputSchema = z.object({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  level: lessonV2LevelSchema,
  title: z.string().trim().min(1).max(240),
  objectives: z.array(z.string().trim().min(1).max(600)).min(1).max(12),
  estimatedMinutes: z.number().int().min(1).max(120),
  sections: z.array(lessonV2SectionSchema).min(1).max(20),
  sourceReferences: z.array(lessonV2SourceReferenceSchema).max(40).default([]),
}).strict();

export const lessonV2UpdateDraftInputSchema = lessonV2DraftInputSchema.omit({ slug: true }).partial().extend({
  status: z.enum(['draft', 'review']).optional(),
}).strict();

export const resolveDependenciesInputSchema = z.object({
  vocabulary: z.array(z.object({
    level: lessonV2LevelSchema,
    written: z.string().trim().min(1).max(160),
    reading: z.string().trim().min(1).max(180),
    meaning: z.string().trim().min(1).max(600),
    partOfSpeech: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
  }).strict()).max(80).default([]),
  kanji: z.array(z.object({
    level: lessonV2LevelSchema,
    character: z.string().regex(/^[\u3400-\u9fff]$/u),
    meanings: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
    readings: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
  }).strict()).max(80).default([]),
}).strict();

const lessonGenerationTargetGrammarSchema = z.array(z.object({
  id: z.string().trim().min(1).max(160),
  pattern: z.string().trim().min(1).max(200),
  meaning: z.string().trim().min(1).max(500),
}).strict()).max(8);

export const lessonV2GenerationPlanInputSchema = z.object({
  level: lessonV2LevelSchema,
  title: z.string().trim().min(1).max(240),
  objectives: z.array(z.string().trim().min(1).max(600)).min(1).max(12),
  sourceQuery: z.string().trim().min(1).max(500),
  sourceChunkIds: z.array(z.string().uuid()).max(20).default([]),
  targetGrammar: lessonGenerationTargetGrammarSchema.default([]),
  vocabulary: z.array(z.object({
    id: z.string().trim().min(1).max(160).optional(),
    japanese: z.string().trim().min(1).max(120),
    reading: z.string().trim().min(1).max(160).optional(),
    meaning: z.string().trim().min(1).max(300),
  }).strict()).max(30).default([]),
}).strict();

export const lessonV2LlmGenerationInputSchema = lessonV2GenerationPlanInputSchema.extend({
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120).optional(),
  estimatedMinutes: z.number().int().min(5).max(60).default(20),
  questionCount: z.number().int().min(2).max(8).default(4),
  targetGrammar: lessonGenerationTargetGrammarSchema.min(1),
}).strict();

export const lessonV2QuestionDraftInputSchema = z.object({
  lessonVersionId: z.string().uuid().optional(),
  question: lessonV2QuestionSchema,
}).strict();

export type LessonV2DraftInput = z.infer<typeof lessonV2DraftInputSchema>;
export type LessonV2UpdateDraftInput = z.infer<typeof lessonV2UpdateDraftInputSchema>;

export function contentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}
