import { z } from 'zod';

export const curriculumItemSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['vocabulary', 'grammar', 'kanji', 'reading', 'listening']),
  level: z.enum(['N5', 'N4']),
  title: z.string().min(1),
  meaning: z.string().min(1).optional(),
  reading: z.string().min(1).optional(),
  explanation: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)),
});

export const curriculumSeedSchema = z.array(curriculumItemSchema).superRefine((items, context) => {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate curriculum ID: ${item.id}`,
      });
    }
    ids.add(item.id);
  }
});
