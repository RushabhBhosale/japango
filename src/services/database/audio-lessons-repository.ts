import type { AudioLessonProgress, AudioLessonVersion, AudioPlaylist } from '@/types/audio-lessons';
import { audioLessonProgressSchema, audioLessonVersionSchema, audioPlaylistSchema } from '@/types/audio-lessons';

import { getDatabase } from './database';
import { getLearnerProfile } from './profile-repository';

interface CachedRow { lesson_id: string; snapshot_json: string; }
interface PlaylistRow { snapshot_json: string; }
interface ProgressRow {
  lesson_version_id: string;
  status: AudioLessonProgress['status'];
  playback_position_ms: number;
  total_listened_ms: number;
  completion_percentage: number;
  last_played_at: string | null;
  playback_speed: number;
  selected_mode: AudioLessonProgress['selectedMode'];
  completed_question_ids_json: string;
  correct_question_ids_json: string;
  updated_at: string;
}
interface DownloadRow { section_id: string; local_uri: string | null; status: 'pending' | 'downloaded' | 'failed' | 'system_speech'; }

export interface AudioLessonDownloadRecord {
  lessonVersionId: string;
  sectionId: string;
  remoteUrl?: string;
  localUri?: string;
  status: DownloadRow['status'];
  byteSize: number;
}

export async function cacheAudioLessons(lessons: readonly AudioLessonVersion[]): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  for (const lesson of lessons) {
    await database.runAsync(
      `INSERT INTO audio_lesson_cached_lessons (lesson_version_id, lesson_id, snapshot_json, cached_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(lesson_version_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, cached_at = excluded.cached_at`,
      lesson.id, lesson.lessonId, JSON.stringify(lesson), now,
    );
  }
}

export async function getCachedAudioLessons(): Promise<AudioLessonVersion[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<CachedRow>('SELECT lesson_id, snapshot_json FROM audio_lesson_cached_lessons ORDER BY cached_at DESC');
  return rows.map((row) => audioLessonVersionSchema.parse(JSON.parse(row.snapshot_json) as unknown));
}

export async function getCachedAudioLesson(lessonId: string): Promise<AudioLessonVersion | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<CachedRow>('SELECT lesson_id, snapshot_json FROM audio_lesson_cached_lessons WHERE lesson_id = ? ORDER BY cached_at DESC LIMIT 1', lessonId);
  return row ? audioLessonVersionSchema.parse(JSON.parse(row.snapshot_json) as unknown) : undefined;
}

export async function cacheAudioPlaylists(playlists: readonly AudioPlaylist[]): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  for (const playlist of playlists) {
    await database.runAsync(
      `INSERT INTO audio_lesson_cached_playlists (playlist_id, snapshot_json, cached_at)
       VALUES (?, ?, ?)
       ON CONFLICT(playlist_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, cached_at = excluded.cached_at`,
      playlist.id, JSON.stringify(playlist), now,
    );
  }
}

export async function getCachedAudioPlaylists(): Promise<AudioPlaylist[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<PlaylistRow>('SELECT snapshot_json FROM audio_lesson_cached_playlists ORDER BY cached_at DESC');
  return rows.map((row) => audioPlaylistSchema.parse(JSON.parse(row.snapshot_json) as unknown));
}

export async function getAudioLessonProgress(lessonVersionId: string): Promise<AudioLessonProgress> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  const row = await database.getFirstAsync<ProgressRow>(
    `SELECT lesson_version_id, status, playback_position_ms, total_listened_ms, completion_percentage, last_played_at, playback_speed, selected_mode, completed_question_ids_json, correct_question_ids_json, updated_at
     FROM audio_lesson_progress WHERE user_id = ? AND lesson_version_id = ?`,
    profile.id, lessonVersionId,
  );
  return audioLessonProgressSchema.parse(row ? {
    lessonVersionId: row.lesson_version_id,
    status: row.status,
    playbackPositionMs: row.playback_position_ms,
    totalListenedMs: row.total_listened_ms,
    completionPercentage: row.completion_percentage,
    lastPlayedAt: row.last_played_at ?? undefined,
    playbackSpeed: row.playback_speed,
    selectedMode: row.selected_mode,
    completedQuestionIds: JSON.parse(row.completed_question_ids_json) as unknown,
    correctQuestionIds: JSON.parse(row.correct_question_ids_json) as unknown,
    updatedAt: row.updated_at,
  } : {
    lessonVersionId,
    status: 'not_started',
    playbackPositionMs: 0,
    totalListenedMs: 0,
    completionPercentage: 0,
    playbackSpeed: 1,
    selectedMode: 'japanese_english',
    completedQuestionIds: [],
    correctQuestionIds: [],
    updatedAt: new Date().toISOString(),
  });
}

export async function saveAudioLessonProgress(progress: AudioLessonProgress): Promise<void> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  await database.runAsync(
    `INSERT INTO audio_lesson_progress (user_id, lesson_version_id, status, playback_position_ms, total_listened_ms, completion_percentage, last_played_at, playback_speed, selected_mode, completed_question_ids_json, correct_question_ids_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, lesson_version_id) DO UPDATE SET
       status = excluded.status, playback_position_ms = excluded.playback_position_ms,
       total_listened_ms = excluded.total_listened_ms, completion_percentage = excluded.completion_percentage,
       last_played_at = excluded.last_played_at, playback_speed = excluded.playback_speed,
       selected_mode = excluded.selected_mode, completed_question_ids_json = excluded.completed_question_ids_json,
       correct_question_ids_json = excluded.correct_question_ids_json, updated_at = excluded.updated_at`,
    profile.id, progress.lessonVersionId, progress.status, Math.round(progress.playbackPositionMs), Math.round(progress.totalListenedMs), progress.completionPercentage,
    progress.lastPlayedAt ?? null, progress.playbackSpeed, progress.selectedMode, JSON.stringify(progress.completedQuestionIds), JSON.stringify(progress.correctQuestionIds), progress.updatedAt,
  );
}

export async function saveAudioLessonDownload(record: AudioLessonDownloadRecord): Promise<void> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  await database.runAsync(
    `INSERT INTO audio_lesson_downloads (user_id, lesson_version_id, section_id, remote_url, local_uri, status, byte_size, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, lesson_version_id, section_id) DO UPDATE SET remote_url = excluded.remote_url, local_uri = excluded.local_uri, status = excluded.status, byte_size = excluded.byte_size, updated_at = excluded.updated_at`,
    profile.id, record.lessonVersionId, record.sectionId, record.remoteUrl ?? null, record.localUri ?? null, record.status, Math.max(0, Math.round(record.byteSize)), new Date().toISOString(),
  );
}

export async function getAudioLessonDownloadUris(lessonVersionId: string): Promise<Record<string, string>> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  const rows = await database.getAllAsync<DownloadRow>(
    `SELECT section_id, local_uri, status FROM audio_lesson_downloads
     WHERE user_id = ? AND lesson_version_id = ? AND status = 'downloaded'`,
    profile.id, lessonVersionId,
  );
  return Object.fromEntries(rows.flatMap((row) => row.local_uri ? [[row.section_id, row.local_uri]] : []));
}

export async function isAudioLessonDownloaded(lessonVersionId: string): Promise<boolean> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  const row = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM audio_lesson_downloads
     WHERE user_id = ? AND lesson_version_id = ? AND status IN ('downloaded', 'system_speech')`,
    profile.id, lessonVersionId,
  );
  return (row?.count ?? 0) > 0;
}

export async function setAudioLessonFavorite(lessonVersionId: string, favorite: boolean): Promise<void> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  if (favorite) {
    await database.runAsync('INSERT OR IGNORE INTO audio_lesson_favorites (user_id, lesson_version_id, created_at) VALUES (?, ?, ?)', profile.id, lessonVersionId, new Date().toISOString());
  } else {
    await database.runAsync('DELETE FROM audio_lesson_favorites WHERE user_id = ? AND lesson_version_id = ?', profile.id, lessonVersionId);
  }
}

export async function getAudioLessonFavoriteIds(): Promise<Set<string>> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  const rows = await database.getAllAsync<{ lesson_version_id: string }>('SELECT lesson_version_id FROM audio_lesson_favorites WHERE user_id = ?', profile.id);
  return new Set(rows.map((row) => row.lesson_version_id));
}
