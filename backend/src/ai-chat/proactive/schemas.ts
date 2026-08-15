import { z } from 'zod';

const weaknessSchema = z.object({
  type: z.enum(['grammar', 'vocabulary', 'kanji']),
  key: z.string().trim().min(1).max(160),
  mastery: z.number().min(0).max(1),
  mistakes: z.number().int().min(0).max(10_000),
}).strict();

const scenarioSchema = z.object({
  title: z.string().trim().min(1).max(120),
  setting: z.string().trim().min(1).max(180),
  goal: z.string().trim().min(1).max(180),
  targetGrammar: z.array(z.string().trim().min(1).max(100)).max(4),
  targetVocabulary: z.array(z.string().trim().min(1).max(100)).max(6),
  complication: z.string().trim().min(1).max(180).optional(),
}).strict();

export const deviceRegistrationSchema = z.object({
  localUserId: z.string().trim().min(8).max(160),
  expoPushToken: z.string().trim().regex(/^(?:Exponent|Expo)PushToken\[[^\]]+\]$/u),
  timeZone: z.string().trim().min(1).max(120),
}).strict();

export const proactiveContextSchema = z.object({
  localUserId: z.string().trim().min(8).max(160),
  timeZone: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(1_500).optional(),
  weaknesses: z.array(weaknessSchema).max(5),
  scenario: scenarioSchema.optional(),
  lastActiveAt: z.string().datetime(),
}).strict();

export type ProactiveContext = z.infer<typeof proactiveContextSchema>;
export type ProactiveWeakness = z.infer<typeof weaknessSchema>;
