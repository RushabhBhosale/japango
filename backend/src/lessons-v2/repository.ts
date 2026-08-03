import type { SupabaseClient } from '@supabase/supabase-js';

import {
  contentHash,
  lessonV2VersionSchema,
  type LessonV2DraftInput,
  type LessonV2UpdateDraftInput,
  type LessonV2ValidationIssue,
  type LessonV2Version,
} from './contracts';
import { LessonsV2Error } from './errors';
import { createLessonsV2SupabaseClient, throwLessonsV2DatabaseError } from './supabase';

interface LessonRow {
  id: string;
  slug: string;
  level: 'N5' | 'N4';
  status: 'draft' | 'review' | 'published' | 'archived';
  current_published_version_id: string | null;
}

interface VersionRow {
  id: string;
  lesson_id: string;
  version: number;
  status: 'draft' | 'review' | 'published' | 'archived';
  title: string;
  objectives: unknown;
  estimated_minutes: number;
  content: unknown;
  created_at: string;
  published_at: string | null;
}

function asLessonRow(value: unknown): LessonRow {
  return value as LessonRow;
}

function asVersionRow(value: unknown): VersionRow {
  return value as VersionRow;
}

function toVersion(lesson: LessonRow, row: VersionRow): LessonV2Version {
  const content = row.content as { sections?: unknown; sourceReferences?: unknown };
  return lessonV2VersionSchema.parse({
    id: row.id,
    lessonId: row.lesson_id,
    version: row.version,
    status: row.status,
    level: lesson.level,
    title: row.title,
    slug: lesson.slug,
    objectives: row.objectives,
    estimatedMinutes: row.estimated_minutes,
    sections: content.sections ?? [],
    sourceReferences: content.sourceReferences ?? [],
    createdAt: row.created_at,
    publishedAt: row.published_at ?? undefined,
  });
}

export class LessonsV2Repository {
  constructor(private readonly supabase: SupabaseClient = createLessonsV2SupabaseClient()) {}

  async listLessons(options: { publishedOnly?: boolean } = {}): Promise<LessonV2Version[]> {
    let lessonQuery = this.supabase
      .from('lesson_v2_lessons')
      .select('id, slug, level, status, current_published_version_id')
      .order('updated_at', { ascending: false });
    if (options.publishedOnly) lessonQuery = lessonQuery.eq('status', 'published');
    const { data: lessonRows, error: lessonError } = await lessonQuery;
    if (lessonError) throwLessonsV2DatabaseError(lessonError);
    const lessons = (lessonRows ?? []).map(asLessonRow);
    if (!lessons.length) return [];
    const ids = lessons.map((lesson) => options.publishedOnly ? lesson.current_published_version_id : lesson.id).filter((value): value is string => Boolean(value));
    if (!ids.length) return [];
    const versionQuery = this.supabase.from('lesson_v2_lesson_versions').select('id, lesson_id, version, status, title, objectives, estimated_minutes, content, created_at, published_at');
    const { data: versionRows, error: versionError } = options.publishedOnly
      ? await versionQuery.in('id', ids)
      : await versionQuery.in('lesson_id', ids).order('version', { ascending: false });
    if (versionError) throwLessonsV2DatabaseError(versionError);
    const byLesson = new Map<string, VersionRow>();
    for (const row of (versionRows ?? []).map(asVersionRow)) if (!byLesson.has(row.lesson_id)) byLesson.set(row.lesson_id, row);
    return lessons.flatMap((lesson) => {
      const version = byLesson.get(lesson.id);
      return version ? [toVersion(lesson, version)] : [];
    });
  }

  async getLesson(lessonId: string, publishedOnly = false): Promise<LessonV2Version> {
    const { data: lessonData, error: lessonError } = await this.supabase
      .from('lesson_v2_lessons')
      .select('id, slug, level, status, current_published_version_id')
      .eq('id', lessonId)
      .maybeSingle();
    if (lessonError) throwLessonsV2DatabaseError(lessonError);
    if (!lessonData) throw new LessonsV2Error('NOT_FOUND', 'Lessons V2 lesson was not found.', 404);
    const lesson = asLessonRow(lessonData);
    if (publishedOnly && (lesson.status !== 'published' || !lesson.current_published_version_id)) {
      throw new LessonsV2Error('NOT_FOUND', 'Published Lessons V2 lesson was not found.', 404);
    }
    const query = this.supabase.from('lesson_v2_lesson_versions').select('id, lesson_id, version, status, title, objectives, estimated_minutes, content, created_at, published_at');
    const { data: versionData, error: versionError } = publishedOnly
      ? await query.eq('id', lesson.current_published_version_id!).maybeSingle()
      : await query.eq('lesson_id', lesson.id).order('version', { ascending: false }).limit(1).maybeSingle();
    if (versionError) throwLessonsV2DatabaseError(versionError);
    if (!versionData) throw new LessonsV2Error('NOT_FOUND', 'Lessons V2 lesson version was not found.', 404);
    return toVersion(lesson, asVersionRow(versionData));
  }

  async createDraft(input: LessonV2DraftInput): Promise<LessonV2Version> {
    const { data: lessonData, error: lessonError } = await this.supabase
      .from('lesson_v2_lessons')
      .insert({ slug: input.slug, level: input.level, status: 'draft' })
      .select('id, slug, level, status, current_published_version_id')
      .single();
    if (lessonError) throwLessonsV2DatabaseError(lessonError);
    const lesson = asLessonRow(lessonData);
    const payload = { sections: input.sections, sourceReferences: input.sourceReferences };
    const { data: versionData, error: versionError } = await this.supabase
      .from('lesson_v2_lesson_versions')
      .insert({
        lesson_id: lesson.id,
        version: 1,
        status: 'draft',
        title: input.title,
        objectives: input.objectives,
        estimated_minutes: input.estimatedMinutes,
        content: payload,
        content_hash: contentHash({ ...input, payload }),
      })
      .select('id, lesson_id, version, status, title, objectives, estimated_minutes, content, created_at, published_at')
      .single();
    if (versionError) throwLessonsV2DatabaseError(versionError);
    return toVersion(lesson, asVersionRow(versionData));
  }

  async updateLatestDraft(lessonId: string, input: LessonV2UpdateDraftInput): Promise<LessonV2Version> {
    const current = await this.getLesson(lessonId);
    if (current.status === 'published') throw new LessonsV2Error('CONFLICT', 'Create a new version instead of editing a published lesson.', 409);
    const next = {
      title: input.title ?? current.title,
      objectives: input.objectives ?? current.objectives,
      estimatedMinutes: input.estimatedMinutes ?? current.estimatedMinutes,
      sections: input.sections ?? current.sections,
      sourceReferences: input.sourceReferences ?? current.sourceReferences,
      status: input.status ?? current.status,
    };
    const { error } = await this.supabase
      .from('lesson_v2_lesson_versions')
      .update({
        status: next.status,
        title: next.title,
        objectives: next.objectives,
        estimated_minutes: next.estimatedMinutes,
        content: { sections: next.sections, sourceReferences: next.sourceReferences },
        content_hash: contentHash(next),
      })
      .eq('id', current.id);
    if (error) throwLessonsV2DatabaseError(error);
    return this.getLesson(lessonId);
  }

  async duplicate(lessonId: string, slug: string): Promise<LessonV2Version> {
    const source = await this.getLesson(lessonId);
    return this.createDraft({
      slug,
      level: source.level,
      title: `${source.title} copy`,
      objectives: source.objectives,
      estimatedMinutes: source.estimatedMinutes,
      sections: source.sections,
      sourceReferences: source.sourceReferences,
    });
  }

  /** Creates a mutable successor while retaining the published snapshot unchanged. */
  async createNextVersion(lessonId: string): Promise<LessonV2Version> {
    const source = await this.getLesson(lessonId);
    const { data: versionData, error } = await this.supabase.from('lesson_v2_lesson_versions').insert({
      lesson_id: source.lessonId,
      version: source.version + 1,
      status: 'draft',
      title: source.title,
      objectives: source.objectives,
      estimated_minutes: source.estimatedMinutes,
      content: { sections: source.sections, sourceReferences: source.sourceReferences },
      content_hash: contentHash({ sourceVersionId: source.id, nextVersion: source.version + 1, title: source.title, sections: source.sections, sourceReferences: source.sourceReferences }),
    }).select('id, lesson_id, version, status, title, objectives, estimated_minutes, content, created_at, published_at').single();
    if (error) throwLessonsV2DatabaseError(error);
    const { data: lessonData, error: lessonError } = await this.supabase.from('lesson_v2_lessons')
      .select('id, slug, level, status, current_published_version_id').eq('id', lessonId).single();
    if (lessonError) throwLessonsV2DatabaseError(lessonError);
    return toVersion(asLessonRow(lessonData), asVersionRow(versionData));
  }

  async publish(lessonId: string, issues: LessonV2ValidationIssue[]): Promise<LessonV2Version> {
    const lesson = await this.getLesson(lessonId);
    if (issues.some((issue) => issue.severity === 'critical')) {
      await this.replaceValidationIssues(lesson.id, issues);
      throw new LessonsV2Error('VALIDATION_FAILED', 'Resolve critical Lessons V2 validation issues before publishing.', 422);
    }
    const now = new Date().toISOString();
    const { error: versionError } = await this.supabase.from('lesson_v2_lesson_versions')
      .update({ status: 'published', published_at: now })
      .eq('id', lesson.id);
    if (versionError) throwLessonsV2DatabaseError(versionError);
    const { error: lessonError } = await this.supabase.from('lesson_v2_lessons')
      .update({ status: 'published', current_published_version_id: lesson.id, updated_at: now })
      .eq('id', lesson.lessonId);
    if (lessonError) throwLessonsV2DatabaseError(lessonError);
    return this.getLesson(lesson.lessonId, true);
  }

  async archive(lessonId: string): Promise<void> {
    const { error } = await this.supabase.from('lesson_v2_lessons')
      .update({ status: 'archived', current_published_version_id: null, updated_at: new Date().toISOString() })
      .eq('id', lessonId);
    if (error) throwLessonsV2DatabaseError(error);
  }

  async replaceValidationIssues(lessonVersionId: string, issues: LessonV2ValidationIssue[]): Promise<void> {
    const { error: deleteError } = await this.supabase.from('lesson_v2_validation_issues').delete().eq('lesson_version_id', lessonVersionId).is('resolved_at', null);
    if (deleteError) throwLessonsV2DatabaseError(deleteError);
    if (!issues.length) return;
    const { error: insertError } = await this.supabase.from('lesson_v2_validation_issues').insert(issues.map((issue) => ({
      lesson_version_id: lessonVersionId,
      severity: issue.severity,
      subject_id: issue.subjectId,
      issue_type: issue.issueType,
      message: issue.message,
      suggested_fix: issue.suggestedFix ?? null,
      source_pattern_id: issue.sourcePatternId ?? null,
      source_chunk_id: issue.sourceChunkId ?? null,
    })));
    if (insertError) throwLessonsV2DatabaseError(insertError);
  }

  async unresolvedDependencyIssues(lessonVersionId: string): Promise<LessonV2ValidationIssue[]> {
    const { data, error } = await this.supabase.from('lesson_v2_version_dependencies')
      .select('dependency_type, dependency_id').eq('lesson_version_id', lessonVersionId).in('resolution_status', ['missing', 'needs_review']);
    if (error) throwLessonsV2DatabaseError(error);
    return (data ?? []).flatMap((row) => typeof row.dependency_type === 'string' && typeof row.dependency_id === 'string'
      ? [{ severity: 'critical' as const, subjectId: row.dependency_id, issueType: 'unresolved_dependency', message: `${row.dependency_type} dependency is unresolved and blocks publishing.` }]
      : []);
  }
}
