import { z } from 'zod';

import { getDatabase } from './database';

const stringArraySchema = z.array(z.string().min(1));

export interface ReadingLessonContent {
  id: string;
  level: 'N5' | 'N4';
  title?: string;
  japanese: string;
  reading: string;
  meaning: string;
  questionIds: string[];
}

export interface ListeningLessonContent {
  id: string;
  level: 'N5' | 'N4';
  title: string;
  transcript: string;
  speechText: string;
  meaning: string;
  questionIds: string[];
}

export async function getReadingById(id: string): Promise<ReadingLessonContent | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{
    id: string; level: 'N5' | 'N4'; title: string | null; japanese: string; reading: string;
    english: string; question_ids_json: string;
  }>(
    `SELECT id, level, title, japanese, reading, english, question_ids_json
     FROM reading_passages WHERE id = ? AND release_ready = 1`,
    id,
  );
  return row ? {
    id: row.id,
    level: row.level,
    title: row.title ?? undefined,
    japanese: row.japanese,
    reading: row.reading,
    meaning: row.english,
    questionIds: stringArraySchema.parse(JSON.parse(row.question_ids_json) as unknown),
  } : undefined;
}

export async function getListeningById(id: string): Promise<ListeningLessonContent | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{
    id: string; level: 'N5' | 'N4'; title: string; display_text: string; speech_normalized_text: string;
    english: string; question_ids_json: string;
  }>(
    `SELECT activities.id, activities.level, activities.title, transcripts.display_text,
            transcripts.speech_normalized_text, transcripts.english, activities.question_ids_json
     FROM listening_activities AS activities
     INNER JOIN listening_transcripts AS transcripts ON transcripts.activity_id = activities.id
     WHERE activities.id = ? AND activities.release_ready = 1`,
    id,
  );
  return row ? {
    id: row.id,
    level: row.level,
    title: row.title,
    transcript: row.display_text,
    speechText: row.speech_normalized_text,
    meaning: row.english,
    questionIds: stringArraySchema.parse(JSON.parse(row.question_ids_json) as unknown),
  } : undefined;
}
