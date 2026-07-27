import { z } from 'zod';

const optionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

const baseQuestionSchema = z.object({
  id: z.string().min(1),
  position: z.number().int().positive(),
  category: z.enum(['vocabulary', 'kanji', 'grammar', 'reading']),
  curriculumItemId: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(optionSchema).min(2),
  correctOptionId: z.string().min(1),
  explanation: z.string().min(1),
});

export const assessmentQuestionSchema = z.discriminatedUnion('type', [
  baseQuestionSchema.extend({
    type: z.enum(['multiple-choice', 'choose-reading', 'fill-blank']),
  }),
  baseQuestionSchema.extend({
    type: z.literal('short-reading'),
    passage: z.string().min(1),
  }),
]);

export const assessmentSeedSchema = z.array(assessmentQuestionSchema).superRefine(
  (questions, context) => {
    const ids = new Set<string>();
    const positions = new Set<number>();
    for (const question of questions) {
      if (ids.has(question.id)) {
        context.addIssue({ code: 'custom', message: `Duplicate question ID: ${question.id}` });
      }
      if (positions.has(question.position)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate question position: ${question.position}`,
        });
      }
      if (!question.options.some((option) => option.id === question.correctOptionId)) {
        context.addIssue({
          code: 'custom',
          message: `Question ${question.id} has no matching correct option`,
        });
      }
      ids.add(question.id);
      positions.add(question.position);
    }
  },
);

export const categoryScoreSchema = z.object({
  category: z.enum(['vocabulary', 'kanji', 'grammar', 'reading']),
  correct: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  percentage: z.number().min(0).max(100),
});

export const assessmentResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  totalCorrect: z.number().int().nonnegative(),
  totalQuestions: z.number().int().nonnegative(),
  categoryScores: z.array(categoryScoreSchema),
  strongAreas: z.array(z.enum(['vocabulary', 'kanji', 'grammar', 'reading'])),
  weakAreas: z.array(z.enum(['vocabulary', 'kanji', 'grammar', 'reading'])),
  learnerLevel: z.enum([
    'N5 foundation needed',
    'N5 recovery',
    'Ready to begin N4 gradually',
  ]),
  recommendedPath: z.string().min(1),
});
