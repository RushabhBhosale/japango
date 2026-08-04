import { z } from 'zod';

import { audioLessonVersionSchema, audioPlaylistSchema, type AudioLessonVersion, type AudioPlaylist } from '@/types/audio-lessons';

export class AudioLessonsClientError extends Error {}

const responseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    lessons: z.array(audioLessonVersionSchema).optional(),
    lesson: audioLessonVersionSchema.optional(),
    playlists: z.array(audioPlaylistSchema).optional(),
  }).strict(),
}).strict();

function baseUrl(): string {
  const value = process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/u, '');
  if (!value) throw new AudioLessonsClientError('Audio Lessons need EXPO_PUBLIC_API_BASE_URL to load published lessons.');
  return value;
}

async function request(path: string): Promise<z.infer<typeof responseSchema>> {
  const response = await fetch(`${baseUrl()}${path}`);
  const body = await response.json() as unknown;
  if (!response.ok) throw new AudioLessonsClientError('Audio Lessons could not load right now.');
  return responseSchema.parse(body);
}

export interface AudioLessonLibraryFilter {
  level?: 'N5' | 'N4';
  lessonType?: AudioLessonVersion['lessonType'];
  minMinutes?: number;
  maxMinutes?: number;
}

export async function listPublishedAudioLessons(filter: AudioLessonLibraryFilter = {}): Promise<AudioLessonVersion[]> {
  const params = new URLSearchParams();
  if (filter.level) params.set('level', filter.level);
  if (filter.lessonType) params.set('lessonType', filter.lessonType);
  if (filter.minMinutes) params.set('minMinutes', String(filter.minMinutes));
  if (filter.maxMinutes) params.set('maxMinutes', String(filter.maxMinutes));
  const query = params.toString();
  return (await request(`/api/audio-lessons${query ? `?${query}` : ''}`)).data.lessons ?? [];
}

export async function getPublishedAudioLesson(lessonId: string): Promise<AudioLessonVersion> {
  const lesson = (await request(`/api/audio-lessons/${encodeURIComponent(lessonId)}`)).data.lesson;
  if (!lesson) throw new AudioLessonsClientError('Audio Lesson was not found.');
  return lesson;
}

export async function listPublishedAudioPlaylists(): Promise<AudioPlaylist[]> {
  return (await request('/api/audio-lessons/playlists')).data.playlists ?? [];
}
