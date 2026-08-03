import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import { lessonV2QuestionDraftInputSchema, lessonV2QuestionSchema, type LessonV2Question } from './contracts';
import { LessonsV2Error } from './errors';
import { extractOfficialAnswerKey } from './question-papers/answer-key-mapper';
import { extractSourceQuestion, type ExtractedSourceQuestion } from './question-papers/source-extractor';
import { classifyJlptQuestionPattern } from './question-taxonomy';
import { validateJlptQuestion } from './question-validator';
import { highestSourceSimilarity } from './similarity';
import { createLessonsV2SupabaseClient, throwLessonsV2DatabaseError } from './supabase';

const correctionSchema = z.object({
  correctedTranscription: z.string().min(1).max(20000).nullable().optional(),
  officialAnswer: z.string().trim().max(16).nullable().optional(),
  answerStatus: z.enum(['official', 'unknown', 'ai_suggested', 'rejected']).optional(),
  sourceQuality: z.enum(['verified', 'needs_review', 'corrupted', 'rejected']).optional(),
}).strict();

function paperInfo(sourcePath: string): { prefix: string; level: 'N5' | 'N4'; edition: string } | undefined {
  const match = sourcePath.match(/(.*question-papers-jlpt_jlpt-(n[45])-([\d-]+))_page-\d+\.md$/iu);
  if (!match) return undefined;
  return { prefix: match[1], level: match[2].toUpperCase() as 'N5' | 'N4', edition: match[3] };
}

export class LessonsV2QuestionService {
  constructor(private readonly supabase: SupabaseClient = createLessonsV2SupabaseClient()) {}

  async listPapers(): Promise<unknown[]> {
    const { data, error } = await this.supabase.from('lesson_v2_jlpt_papers').select('*').order('level').order('edition');
    if (error) throwLessonsV2DatabaseError(error);
    return data ?? [];
  }

  async importQuestionPaperSources(): Promise<{ papers: number; sourceQuestions: number; skipped: number }> {
    const { data: documents, error: documentsError } = await this.supabase
      .from('japanese_ocr_documents')
      .select('id, source_path, book')
      .eq('source_type', 'question-paper')
      .in('book', ['JLPT N5', 'JLPT N4']);
    if (documentsError) throwLessonsV2DatabaseError(documentsError);
    let papers = 0;
    let sourceQuestions = 0;
    let skipped = 0;
    for (const document of documents ?? []) {
      if (typeof document.id !== 'string' || typeof document.source_path !== 'string') continue;
      const info = paperInfo(document.source_path);
      if (!info) { skipped += 1; continue; }
      const { data: paper, error: paperError } = await this.supabase.from('lesson_v2_jlpt_papers').upsert({
        source_path_prefix: info.prefix, level: info.level, edition: info.edition,
      }, { onConflict: 'source_path_prefix' }).select('id').single();
      if (paperError) throwLessonsV2DatabaseError(paperError);
      papers += 1;
      const { data: chunks, error: chunksError } = await this.supabase.from('japanese_ocr_chunks')
        .select('id, content, document_id')
        .eq('document_id', document.id);
      if (chunksError) throwLessonsV2DatabaseError(chunksError);
      for (const chunk of chunks ?? []) {
        if (typeof chunk.id !== 'string' || typeof chunk.content !== 'string') continue;
        const extracted = extractSourceQuestion({ id: chunk.id, sourcePath: document.source_path, content: chunk.content });
        if (!extracted) { skipped += 1; continue; }
        const { error: sourceError } = await this.supabase.from('lesson_v2_jlpt_source_questions').upsert({
          paper_id: paper.id,
          source_chunk_id: extracted.sourceChunkId,
          source_transcription: extracted.sourceTranscription,
          level: extracted.level ?? info.level,
          section: extracted.section ?? null,
          question_number: extracted.questionNumber ?? null,
          source_quality: extracted.sourceQuality,
          answer_status: 'unknown',
        }, { onConflict: 'paper_id,source_chunk_id,question_number', ignoreDuplicates: true });
        if (sourceError) throwLessonsV2DatabaseError(sourceError);
        sourceQuestions += 1;
        for (const answer of extractOfficialAnswerKey(chunk.content)) {
          const { error: answerError } = await this.supabase.from('lesson_v2_jlpt_answer_keys').upsert({
            paper_id: paper.id,
            source_chunk_id: chunk.id,
            section: extracted.section ?? null,
            question_number: answer.questionNumber,
            answer_choice: answer.answerChoice ?? null,
            status: answer.status,
          }, { onConflict: 'paper_id,section,question_number' });
          if (answerError) throwLessonsV2DatabaseError(answerError);
        }
      }
    }
    return { papers, sourceQuestions, skipped };
  }

  async listSourceQuestions(paperId?: string): Promise<unknown[]> {
    let query = this.supabase.from('lesson_v2_jlpt_source_questions')
      .select('id, paper_id, source_chunk_id, source_transcription, corrected_transcription, level, section, question_number, source_quality, official_answer, ai_suggested_answer, answer_status, created_at')
      .order('created_at');
    if (paperId) query = query.eq('paper_id', paperId);
    const { data, error } = await query;
    if (error) throwLessonsV2DatabaseError(error);
    return data ?? [];
  }

  async correctSourceQuestion(sourceQuestionId: string, input: unknown): Promise<unknown> {
    const patch = correctionSchema.parse(input);
    const { data, error } = await this.supabase.from('lesson_v2_jlpt_source_questions')
      .update({
        corrected_transcription: patch.correctedTranscription,
        official_answer: patch.officialAnswer,
        answer_status: patch.answerStatus,
        source_quality: patch.sourceQuality,
      })
      .eq('id', sourceQuestionId)
      .select('*')
      .maybeSingle();
    if (error) throwLessonsV2DatabaseError(error);
    if (!data) throw new LessonsV2Error('NOT_FOUND', 'Source question was not found.', 404);
    return data;
  }

  async extractPatterns(): Promise<{ created: number; skipped: number }> {
    const { data, error } = await this.supabase.from('lesson_v2_jlpt_source_questions')
      .select('id, source_chunk_id, source_transcription, corrected_transcription, level, section, source_quality')
      .eq('source_quality', 'verified');
    if (error) throwLessonsV2DatabaseError(error);
    let created = 0;
    let skipped = 0;
    for (const row of data ?? []) {
      if (typeof row.id !== 'string' || typeof row.source_chunk_id !== 'string' || typeof row.source_transcription !== 'string' || (row.level !== 'N5' && row.level !== 'N4')) { skipped += 1; continue; }
      const extracted: ExtractedSourceQuestion = {
        sourceChunkId: row.source_chunk_id,
        sourcePath: '',
        sourceTranscription: typeof row.corrected_transcription === 'string' ? row.corrected_transcription : row.source_transcription,
        level: row.level,
        section: row.section === 'vocabulary_kanji' || row.section === 'grammar' || row.section === 'reading' || row.section === 'listening' ? row.section : undefined,
        sourceQuality: 'verified',
        warnings: [],
      };
      const type = classifyJlptQuestionPattern(extracted);
      if (!type || !extracted.section) { skipped += 1; continue; }
      const { error: insertError } = await this.supabase.from('lesson_v2_jlpt_patterns').insert({
        level: extracted.level,
        section: extracted.section,
        type,
        instruction_pattern: type,
        structure: { choiceCount: 4, sourceQuestionId: row.id },
        source_question_ids: [row.id],
        source_chunk_ids: [row.source_chunk_id],
        confidence: 0.6,
        status: 'needs_review',
      });
      if (insertError?.code === '23505') { skipped += 1; continue; }
      if (insertError) throwLessonsV2DatabaseError(insertError);
      created += 1;
    }
    return { created, skipped };
  }

  async listPatterns(): Promise<unknown[]> {
    const { data, error } = await this.supabase.from('lesson_v2_jlpt_patterns').select('*').order('level').order('section').order('type');
    if (error) throwLessonsV2DatabaseError(error);
    return data ?? [];
  }

  async setPatternStatus(patternId: string, status: 'needs_review' | 'approved' | 'archived'): Promise<unknown> {
    const { data, error } = await this.supabase.from('lesson_v2_jlpt_patterns').update({ status }).eq('id', patternId).select('*').maybeSingle();
    if (error) throwLessonsV2DatabaseError(error);
    if (!data) throw new LessonsV2Error('NOT_FOUND', 'Question pattern was not found.', 404);
    return data;
  }

  async createGeneratedQuestion(input: unknown): Promise<{ question: LessonV2Question; similarityScore: number; blocked: boolean }> {
    const parsed = lessonV2QuestionDraftInputSchema.parse(input);
    const question = lessonV2QuestionSchema.parse(parsed.question);
    const chunkIds = question.sourceReferences.map((reference) => reference.sourceChunkId);
    const { data: chunks, error: chunksError } = await this.supabase.from('japanese_ocr_chunks').select('content').in('id', chunkIds);
    if (chunksError) throwLessonsV2DatabaseError(chunksError);
    const sourceTexts = (chunks ?? []).flatMap((chunk) => typeof chunk.content === 'string' ? [chunk.content] : []);
    const { data: patterns, error: patternError } = await this.supabase.from('lesson_v2_jlpt_patterns').select('id').in('id', question.sourcePatternIds).eq('status', 'approved');
    if (patternError) throwLessonsV2DatabaseError(patternError);
    const validation = validateJlptQuestion(question, { approvedPatternIds: new Set((patterns ?? []).flatMap((pattern) => typeof pattern.id === 'string' ? [pattern.id] : [])), sourceTexts });
    const candidateText = [question.instruction.raw, question.passage?.raw ?? '', question.prompt.raw, ...question.choices.map((choice) => choice.label.japanese?.raw ?? '')].join('\n');
    const similarityScore = highestSourceSimilarity(candidateText, sourceTexts);
    const blocked = validation.issues.some((issue) => issue.severity === 'critical');
    const { error } = await this.supabase.from('lesson_v2_generated_questions').insert({
      lesson_version_id: parsed.lessonVersionId ?? null,
      level: question.level,
      question_type: question.type,
      section: question.section,
      content: question,
      status: blocked ? 'draft' : 'review',
      similarity_score: similarityScore,
    });
    if (error) throwLessonsV2DatabaseError(error);
    return { question, similarityScore, blocked };
  }

  async assembleMockTest(level: 'N5' | 'N4', localUserId: string, requestedCount: number): Promise<LessonV2Question[]> {
    const { data: rows, error } = await this.supabase.from('lesson_v2_generated_questions')
      .select('id, content').eq('level', level).in('status', ['approved', 'published']).order('created_at').limit(100);
    if (error) throwLessonsV2DatabaseError(error);
    const ids = (rows ?? []).flatMap((row) => typeof row.id === 'string' ? [row.id] : []);
    const { data: exposureRows, error: exposureError } = ids.length
      ? await this.supabase.from('lesson_v2_question_exposures').select('generated_question_id').eq('local_user_id', localUserId).in('generated_question_id', ids).order('seen_at', { ascending: false }).limit(80)
      : { data: [], error: null };
    if (exposureError) throwLessonsV2DatabaseError(exposureError);
    const recentlySeen = new Set((exposureRows ?? []).flatMap((row) => typeof row.generated_question_id === 'string' ? [row.generated_question_id] : []));
    const selected = (rows ?? []).filter((row) => typeof row.id === 'string' && !recentlySeen.has(row.id)).slice(0, Math.max(1, Math.min(requestedCount, 40)));
    const questions = selected.map((row) => lessonV2QuestionSchema.parse(row.content));
    if (selected.length) {
      const { error: writeError } = await this.supabase.from('lesson_v2_question_exposures').insert(selected.map((row) => ({ local_user_id: localUserId, generated_question_id: row.id })));
      if (writeError) throwLessonsV2DatabaseError(writeError);
    }
    return questions;
  }

  async listGeneratedQuestions(): Promise<unknown[]> {
    const { data, error } = await this.supabase.from('lesson_v2_generated_questions')
      .select('id, lesson_version_id, level, question_type, section, status, similarity_score, created_at, published_at')
      .order('created_at', { ascending: false });
    if (error) throwLessonsV2DatabaseError(error);
    return data ?? [];
  }

  async setGeneratedQuestionStatus(questionId: string, status: 'approved' | 'published' | 'archived'): Promise<unknown> {
    const { data: row, error: findError } = await this.supabase.from('lesson_v2_generated_questions')
      .select('id, content, similarity_score').eq('id', questionId).maybeSingle();
    if (findError) throwLessonsV2DatabaseError(findError);
    if (!row) throw new LessonsV2Error('NOT_FOUND', 'Generated question was not found.', 404);
    const question = lessonV2QuestionSchema.parse(row.content);
    if (status === 'published' && (question.validationStatus !== 'valid' || Number(row.similarity_score ?? 1) >= 0.82)) {
      throw new LessonsV2Error('VALIDATION_FAILED', 'Only valid, original generated questions can publish.', 422);
    }
    const { data, error } = await this.supabase.from('lesson_v2_generated_questions')
      .update({ status, published_at: status === 'published' ? new Date().toISOString() : null })
      .eq('id', questionId).select('*').maybeSingle();
    if (error) throwLessonsV2DatabaseError(error);
    return data;
  }
}
