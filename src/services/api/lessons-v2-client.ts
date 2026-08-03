import { z } from 'zod';

import { lessonV2VersionSchema, type LessonV2Version } from '@/types/lessons-v2';

export class LessonsV2ClientError extends Error {}

const responseSchema = z.object({
  success: z.literal(true),
  data: z.object({ lessons: z.array(lessonV2VersionSchema).optional(), lesson: lessonV2VersionSchema.optional() }).strict(),
}).strict();

function baseUrl(): string {
  const value = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/u, '');
  if (!value) throw new LessonsV2ClientError('Lessons V2 needs EXPO_PUBLIC_API_BASE_URL to load published lessons.');
  return value;
}

async function request(path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl()}${path}`);
  const body = await response.json() as unknown;
  if (!response.ok) throw new LessonsV2ClientError('Lessons V2 could not load right now.');
  return body;
}

export async function listPublishedLessonsV2(): Promise<LessonV2Version[]> {
  const parsed = responseSchema.parse(await request('/api/lessons-v2'));
  return parsed.data.lessons ?? [];
}

export async function getPublishedLessonV2(lessonId: string): Promise<LessonV2Version> {
  const parsed = responseSchema.parse(await request(`/api/lessons-v2/${encodeURIComponent(lessonId)}`));
  if (!parsed.data.lesson) throw new LessonsV2ClientError('Lessons V2 lesson was not found.');
  return parsed.data.lesson;
}
