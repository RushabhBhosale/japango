import { z } from 'zod';

export const themePreferenceSchema = z.enum(['system', 'light', 'dark']);
export const assessmentIndexSchema = z.number().int().nonnegative();
