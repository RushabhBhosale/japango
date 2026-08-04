import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveDependenciesInputSchema } from '../lessons-v2/contracts';
import { AudioLessonsError } from './errors';
import { AudioLessonsRepository } from './repository';
import { createAudioLessonsSupabaseClient, throwAudioLessonsDatabaseError } from './supabase';

export interface AudioDependencyResolutionReport {
  vocabularyIds: string[];
  kanjiIds: string[];
  createdVocabularyIds: string[];
  createdKanjiIds: string[];
}

/** Creates reviewed dependency records without ever changing a published script. */
export class AudioLessonsDependencyResolver {
  constructor(
    private readonly supabase: SupabaseClient = createAudioLessonsSupabaseClient(),
    private readonly repository = new AudioLessonsRepository(supabase),
  ) {}

  async resolve(lessonId: string, input: unknown): Promise<AudioDependencyResolutionReport> {
    const lesson = await this.repository.getLesson(lessonId);
    const requested = resolveDependenciesInputSchema.parse(input);
    const [createdVocabularyIds, createdKanjiIds] = await Promise.all([
      this.createVocabulary(requested.vocabulary),
      this.createKanji(requested.kanji),
    ]);
    const vocabularyIds = [...new Set([...lesson.vocabularyIds, ...createdVocabularyIds])];
    const kanjiIds = [...new Set([...lesson.kanjiIds, ...createdKanjiIds])];
    await this.repository.updateLatestDraft(lessonId, { vocabularyIds, kanjiIds });
    return { vocabularyIds, kanjiIds, createdVocabularyIds, createdKanjiIds };
  }

  private async createVocabulary(rows: ReturnType<typeof resolveDependenciesInputSchema.parse>['vocabulary']): Promise<string[]> {
    const ids: string[] = [];
    for (const row of rows) {
      const { data: existing, error: findError } = await this.supabase.from('lesson_v2_vocabulary').select('id').eq('written', row.written).eq('reading', row.reading).maybeSingle();
      if (findError) throwAudioLessonsDatabaseError(findError);
      if (typeof existing?.id === 'string') { ids.push(existing.id); continue; }
      const { data, error } = await this.supabase.from('lesson_v2_vocabulary').insert({
        level: row.level, written: row.written, reading: row.reading, meaning: row.meaning, part_of_speech: row.partOfSpeech, status: 'review',
      }).select('id').single();
      if (error) throwAudioLessonsDatabaseError(error);
      if (typeof data?.id !== 'string') throw new AudioLessonsError('DATABASE_ERROR', 'Vocabulary creation returned an invalid response.', 502);
      ids.push(data.id);
    }
    return ids;
  }

  private async createKanji(rows: ReturnType<typeof resolveDependenciesInputSchema.parse>['kanji']): Promise<string[]> {
    const ids: string[] = [];
    for (const row of rows) {
      const { data: existing, error: findError } = await this.supabase.from('lesson_v2_kanji').select('id').eq('character', row.character).maybeSingle();
      if (findError) throwAudioLessonsDatabaseError(findError);
      if (typeof existing?.id === 'string') { ids.push(existing.id); continue; }
      const { data, error } = await this.supabase.from('lesson_v2_kanji').insert({
        level: row.level, character: row.character, meanings: row.meanings, readings: row.readings, status: 'review',
      }).select('id').single();
      if (error) throwAudioLessonsDatabaseError(error);
      if (typeof data?.id !== 'string') throw new AudioLessonsError('DATABASE_ERROR', 'Kanji creation returned an invalid response.', 502);
      ids.push(data.id);
    }
    return ids;
  }
}
