import type { SupabaseClient } from '@supabase/supabase-js';

import {
  audioContentHash,
  audioLessonVersionSchema,
  type AudioLessonDraftInput,
  type AudioLessonUpdateDraftInput,
  type AudioLessonVersion,
  type AudioPlaylist,
  type AudioScriptSection,
} from './contracts';
import { AudioLessonsError } from './errors';
import { createAudioLessonsSupabaseClient, throwAudioLessonsDatabaseError } from './supabase';
import { unresolvedAudioDependencies } from './dependency-validator';
import type { LessonV2ValidationIssue } from '../lessons-v2/contracts';

interface LessonRow {
  id: string;
  slug: string;
  level: 'N5' | 'N4';
  lesson_type: AudioLessonVersion['lessonType'];
  status: AudioLessonVersion['status'];
  current_published_version_id: string | null;
}

interface VersionRow {
  id: string;
  lesson_id: string;
  version: number;
  status: AudioLessonVersion['status'];
  title: string;
  objectives: unknown;
  estimated_minutes: number;
  content: unknown;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

interface PlaylistRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  level: 'N5' | 'N4' | null;
  lesson_type: AudioLessonVersion['lessonType'] | null;
  updated_at: string;
}

type StoredContent = Omit<AudioLessonVersion, 'id' | 'lessonId' | 'version' | 'slug' | 'jlptLevel' | 'title' | 'objectives' | 'estimatedMinutes' | 'status' | 'createdAt' | 'updatedAt' | 'publishedAt'>;

function asLessonRow(value: unknown): LessonRow { return value as LessonRow; }
function asVersionRow(value: unknown): VersionRow { return value as VersionRow; }
function asPlaylistRow(value: unknown): PlaylistRow { return value as PlaylistRow; }

function utcTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function toVersion(lesson: LessonRow, row: VersionRow): AudioLessonVersion {
  const content = row.content as Partial<StoredContent>;
  return audioLessonVersionSchema.parse({
    id: row.id,
    lessonId: row.lesson_id,
    version: row.version,
    slug: lesson.slug,
    title: row.title,
    jlptLevel: lesson.level,
    objectives: row.objectives,
    estimatedMinutes: row.estimated_minutes,
    status: row.status,
    createdAt: utcTimestamp(row.created_at),
    updatedAt: utcTimestamp(row.updated_at),
    publishedAt: row.published_at ? utcTimestamp(row.published_at) : undefined,
    ...content,
  });
}

function contentFromInput(input: AudioLessonDraftInput): { content: StoredContent; contentHash: string } {
  const { slug: _slug, jlptLevel: _level, title: _title, objectives: _objectives, estimatedMinutes: _minutes, ...content } = input;
  const metadata = { ...content.generationMetadata };
  delete metadata.contentHash;
  const contentHash = audioContentHash({ slug: input.slug, jlptLevel: input.jlptLevel, title: input.title, objectives: input.objectives, estimatedMinutes: input.estimatedMinutes, ...content, generationMetadata: metadata });
  return {
    content: { ...content, generationMetadata: { ...metadata, contentHash } },
    contentHash,
  };
}

function draftInputFromVersion(version: AudioLessonVersion): AudioLessonDraftInput {
  const { id: _id, lessonId: _lessonId, version: _version, status: _status, createdAt: _createdAt, updatedAt: _updatedAt, publishedAt: _publishedAt, ...input } = version;
  return input;
}

export class AudioLessonsRepository {
  constructor(private readonly supabase: SupabaseClient = createAudioLessonsSupabaseClient()) {}

  async listLessons(options: {
    publishedOnly?: boolean;
    level?: 'N5' | 'N4';
    lessonType?: AudioLessonVersion['lessonType'];
    minMinutes?: number;
    maxMinutes?: number;
  } = {}): Promise<AudioLessonVersion[]> {
    let lessonQuery = this.supabase
      .from('audio_lessons')
      .select('id, slug, level, lesson_type, status, current_published_version_id')
      .order('updated_at', { ascending: false });
    if (options.publishedOnly) lessonQuery = lessonQuery.eq('status', 'published');
    if (options.level) lessonQuery = lessonQuery.eq('level', options.level);
    if (options.lessonType) lessonQuery = lessonQuery.eq('lesson_type', options.lessonType);
    const { data: lessonData, error: lessonError } = await lessonQuery;
    if (lessonError) throwAudioLessonsDatabaseError(lessonError);
    const lessons = (lessonData ?? []).map(asLessonRow);
    if (!lessons.length) return [];

    const ids = options.publishedOnly
      ? lessons.map((lesson) => lesson.current_published_version_id).filter((id): id is string => Boolean(id))
      : lessons.map((lesson) => lesson.id);
    if (!ids.length) return [];
    let versionQuery = this.supabase
      .from('audio_lesson_versions')
      .select('id, lesson_id, version, status, title, objectives, estimated_minutes, content, created_at, updated_at, published_at');
    versionQuery = options.publishedOnly
      ? versionQuery.in('id', ids)
      : versionQuery.in('lesson_id', ids).order('version', { ascending: false });
    if (options.minMinutes) versionQuery = versionQuery.gte('estimated_minutes', options.minMinutes);
    if (options.maxMinutes) versionQuery = versionQuery.lte('estimated_minutes', options.maxMinutes);
    const { data: versionData, error: versionError } = await versionQuery;
    if (versionError) throwAudioLessonsDatabaseError(versionError);
    const byLessonId = new Map<string, VersionRow>();
    for (const row of (versionData ?? []).map(asVersionRow)) if (!byLessonId.has(row.lesson_id)) byLessonId.set(row.lesson_id, row);
    return lessons.flatMap((lesson) => {
      const version = byLessonId.get(lesson.id);
      return version ? [toVersion(lesson, version)] : [];
    });
  }

  async listAuditLessons(): Promise<AudioLessonVersion[]> {
    const lessons = await this.listLessons();
    const published = await this.listLessons({ publishedOnly: true });
    const byId = new Map<string, AudioLessonVersion>();
    for (const lesson of [...lessons, ...published]) byId.set(lesson.id, lesson);
    return [...byId.values()];
  }

  async getLesson(lessonId: string, publishedOnly = false): Promise<AudioLessonVersion> {
    const { data: lessonData, error: lessonError } = await this.supabase
      .from('audio_lessons')
      .select('id, slug, level, lesson_type, status, current_published_version_id')
      .eq('id', lessonId)
      .maybeSingle();
    if (lessonError) throwAudioLessonsDatabaseError(lessonError);
    if (!lessonData) throw new AudioLessonsError('NOT_FOUND', 'Audio Lesson was not found.', 404);
    const lesson = asLessonRow(lessonData);
    if (publishedOnly && (lesson.status !== 'published' || !lesson.current_published_version_id)) {
      throw new AudioLessonsError('NOT_FOUND', 'Published Audio Lesson was not found.', 404);
    }
    const query = this.supabase
      .from('audio_lesson_versions')
      .select('id, lesson_id, version, status, title, objectives, estimated_minutes, content, created_at, updated_at, published_at');
    const { data: versionData, error: versionError } = publishedOnly
      ? await query.eq('id', lesson.current_published_version_id!).maybeSingle()
      : await query.eq('lesson_id', lesson.id).order('version', { ascending: false }).limit(1).maybeSingle();
    if (versionError) throwAudioLessonsDatabaseError(versionError);
    if (!versionData) throw new AudioLessonsError('NOT_FOUND', 'Audio Lesson version was not found.', 404);
    return toVersion(lesson, asVersionRow(versionData));
  }

  async createDraft(input: AudioLessonDraftInput): Promise<AudioLessonVersion> {
    const { data: lessonData, error: lessonError } = await this.supabase
      .from('audio_lessons')
      .insert({ slug: input.slug, level: input.jlptLevel, lesson_type: input.lessonType, status: 'draft' })
      .select('id, slug, level, lesson_type, status, current_published_version_id')
      .single();
    if (lessonError) throwAudioLessonsDatabaseError(lessonError);
    const lesson = asLessonRow(lessonData);
    const payload = contentFromInput(input);
    const { data: versionData, error: versionError } = await this.supabase
      .from('audio_lesson_versions')
      .insert({ lesson_id: lesson.id, version: 1, status: 'draft', title: input.title, objectives: input.objectives, estimated_minutes: input.estimatedMinutes, content: payload.content, content_hash: payload.contentHash })
      .select('id, lesson_id, version, status, title, objectives, estimated_minutes, content, created_at, updated_at, published_at')
      .single();
    if (versionError) throwAudioLessonsDatabaseError(versionError);
    const version = toVersion(lesson, asVersionRow(versionData));
    await this.replaceReferencesAndDependencies(version);
    return version;
  }

  async updateLatestDraft(lessonId: string, input: AudioLessonUpdateDraftInput): Promise<AudioLessonVersion> {
    const current = await this.getLesson(lessonId);
    if (current.status === 'published') throw new AudioLessonsError('CONFLICT', 'Create a new version instead of editing a published Audio Lesson.', 409);
    const { status: requestedStatus, ...changes } = input;
    const next = { ...draftInputFromVersion(current), ...changes, generationMetadata: input.generationMetadata ?? current.generationMetadata };
    const payload = contentFromInput(next);
    const now = new Date().toISOString();
    const { error } = await this.supabase
      .from('audio_lesson_versions')
      .update({ status: requestedStatus ?? current.status, title: next.title, objectives: next.objectives, estimated_minutes: next.estimatedMinutes, content: payload.content, content_hash: payload.contentHash, updated_at: now })
      .eq('id', current.id);
    if (error) throwAudioLessonsDatabaseError(error);
    const { error: lessonError } = await this.supabase
      .from('audio_lessons')
      .update({ level: next.jlptLevel, lesson_type: next.lessonType, updated_at: now })
      .eq('id', lessonId);
    if (lessonError) throwAudioLessonsDatabaseError(lessonError);
    const updated = await this.getLesson(lessonId);
    await this.replaceReferencesAndDependencies(updated);
    return updated;
  }

  async createNextVersion(lessonId: string): Promise<AudioLessonVersion> {
    const source = await this.getLesson(lessonId);
    const input = draftInputFromVersion(source);
    const payload = contentFromInput(input);
    // A new editable revision intentionally retains the same learner-facing
    // script. Its version hash includes its immutable source snapshot so the
    // idempotent content hash still prevents duplicate writes to one version.
    const successorHash = audioContentHash({ sourceVersionId: source.id, nextVersion: source.version + 1, contentHash: payload.contentHash });
    payload.content.generationMetadata.contentHash = successorHash;
    payload.contentHash = successorHash;
    const { data: versionData, error: versionError } = await this.supabase
      .from('audio_lesson_versions')
      .insert({ lesson_id: source.lessonId, version: source.version + 1, status: 'draft', title: source.title, objectives: source.objectives, estimated_minutes: source.estimatedMinutes, content: payload.content, content_hash: payload.contentHash })
      .select('id, lesson_id, version, status, title, objectives, estimated_minutes, content, created_at, updated_at, published_at')
      .single();
    if (versionError) throwAudioLessonsDatabaseError(versionError);
    const { data: lessonData, error: lessonError } = await this.supabase
      .from('audio_lessons')
      .select('id, slug, level, lesson_type, status, current_published_version_id')
      .eq('id', lessonId)
      .single();
    if (lessonError) throwAudioLessonsDatabaseError(lessonError);
    const version = toVersion(asLessonRow(lessonData), asVersionRow(versionData));
    await this.replaceReferencesAndDependencies(version);
    return version;
  }

  async publish(lessonId: string, issues: readonly LessonV2ValidationIssue[]): Promise<AudioLessonVersion> {
    const lesson = await this.getLesson(lessonId);
    if (issues.some((item) => item.severity === 'critical')) {
      await this.replaceValidationIssues(lesson.id, issues);
      throw new AudioLessonsError('VALIDATION_FAILED', 'Resolve critical Audio Lesson validation issues before publishing.', 422);
    }
    const now = new Date().toISOString();
    const { error: versionError } = await this.supabase.from('audio_lesson_versions').update({ status: 'published', published_at: now, updated_at: now }).eq('id', lesson.id);
    if (versionError) throwAudioLessonsDatabaseError(versionError);
    const { error: lessonError } = await this.supabase.from('audio_lessons').update({ status: 'published', current_published_version_id: lesson.id, updated_at: now }).eq('id', lesson.lessonId);
    if (lessonError) throwAudioLessonsDatabaseError(lessonError);
    return this.getLesson(lesson.lessonId, true);
  }

  async archive(lessonId: string): Promise<void> {
    const { error } = await this.supabase
      .from('audio_lessons')
      .update({ status: 'archived', current_published_version_id: null, updated_at: new Date().toISOString() })
      .eq('id', lessonId);
    if (error) throwAudioLessonsDatabaseError(error);
  }

  async replaceValidationIssues(lessonVersionId: string, issues: readonly LessonV2ValidationIssue[]): Promise<void> {
    const { error: deleteError } = await this.supabase.from('audio_lesson_validation_issues').delete().eq('lesson_version_id', lessonVersionId).is('resolved_at', null);
    if (deleteError) throwAudioLessonsDatabaseError(deleteError);
    if (!issues.length) return;
    const { error: insertError } = await this.supabase.from('audio_lesson_validation_issues').insert(issues.map((item) => ({
      lesson_version_id: lessonVersionId,
      severity: item.severity,
      subject_id: item.subjectId,
      issue_type: item.issueType,
      message: item.message,
      suggested_fix: item.suggestedFix ?? null,
    })));
    if (insertError) throwAudioLessonsDatabaseError(insertError);
  }

  async unresolvedDependencyIssues(lessonVersionId: string): Promise<LessonV2ValidationIssue[]> {
    const { data, error } = await this.supabase
      .from('audio_lesson_version_dependencies')
      .select('dependency_type, dependency_id')
      .eq('lesson_version_id', lessonVersionId)
      .in('resolution_status', ['missing', 'needs_review']);
    if (error) throwAudioLessonsDatabaseError(error);
    return (data ?? []).flatMap((row) => typeof row.dependency_type === 'string' && typeof row.dependency_id === 'string'
      ? [{ severity: 'critical' as const, subjectId: row.dependency_id, issueType: 'unresolved_dependency', message: `${row.dependency_type} dependency is unresolved and blocks publishing.` }]
      : []);
  }

  async verifyLinkedDependencies(lesson: AudioLessonVersion): Promise<LessonV2ValidationIssue[]> {
    const existing = async (table: string, ids: readonly string[]): Promise<Set<string>> => {
      if (!ids.length) return new Set();
      const { data, error } = await this.supabase.from(table).select('id').in('id', [...new Set(ids)]);
      if (error) throwAudioLessonsDatabaseError(error);
      return new Set((data ?? []).flatMap((row) => typeof row.id === 'string' ? [row.id] : []));
    };
    const [vocabularyIds, kanjiIds, relatedLessonIds, sourceChunkIds] = await Promise.all([
      existing('lesson_v2_vocabulary', lesson.vocabularyIds),
      existing('lesson_v2_kanji', lesson.kanjiIds),
      existing('lesson_v2_lessons', lesson.relatedLessonIds),
      existing('japanese_ocr_chunks', lesson.sourceReferences.map((reference) => reference.sourceChunkId)),
    ]);
    return unresolvedAudioDependencies(lesson, { vocabularyIds, kanjiIds, relatedLessonIds, sourceChunkIds });
  }

  async replaceAudioSections(lessonId: string, sections: readonly AudioScriptSection[], provider: string): Promise<AudioLessonVersion> {
    const current = await this.getLesson(lessonId);
    if (current.status === 'published') throw new AudioLessonsError('CONFLICT', 'Create a new version before regenerating published audio.', 409);
    const updated = await this.updateLatestDraft(lessonId, { scriptSections: [...sections] });
    const { error: deleteError } = await this.supabase.from('audio_lesson_audio_files').delete().eq('lesson_version_id', updated.id);
    if (deleteError) throwAudioLessonsDatabaseError(deleteError);
    const { error: insertError } = await this.supabase.from('audio_lesson_audio_files').insert(sections.map((section) => ({
      lesson_version_id: updated.id,
      section_id: section.id,
      audio_url: section.audioUrl ?? null,
      provider,
      voice: section.speaker.voice ?? null,
      duration_ms: section.estimatedDurationMs,
      content_hash: audioContentHash({ text: section.text, language: section.speaker.language, voice: section.speaker.voice, speakingRate: section.speakingRate }),
      status: section.audioStatus,
    })));
    if (insertError) throwAudioLessonsDatabaseError(insertError);
    return updated;
  }

  async createGenerationRun(lessonVersionId: string, input: unknown): Promise<string> {
    const { data, error } = await this.supabase.from('audio_lesson_generation_runs')
      .insert({ lesson_version_id: lessonVersionId, kind: 'tts_sections', input, status: 'running' })
      .select('id').single();
    if (error) throwAudioLessonsDatabaseError(error);
    return (data as { id: string }).id;
  }

  async finishGenerationRun(runId: string, output: unknown, failure?: string): Promise<void> {
    const { error } = await this.supabase.from('audio_lesson_generation_runs')
      .update({ output, status: failure ? 'failed' : 'completed', error_message: failure ?? null, completed_at: new Date().toISOString() })
      .eq('id', runId);
    if (error) throwAudioLessonsDatabaseError(error);
  }

  async listPlaylists(publishedOnly = true): Promise<AudioPlaylist[]> {
    let query = this.supabase.from('audio_lesson_playlists').select('id, slug, title, description, level, lesson_type, updated_at').order('updated_at', { ascending: false });
    if (publishedOnly) query = query.eq('status', 'published');
    const { data, error } = await query;
    if (error) throwAudioLessonsDatabaseError(error);
    const rows = (data ?? []).map(asPlaylistRow);
    if (!rows.length) return [];
    const { data: entries, error: entriesError } = await this.supabase.from('audio_lesson_playlist_entries').select('playlist_id, lesson_id, position').in('playlist_id', rows.map((row) => row.id)).order('position', { ascending: true });
    if (entriesError) throwAudioLessonsDatabaseError(entriesError);
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      jlptLevel: row.level ?? undefined,
      lessonType: row.lesson_type ?? undefined,
      lessonIds: (entries ?? []).filter((entry) => entry.playlist_id === row.id).map((entry) => entry.lesson_id),
      updatedAt: utcTimestamp(row.updated_at),
    })).filter((playlist) => playlist.lessonIds.length > 0);
  }

  private async replaceReferencesAndDependencies(lesson: AudioLessonVersion): Promise<void> {
    const { error: dependencyDeleteError } = await this.supabase.from('audio_lesson_version_dependencies').delete().eq('lesson_version_id', lesson.id);
    if (dependencyDeleteError) throwAudioLessonsDatabaseError(dependencyDeleteError);
    const dependencies = [
      ...lesson.vocabularyIds.map((id) => ({ dependency_type: 'vocabulary', dependency_id: id })),
      ...lesson.kanjiIds.map((id) => ({ dependency_type: 'kanji', dependency_id: id })),
      ...lesson.grammarIds.map((id) => ({ dependency_type: 'grammar', dependency_id: id })),
      ...lesson.relatedLessonIds.map((id) => ({ dependency_type: 'related_lesson', dependency_id: id })),
      ...lesson.sourceReferences.map((reference) => ({ dependency_type: 'source_chunk', dependency_id: reference.sourceChunkId })),
    ];
    if (dependencies.length) {
      const { error } = await this.supabase.from('audio_lesson_version_dependencies').insert(dependencies.map((dependency) => ({ lesson_version_id: lesson.id, ...dependency, resolution_status: 'resolved' })));
      if (error) throwAudioLessonsDatabaseError(error);
    }
    const { error: referencesDeleteError } = await this.supabase.from('audio_lesson_source_references').delete().eq('lesson_version_id', lesson.id);
    if (referencesDeleteError) throwAudioLessonsDatabaseError(referencesDeleteError);
    const uniqueReferences = new Map(lesson.sourceReferences.map((reference) => [reference.id, reference]));
    if (!uniqueReferences.size) return;
    const { error: referencesInsertError } = await this.supabase.from('audio_lesson_source_references').insert([...uniqueReferences.values()].map((reference) => ({
      lesson_version_id: lesson.id,
      reference_id: reference.id,
      source_chunk_id: reference.sourceChunkId,
      source_path: reference.sourcePath,
      source_role: reference.sourceRole,
      note: reference.note ?? null,
      excerpt_hash: reference.excerptHash ?? null,
    })));
    if (referencesInsertError) throwAudioLessonsDatabaseError(referencesInsertError);
  }
}
