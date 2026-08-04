import { createHash } from 'node:crypto';

import { z } from 'zod';

import {
  audioLessonTypeSchema,
  audioLessonVersionSchema,
} from '../../../shared/audio-lessons/contract';
import { lessonV2LevelSchema } from '../../../shared/lessons-v2/contract';

export * from '../../../shared/audio-lessons/contract';
export { audioLessonVersionSchema } from '../../../shared/audio-lessons/contract';

const audioLessonDraftShape = {
  slug: audioLessonVersionSchema.shape.slug,
  title: audioLessonVersionSchema.shape.title,
  subtitle: audioLessonVersionSchema.shape.subtitle,
  jlptLevel: audioLessonVersionSchema.shape.jlptLevel,
  difficulty: audioLessonVersionSchema.shape.difficulty,
  lessonType: audioLessonVersionSchema.shape.lessonType,
  estimatedMinutes: audioLessonVersionSchema.shape.estimatedMinutes,
  objectives: audioLessonVersionSchema.shape.objectives,
  prerequisites: audioLessonVersionSchema.shape.prerequisites,
  relatedLessonIds: audioLessonVersionSchema.shape.relatedLessonIds,
  vocabularyIds: audioLessonVersionSchema.shape.vocabularyIds,
  kanjiIds: audioLessonVersionSchema.shape.kanjiIds,
  grammarIds: audioLessonVersionSchema.shape.grammarIds,
  modes: audioLessonVersionSchema.shape.modes,
  scriptSections: audioLessonVersionSchema.shape.scriptSections,
  listeningQuestions: audioLessonVersionSchema.shape.listeningQuestions,
  sourceReferences: audioLessonVersionSchema.shape.sourceReferences,
  generationMetadata: audioLessonVersionSchema.shape.generationMetadata,
};

function validateDraftShape(value: Record<string, unknown>, context: z.RefinementCtx): void {
  const parsed = audioLessonVersionSchema.safeParse({
    ...value,
    id: 'audio-draft-validation',
    lessonId: 'audio-draft-validation',
    version: 1,
    status: 'draft',
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
  });
  if (parsed.success) return;
  for (const issue of parsed.error.issues) context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
}

export const audioLessonDraftInputSchema = z.object(audioLessonDraftShape).strict().superRefine(validateDraftShape);

export const audioLessonUpdateDraftInputSchema = z.object({
  title: audioLessonDraftShape.title.optional(),
  subtitle: audioLessonDraftShape.subtitle.optional(),
  jlptLevel: audioLessonDraftShape.jlptLevel.optional(),
  difficulty: audioLessonDraftShape.difficulty.optional(),
  lessonType: audioLessonDraftShape.lessonType.optional(),
  estimatedMinutes: audioLessonDraftShape.estimatedMinutes.optional(),
  objectives: audioLessonDraftShape.objectives.optional(),
  prerequisites: audioLessonDraftShape.prerequisites.optional(),
  relatedLessonIds: audioLessonDraftShape.relatedLessonIds.optional(),
  vocabularyIds: audioLessonDraftShape.vocabularyIds.optional(),
  kanjiIds: audioLessonDraftShape.kanjiIds.optional(),
  grammarIds: audioLessonDraftShape.grammarIds.optional(),
  modes: audioLessonDraftShape.modes.optional(),
  scriptSections: audioLessonDraftShape.scriptSections.optional(),
  listeningQuestions: audioLessonDraftShape.listeningQuestions.optional(),
  sourceReferences: audioLessonDraftShape.sourceReferences.optional(),
  generationMetadata: audioLessonDraftShape.generationMetadata.optional(),
  status: z.enum(['draft', 'review']).optional(),
}).strict();

export const audioPilotSeedInputSchema = z.object({
  sourceChunkId: z.string().uuid(),
  sourcePath: z.string().trim().min(1).max(2_000),
  patternId: z.string().uuid().optional(),
  vocabularyIds: z.array(z.string().uuid()).max(80).default([]),
  grammarIds: z.array(z.string().trim().min(1).max(160)).max(40).default([]),
  kanjiIds: z.array(z.string().uuid()).max(80).default([]),
  relatedLessonIds: z.array(z.string().uuid()).max(30).default([]),
}).strict();

export const audioLessonListFilterSchema = z.object({
  level: lessonV2LevelSchema.optional(),
  lessonType: audioLessonTypeSchema.optional(),
  minMinutes: z.coerce.number().int().min(5).max(12).optional(),
  maxMinutes: z.coerce.number().int().min(5).max(12).optional(),
}).strict().superRefine((value, context) => {
  if (value.minMinutes && value.maxMinutes && value.minMinutes > value.maxMinutes) {
    context.addIssue({ code: 'custom', path: ['maxMinutes'], message: 'Maximum duration must be greater than or equal to minimum duration.' });
  }
});

export type AudioLessonDraftInput = z.infer<typeof audioLessonDraftInputSchema>;
export type AudioLessonUpdateDraftInput = z.infer<typeof audioLessonUpdateDraftInputSchema>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function audioContentHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}
