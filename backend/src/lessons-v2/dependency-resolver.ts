import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveDependenciesInputSchema, type LessonV2Version, type StructuredJapaneseText } from './contracts';
import { LessonsV2Error } from './errors';
import { createLessonsV2SupabaseClient, throwLessonsV2DatabaseError } from './supabase';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function textsInLesson(lesson: LessonV2Version): StructuredJapaneseText[] {
  return lesson.sections.flatMap((section) => [
    ...section.content.flatMap((content) => content.japanese ? [content.japanese] : []),
    ...section.questions.flatMap((question) => [
      question.instruction,
      question.prompt,
      ...(question.passage ? [question.passage] : []),
      ...question.choices.flatMap((choice) => choice.label.japanese ? [choice.label.japanese] : []),
    ]),
  ]);
}

export interface DependencyResolutionReport {
  resolvedVocabularyIds: string[];
  resolvedKanjiIds: string[];
  unresolvedVocabularyIds: string[];
  unresolvedKanjiIds: string[];
  createdVocabularyIds: string[];
  createdKanjiIds: string[];
}

export class LessonsV2DependencyResolver {
  constructor(private readonly supabase: SupabaseClient = createLessonsV2SupabaseClient()) {}

  async resolve(lesson: LessonV2Version, input: unknown): Promise<DependencyResolutionReport> {
    const requested = resolveDependenciesInputSchema.parse(input);
    const createdVocabularyIds = await this.createVocabulary(requested.vocabulary);
    const createdKanjiIds = await this.createKanji(requested.kanji);
    const vocabularyIds = new Set<string>();
    const kanjiIds = new Set<string>();
    for (const section of lesson.sections) {
      section.vocabularyIds.forEach((id) => vocabularyIds.add(id));
      section.kanjiIds.forEach((id) => kanjiIds.add(id));
      for (const question of section.questions) {
        question.vocabularyIds.forEach((id) => vocabularyIds.add(id));
        question.kanjiIds.forEach((id) => kanjiIds.add(id));
      }
    }
    for (const text of textsInLesson(lesson)) for (const token of text.tokens) {
      if (token.vocabularyId) vocabularyIds.add(token.vocabularyId);
      token.kanjiIds.forEach((id) => kanjiIds.add(id));
    }
    const [resolvedVocabularyIds, resolvedKanjiIds] = await Promise.all([
      this.existingIds('lesson_v2_vocabulary', vocabularyIds),
      this.existingIds('lesson_v2_kanji', kanjiIds),
    ]);
    const unresolvedVocabularyIds = [...vocabularyIds].filter((id) => !resolvedVocabularyIds.includes(id));
    const unresolvedKanjiIds = [...kanjiIds].filter((id) => !resolvedKanjiIds.includes(id));
    await this.replaceLinks(lesson.id, resolvedVocabularyIds, resolvedKanjiIds, unresolvedVocabularyIds, unresolvedKanjiIds);
    return { resolvedVocabularyIds, resolvedKanjiIds, unresolvedVocabularyIds, unresolvedKanjiIds, createdVocabularyIds, createdKanjiIds };
  }

  async listVocabulary(limit = 100): Promise<unknown[]> {
    const { data, error } = await this.supabase.from('lesson_v2_vocabulary').select('*').neq('status', 'archived').order('written').limit(Math.max(1, Math.min(limit, 200)));
    if (error) throwLessonsV2DatabaseError(error);
    return data ?? [];
  }

  async listKanji(limit = 100): Promise<unknown[]> {
    const { data, error } = await this.supabase.from('lesson_v2_kanji').select('*').neq('status', 'archived').order('character').limit(Math.max(1, Math.min(limit, 200)));
    if (error) throwLessonsV2DatabaseError(error);
    return data ?? [];
  }

  private async existingIds(table: 'lesson_v2_vocabulary' | 'lesson_v2_kanji', ids: Set<string>): Promise<string[]> {
    const safeIds = [...ids].filter((id) => uuidPattern.test(id));
    if (!safeIds.length) return [];
    const { data, error } = await this.supabase.from(table).select('id').in('id', safeIds);
    if (error) throwLessonsV2DatabaseError(error);
    return (data ?? []).flatMap((row) => typeof row.id === 'string' ? [row.id] : []);
  }

  private async createVocabulary(rows: ReturnType<typeof resolveDependenciesInputSchema.parse>['vocabulary']): Promise<string[]> {
    const result: string[] = [];
    for (const row of rows) {
      const { data: existing, error: findError } = await this.supabase.from('lesson_v2_vocabulary').select('id').eq('written', row.written).eq('reading', row.reading).maybeSingle();
      if (findError) throwLessonsV2DatabaseError(findError);
      if (existing?.id && typeof existing.id === 'string') { result.push(existing.id); continue; }
      const { data, error } = await this.supabase.from('lesson_v2_vocabulary').insert({
        level: row.level, written: row.written, reading: row.reading, meaning: row.meaning, part_of_speech: row.partOfSpeech, status: 'draft',
      }).select('id').single();
      if (error) throwLessonsV2DatabaseError(error);
      if (typeof data.id !== 'string') throw new LessonsV2Error('DATABASE_ERROR', 'Vocabulary creation returned an invalid response.', 502);
      result.push(data.id);
    }
    return result;
  }

  private async createKanji(rows: ReturnType<typeof resolveDependenciesInputSchema.parse>['kanji']): Promise<string[]> {
    const result: string[] = [];
    for (const row of rows) {
      const { data: existing, error: findError } = await this.supabase.from('lesson_v2_kanji').select('id').eq('character', row.character).maybeSingle();
      if (findError) throwLessonsV2DatabaseError(findError);
      if (existing?.id && typeof existing.id === 'string') { result.push(existing.id); continue; }
      const { data, error } = await this.supabase.from('lesson_v2_kanji').insert({
        level: row.level, character: row.character, meanings: row.meanings, readings: row.readings, status: 'draft',
      }).select('id').single();
      if (error) throwLessonsV2DatabaseError(error);
      if (typeof data.id !== 'string') throw new LessonsV2Error('DATABASE_ERROR', 'Kanji creation returned an invalid response.', 502);
      result.push(data.id);
    }
    return result;
  }

  private async replaceLinks(
    lessonVersionId: string,
    vocabularyIds: string[],
    kanjiIds: string[],
    unresolvedVocabularyIds: string[],
    unresolvedKanjiIds: string[],
  ): Promise<void> {
    const { error: deleteError } = await this.supabase.from('lesson_v2_version_dependencies').delete().eq('lesson_version_id', lessonVersionId);
    if (deleteError) throwLessonsV2DatabaseError(deleteError);
    const rows = [
      ...vocabularyIds.map((id) => ({ lesson_version_id: lessonVersionId, dependency_type: 'vocabulary', dependency_id: id, resolution_status: 'resolved' })),
      ...kanjiIds.map((id) => ({ lesson_version_id: lessonVersionId, dependency_type: 'kanji', dependency_id: id, resolution_status: 'resolved' })),
      ...unresolvedVocabularyIds.map((id) => ({ lesson_version_id: lessonVersionId, dependency_type: 'vocabulary', dependency_id: id, resolution_status: 'missing' })),
      ...unresolvedKanjiIds.map((id) => ({ lesson_version_id: lessonVersionId, dependency_type: 'kanji', dependency_id: id, resolution_status: 'missing' })),
    ];
    if (!rows.length) return;
    const { error: insertError } = await this.supabase.from('lesson_v2_version_dependencies').insert(rows);
    if (insertError) throwLessonsV2DatabaseError(insertError);
  }
}
