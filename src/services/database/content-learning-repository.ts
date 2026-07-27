import { z } from 'zod';

import type { CurriculumWithMastery } from '@/types/learning';
import type {
  ContentLessonType, ContentPracticeQuestion, ContentSentence, ContentStudyResult, ContentStudySession,
  CurriculumSearchResult, GrammarLesson, KanjiLesson, LinkedCurriculumItem, ListeningLesson, ReadingLesson,
} from '@/types/content-learning';
import { createLocalId } from '@/utils/id';

import { getDatabase } from './database';
import { getLearnerProfile } from './profile-repository';
import { recordLearningAttempt } from './progress-repository';
import { mapAttemptRow, mapCurriculumRow, mapMasteryRow, type AttemptRow, type CurriculumRow, type MasteryRow } from './row-mappers';

const contentTypeSchema = z.enum(['grammar', 'kanji', 'reading', 'listening']);
const stringArraySchema = z.array(z.string().min(1));
const optionsSchema = z.array(z.object({ id: z.string().min(1), label: z.string().min(1), feedback: z.string().nullable() }).strict()).min(2);
const grammarDetailSchema = z.object({
  meanings: z.array(z.string().min(1)), formation: z.array(z.object({ base: z.string(), structure: z.string() }).strict()),
  relatedGrammarIds: stringArraySchema, notes: z.string().nullable(),
}).strict();
const kanjiDetailSchema = z.object({
  meanings: z.array(z.string().min(1)), onReadings: z.array(z.string()), kunReadings: z.array(z.string()), strokeCount: z.number().int().positive().nullable(),
  vocabularyIds: stringArraySchema, relatedKanjiIds: stringArraySchema, components: z.array(z.string()),
}).strict();
const readingDetailSchema = z.object({
  japanese: z.string().min(1), reading: z.string().min(1), english: z.string().min(1), passageType: z.string().min(1), difficultyRank: z.number().int(),
  estimatedReadingSeconds: z.number().int().positive(), vocabularyIds: stringArraySchema, grammarIds: z.array(z.string()), kanjiIds: z.array(z.string()), questionIds: stringArraySchema,
}).passthrough();
const listeningDetailSchema = z.object({
  activityType: z.string().min(1), transcript: z.string().min(1), learnerTranscript: z.string().nullable(), speechText: z.string().min(1), english: z.string().min(1),
  difficultyRank: z.number().int(), estimatedDurationSeconds: z.number().int().positive(), vocabularyIds: stringArraySchema, grammarIds: z.array(z.string()), kanjiIds: z.array(z.string()), questionIds: stringArraySchema,
  turns: z.array(z.object({ id: z.string(), position: z.number().int(), speakerLabel: z.string(), displayText: z.string(), speechText: z.string(), reading: z.string(), english: z.string(), pauseAfterMs: z.number().int() }).strict()),
}).passthrough();

interface CurriculumMasteryRow extends CurriculumRow, MasteryRow { detail_json: string; }
interface ContentQuestionRow { id: string; item_id: string; domain: ContentLessonType; level: 'N5' | 'N4'; presentation: string; prompt: string; explanation: string | null; correct_option_id: string; options_json: string; }
interface ContentSessionRow { id: string; content_type: ContentLessonType; status: 'in-progress' | 'completed'; item_id: string; question_ids_json: string; current_index: number; created_at: string; updated_at: string; completed_at: string | null; }

const masterySelect = `
  SELECT c.id, c.type, c.level, c.title, c.meaning, c.reading, c.explanation, c.tags_json,
    m.user_id, m.item_id, m.mastery_score, m.confidence_score, m.correct_count, m.incorrect_count,
    m.average_response_time_ms, m.last_reviewed_at, m.next_review_at, m.review_interval_days, m.status,
    d.detail_json
  FROM curriculum_items AS c
  INNER JOIN learner_profile AS p ON 1 = 1
  INNER JOIN user_mastery AS m ON m.item_id = c.id AND m.user_id = p.id
  INNER JOIN curriculum_content_details AS d ON d.item_id = c.id
  WHERE c.curriculum_source = 'bundled' AND c.release_ready = 1`;

function mapMastered(row: CurriculumMasteryRow): CurriculumWithMastery {
  const mastery = mapMasteryRow(row);
  return { ...mapCurriculumRow(row), mastery };
}

function mapQuestion(row: ContentQuestionRow): ContentPracticeQuestion {
  const options = optionsSchema.parse(JSON.parse(row.options_json) as unknown);
  if (!options.some((option) => option.id === row.correct_option_id)) throw new Error(`Question ${row.id} has no correct option.`);
  return { id: row.id, itemId: row.item_id, domain: contentTypeSchema.parse(row.domain), level: row.level, presentation: row.presentation, prompt: row.prompt, explanation: row.explanation ?? undefined, correctOptionId: row.correct_option_id, options: options.map((option) => ({ id: option.id, label: option.label, feedback: option.feedback ?? undefined })) };
}

async function linkedItems(ids: string[]): Promise<LinkedCurriculumItem[]> {
  if (!ids.length) return [];
  const database = await getDatabase();
  const rows = await database.getAllAsync<Pick<CurriculumRow, 'id' | 'title' | 'meaning' | 'reading'>>(
    `SELECT id, title, meaning, reading FROM curriculum_items WHERE id IN (${ids.map(() => '?').join(', ')}) AND curriculum_source = 'bundled' AND release_ready = 1`,
    ...ids,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [{ id: row.id, title: row.title, meaning: row.meaning ?? undefined, reading: row.reading ?? undefined }] : [];
  });
}

async function linkedSentences(itemId: string, linkTable: 'mobile_sentence_grammar_links' | 'kanji_sentence_links', column: 'grammar_id' | 'kanji_id'): Promise<ContentSentence[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ id: string; japanese: string; reading: string; english: string }>(
    `SELECT sentences.id, sentences.japanese, sentences.reading, sentences.english
     FROM ${linkTable} AS links INNER JOIN mobile_sentences AS sentences ON sentences.id = links.sentence_id
     WHERE links.${column} = ? ORDER BY CASE links.relationship_role WHEN 'focus' THEN 0 ELSE 1 END, links.id LIMIT 6`,
    itemId,
  );
  return rows.map((row) => ({ id: row.id, japanese: row.japanese, reading: row.reading, meaning: row.english }));
}

async function questionCount(itemId: string): Promise<number> {
  const database = await getDatabase();
  return (await database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM canonical_practice_question_bank WHERE item_id = ?', itemId))?.count ?? 0;
}

async function isBookmarked(itemId: string): Promise<boolean> {
  const database = await getDatabase();
  return Boolean(await database.getFirstAsync<{ item_id: string }>('SELECT bookmarks.item_id FROM curriculum_bookmarks AS bookmarks INNER JOIN learner_profile AS profile ON profile.id = bookmarks.user_id WHERE bookmarks.item_id = ?', itemId));
}

async function getLessonRow(id: string, type: ContentLessonType): Promise<CurriculumMasteryRow | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<CurriculumMasteryRow>(`${masterySelect} AND c.id = ? AND c.type = ? AND d.content_type = ?`, id, type, type);
  return row ?? undefined;
}

export async function getGrammarById(id: string): Promise<GrammarLesson | undefined> {
  const row = await getLessonRow(id, 'grammar');
  if (!row) return undefined;
  const detail = grammarDetailSchema.parse(JSON.parse(row.detail_json) as unknown);
  const [relatedGrammar, examples, bookmarked, questions] = await Promise.all([linkedItems(detail.relatedGrammarIds), linkedSentences(id, 'mobile_sentence_grammar_links', 'grammar_id'), isBookmarked(id), questionCount(id)]);
  return { ...mapMastered(row), ...detail, notes: detail.notes ?? undefined, relatedGrammar, examples, bookmarked, questionCount: questions };
}

export async function getKanjiById(id: string): Promise<KanjiLesson | undefined> {
  const row = await getLessonRow(id, 'kanji');
  if (!row) return undefined;
  const detail = kanjiDetailSchema.parse(JSON.parse(row.detail_json) as unknown);
  const [linkedVocabulary, relatedKanji, examples, bookmarked, questions] = await Promise.all([linkedItems(detail.vocabularyIds), linkedItems(detail.relatedKanjiIds), linkedSentences(id, 'kanji_sentence_links', 'kanji_id'), isBookmarked(id), questionCount(id)]);
  return { ...mapMastered(row), ...detail, strokeCount: detail.strokeCount ?? undefined, linkedVocabulary, relatedKanji, examples, bookmarked, questionCount: questions };
}

export async function getReadingById(id: string): Promise<ReadingLesson | undefined> {
  const row = await getLessonRow(id, 'reading');
  if (!row) return undefined;
  const detail = readingDetailSchema.parse(JSON.parse(row.detail_json) as unknown);
  const [linkedVocabulary, linkedGrammar, bookmarked, questions] = await Promise.all([linkedItems(detail.vocabularyIds), linkedItems(detail.grammarIds), isBookmarked(id), questionCount(id)]);
  return { ...mapMastered(row), japanese: detail.japanese, readingText: detail.reading, translation: detail.english, passageType: detail.passageType, difficultyRank: detail.difficultyRank, estimatedReadingSeconds: detail.estimatedReadingSeconds, linkedVocabulary, linkedGrammar, bookmarked, questionCount: questions };
}

export async function getListeningById(id: string): Promise<ListeningLesson | undefined> {
  const row = await getLessonRow(id, 'listening');
  if (!row) return undefined;
  const detail = listeningDetailSchema.parse(JSON.parse(row.detail_json) as unknown);
  const [linkedVocabulary, linkedGrammar, bookmarked, questions] = await Promise.all([linkedItems(detail.vocabularyIds), linkedItems(detail.grammarIds), isBookmarked(id), questionCount(id)]);
  return { ...mapMastered(row), activityType: detail.activityType, transcript: detail.transcript, learnerTranscript: detail.learnerTranscript ?? undefined, speechText: detail.speechText, translation: detail.english, difficultyRank: detail.difficultyRank, estimatedDurationSeconds: detail.estimatedDurationSeconds, turns: detail.turns, linkedVocabulary, linkedGrammar, bookmarked, questionCount: questions };
}

export async function getContentQuestions(itemId: string): Promise<ContentPracticeQuestion[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<ContentQuestionRow>('SELECT id, item_id, domain, level, presentation, prompt, explanation, correct_option_id, options_json FROM canonical_practice_question_bank WHERE item_id = ? ORDER BY id', itemId);
  return rows.map(mapQuestion);
}

async function getQuestionSet(questionIds: string[]): Promise<ContentPracticeQuestion[]> {
  if (!questionIds.length) return [];
  const database = await getDatabase();
  const rows = await database.getAllAsync<ContentQuestionRow>(`SELECT id, item_id, domain, level, presentation, prompt, explanation, correct_option_id, options_json FROM canonical_practice_question_bank WHERE id IN (${questionIds.map(() => '?').join(', ')})`, ...questionIds);
  const byId = new Map(rows.map((row) => [row.id, mapQuestion(row)]));
  return questionIds.map((id) => {
    const question = byId.get(id);
    if (!question) throw new Error(`Question ${id} is unavailable in the installed curriculum.`);
    return question;
  });
}

async function mapSession(row: ContentSessionRow): Promise<ContentStudySession> {
  const questionIds = stringArraySchema.parse(JSON.parse(row.question_ids_json) as unknown);
  const database = await getDatabase();
  const [questions, attempts] = await Promise.all([getQuestionSet(questionIds), database.getAllAsync<AttemptRow>('SELECT * FROM learning_attempts WHERE lesson_id = ? ORDER BY created_at', row.id)]);
  return { id: row.id, type: contentTypeSchema.parse(row.content_type), status: row.status, itemId: row.item_id, questionIds, currentIndex: row.current_index, createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at ?? undefined, questions, attempts: attempts.map(mapAttemptRow) };
}

export async function getContentSession(id: string): Promise<ContentStudySession | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<ContentSessionRow>('SELECT id, content_type, status, item_id, question_ids_json, current_index, created_at, updated_at, completed_at FROM content_study_sessions WHERE id = ?', id);
  return row ? mapSession(row) : undefined;
}

export async function startContentSession(itemId: string, type: ContentLessonType): Promise<ContentStudySession> {
  const database = await getDatabase();
  const profile = await getLearnerProfile();
  const existing = await database.getFirstAsync<ContentSessionRow>(`SELECT id, content_type, status, item_id, question_ids_json, current_index, created_at, updated_at, completed_at FROM content_study_sessions WHERE user_id = ? AND content_type = ? AND item_id = ? AND status = 'in-progress' ORDER BY updated_at DESC LIMIT 1`, profile.id, type, itemId);
  if (existing) return mapSession(existing);
  const questions = await getContentQuestions(itemId);
  if (!questions.length) throw new Error('No release-ready questions are available for this lesson.');
  if (questions.some((question) => question.domain !== type)) throw new Error('The lesson question bank has an invalid content type.');
  const id = createLocalId('content-session'); const now = new Date().toISOString();
  await database.runAsync(`INSERT INTO content_study_sessions (id, user_id, content_type, status, item_id, question_ids_json, current_index, created_at, updated_at) VALUES (?, ?, ?, 'in-progress', ?, ?, 0, ?, ?)`, id, profile.id, type, itemId, JSON.stringify(questions.map((question) => question.id)), now, now);
  const session = await getContentSession(id);
  if (!session) throw new Error('The learning session could not be opened.');
  return session;
}

export async function answerContentSessionQuestion(sessionId: string, selectedOptionId: string, responseTimeMs: number): Promise<ContentStudySession> {
  const session = await getContentSession(sessionId);
  if (!session || session.status !== 'in-progress') throw new Error('This practice session is no longer available.');
  const question = session.questions[session.currentIndex];
  if (!question || !question.options.some((option) => option.id === selectedOptionId)) throw new Error('Select one of the available answers.');
  if (!session.attempts.some((attempt) => attempt.questionId === question.id)) {
    const profile = await getLearnerProfile();
    await recordLearningAttempt({ id: createLocalId('content-attempt'), userId: profile.id, itemId: question.itemId, questionId: question.id, lessonId: session.id, mode: session.type === 'reading' ? 'reading' : session.type === 'listening' ? 'listening' : 'quiz', correct: selectedOptionId === question.correctOptionId, responseTimeMs: Math.max(0, Math.round(responseTimeMs)), selectedAnswer: selectedOptionId, expectedAnswer: question.correctOptionId, createdAt: new Date().toISOString() });
  }
  const updated = await getContentSession(sessionId);
  if (!updated) throw new Error('The saved answer could not be reloaded.');
  return updated;
}

export async function advanceContentSession(sessionId: string): Promise<ContentStudySession> {
  const session = await getContentSession(sessionId);
  if (!session || session.status !== 'in-progress') throw new Error('This practice session is no longer available.');
  const question = session.questions[session.currentIndex];
  if (!question || !session.attempts.some((attempt) => attempt.questionId === question.id)) throw new Error('Answer the current question before continuing.');
  const database = await getDatabase(); const now = new Date().toISOString(); const complete = session.currentIndex >= session.questions.length - 1;
  await database.runAsync(`UPDATE content_study_sessions SET current_index = ?, status = ?, updated_at = ?, completed_at = ? WHERE id = ?`, complete ? session.currentIndex : session.currentIndex + 1, complete ? 'completed' : 'in-progress', now, complete ? now : null, sessionId);
  const updated = await getContentSession(sessionId);
  if (!updated) throw new Error('The session could not be reloaded.');
  return updated;
}

export async function getContentStudyResult(sessionId: string): Promise<ContentStudyResult | undefined> {
  const session = await getContentSession(sessionId);
  if (!session) return undefined;
  const correctCount = session.attempts.filter((attempt) => attempt.correct).length;
  return { session, correctCount, totalQuestions: session.questions.length, percentage: session.questions.length ? Math.round((correctCount / session.questions.length) * 100) : 0 };
}

export async function toggleContentBookmark(itemId: string): Promise<boolean> {
  const database = await getDatabase(); const profile = await getLearnerProfile();
  const existing = await database.getFirstAsync<{ item_id: string }>('SELECT item_id FROM curriculum_bookmarks WHERE user_id = ? AND item_id = ?', profile.id, itemId);
  if (existing) { await database.runAsync('DELETE FROM curriculum_bookmarks WHERE user_id = ? AND item_id = ?', profile.id, itemId); return false; }
  await database.runAsync('INSERT INTO curriculum_bookmarks (user_id, item_id, created_at) VALUES (?, ?, ?)', profile.id, itemId, new Date().toISOString());
  return true;
}

export async function getContentList(type: ContentLessonType, level?: 'N5' | 'N4'): Promise<CurriculumWithMastery[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<CurriculumMasteryRow>(`${masterySelect} AND c.type = ? ${level ? 'AND c.level = ?' : ''} ORDER BY c.level, c.id LIMIT 60`, ...(level ? [type, level] : [type]));
  return rows.map(mapMastered);
}

export async function searchAllCurriculum(query: string, limit = 32): Promise<CurriculumSearchResult[]> {
  const normalized = query.trim(); if (!normalized) return [];
  const database = await getDatabase(); const pattern = `%${normalized.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`; const bounded = Math.max(1, Math.min(limit, 50));
  const [items, sentences] = await Promise.all([
    database.getAllAsync<{ id: string; type: ContentLessonType | 'vocabulary'; level: 'N5' | 'N4'; title: string; meaning: string | null; reading: string | null }>(`SELECT id, type, level, title, meaning, reading FROM curriculum_items WHERE curriculum_source = 'bundled' AND release_ready = 1 AND (title LIKE ? ESCAPE '\\' COLLATE NOCASE OR reading LIKE ? ESCAPE '\\' COLLATE NOCASE OR meaning LIKE ? ESCAPE '\\' COLLATE NOCASE) ORDER BY CASE WHEN title = ? OR reading = ? THEN 0 ELSE 1 END, type, level, id LIMIT ?`, pattern, pattern, pattern, normalized, normalized, bounded),
    database.getAllAsync<{ id: string; japanese: string; english: string }>(`SELECT id, japanese, english FROM mobile_sentences WHERE japanese LIKE ? ESCAPE '\\' COLLATE NOCASE OR english LIKE ? ESCAPE '\\' COLLATE NOCASE ORDER BY id LIMIT ?`, pattern, pattern, Math.max(1, Math.floor(bounded / 3))),
  ]);
  return [...items.map((item) => ({ id: item.id, type: item.type, level: item.level, title: item.title, subtitle: item.meaning ?? item.reading ?? undefined })), ...sentences.map((sentence) => ({ id: sentence.id, type: 'sentence' as const, title: sentence.japanese, subtitle: sentence.english }))];
}

export async function getSentenceById(id: string): Promise<ContentSentence | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ id: string; japanese: string; reading: string; english: string }>('SELECT id, japanese, reading, english FROM mobile_sentences WHERE id = ?', id);
  return row ? { id: row.id, japanese: row.japanese, reading: row.reading, meaning: row.english } : undefined;
}
