import { z } from 'zod';

import { generateExamQuestionIds } from '@/features/exam/exam-generator';
import type { ExamAnalytics, ExamCandidate, ExamHistoryItem, PracticeAggregate, PracticeAnswer, PracticeDomain, PracticeKind, PracticeQuestion, PracticeResult, PracticeSelection, PracticeSession, PracticeSessionStatus } from '@/types/exam';
import { createLocalId } from '@/utils/id';

import { getDatabase } from './database';
import { getLearnerProfile } from './profile-repository';
import { recordLearningAttempt } from './progress-repository';

const domainsSchema = z.array(z.enum(['vocabulary', 'grammar', 'kanji', 'reading', 'listening'])).min(1);
const idsSchema = z.array(z.string().min(1)).min(1);
const selectionSchema = z.object({
  kind: z.enum(['practice', 'mock-exam', 'section-exam']), level: z.enum(['N5', 'N4']), domains: domainsSchema,
  questionCount: z.number().int().min(1).max(80), timerMode: z.enum(['none', 'elapsed', 'countdown']),
  timeLimitSeconds: z.number().int().positive().optional(), source: z.enum(['all', 'weak', 'bookmarked', 'incorrect', 'due', 'new', 'mastered']), seed: z.string().min(1),
  targetItemIds: z.array(z.string().min(1)).min(1).optional(), vocabularyTag: z.string().min(1).optional(),
}).strict();

interface SessionRow { id: string; kind: PracticeKind; level: 'N5' | 'N4'; domains_json: string; source_filter: PracticeSelection['source']; seed: string; selection_json: string; timer_mode: PracticeSelection['timerMode']; time_limit_seconds: number | null; status: PracticeSessionStatus; question_ids_json: string; current_index: number; elapsed_seconds: number; created_at: string; updated_at: string; completed_at: string | null; }
interface AnswerRow { question_id: string; selected_option_id: string | null; correct: number; response_time_ms: number; answered_at: string; }
interface QuestionRow { id: string; item_id: string; domain: PracticeDomain; level: 'N5' | 'N4'; presentation: string; prompt: string; explanation: string | null; correct_option_id: string; options_json: string; tags_json: string; mastery_status: string; bookmarked: number; is_due: number; incorrect_count: number; last_seen_at: string | null; difficulty_rank: number; }

function mapQuestion(row: QuestionRow): ExamCandidate {
  const options = z.array(z.object({ id: z.string(), label: z.string(), feedback: z.string().nullable().optional() })).min(2).parse(JSON.parse(row.options_json) as unknown);
  return { id: row.id, itemId: row.item_id, domain: row.domain, level: row.level, presentation: row.presentation, prompt: row.prompt, explanation: row.explanation ?? undefined, correctOptionId: row.correct_option_id, options: options.map((option) => ({ ...option, feedback: option.feedback ?? undefined })), tags: z.array(z.string()).parse(JSON.parse(row.tags_json) as unknown), masteryStatus: row.mastery_status as ExamCandidate['masteryStatus'], bookmarked: Boolean(row.bookmarked), isDue: Boolean(row.is_due), incorrectCount: row.incorrect_count, lastSeenAt: row.last_seen_at ?? undefined, difficultyRank: row.difficulty_rank };
}

function selectionFilter(candidate: ExamCandidate, source: PracticeSelection['source']): boolean {
  if (source === 'all') return true;
  if (source === 'bookmarked') return candidate.bookmarked;
  if (source === 'incorrect') return candidate.incorrectCount > 0;
  if (source === 'due') return candidate.isDue;
  return candidate.masteryStatus === source;
}

async function getCandidates(selection: PracticeSelection): Promise<ExamCandidate[]> {
  const database = await getDatabase();
  const contentDomains = selection.domains.filter((domain) => domain !== 'vocabulary');
  const marks = contentDomains.map(() => '?').join(', ');
  const candidateFields = `c.tags_json, COALESCE(m.status, 'new') AS mastery_status,
    CASE WHEN cards.state IN ('learning', 'relearning', 'review', 'mastered') AND cards.due_at <= ? THEN 1 ELSE 0 END AS is_due,
    COALESCE(exposure.incorrect_count, 0) AS incorrect_count, exposure.last_seen_at`;
  const now = new Date().toISOString();
  const [vocabularyRows, contentRows] = await Promise.all([
    selection.domains.includes('vocabulary') ? database.getAllAsync<QuestionRow>(
      `SELECT q.id, q.vocabulary_id AS item_id, 'vocabulary' AS domain, q.level, q.presentation, q.prompt, q.explanation, q.correct_option_id, q.options_json,
        ${candidateFields}, CASE WHEN bookmarks.vocabulary_id IS NULL THEN 0 ELSE 1 END AS bookmarked, 3 AS difficulty_rank
       FROM vocabulary_question_bank q
       INNER JOIN curriculum_items c ON c.id = q.vocabulary_id AND c.curriculum_source = 'bundled' AND c.release_ready = 1
       LEFT JOIN learner_profile p ON 1 = 1 LEFT JOIN user_mastery m ON m.user_id = p.id AND m.item_id = c.id
       LEFT JOIN fsrs_cards cards ON cards.user_id = p.id AND cards.item_id = c.id
       LEFT JOIN vocabulary_bookmarks bookmarks ON bookmarks.user_id = p.id AND bookmarks.vocabulary_id = c.id
       LEFT JOIN (SELECT question_id, SUM(CASE WHEN correct = 0 THEN 1 ELSE 0 END) AS incorrect_count, MAX(created_at) AS last_seen_at FROM learning_attempts GROUP BY question_id) exposure ON exposure.question_id = q.id
       WHERE q.level = ? ORDER BY q.id LIMIT 900`, now, selection.level) : Promise.resolve([]),
    contentDomains.length ? database.getAllAsync<QuestionRow>(
      `SELECT q.id, q.item_id, q.domain, q.level, q.presentation, q.prompt, q.explanation, q.correct_option_id, q.options_json,
        ${candidateFields}, CASE WHEN bookmarks.item_id IS NULL THEN 0 ELSE 1 END AS bookmarked,
        COALESCE(json_extract(details.detail_json, '$.difficultyRank'), 3) AS difficulty_rank
       FROM canonical_practice_question_bank q
       INNER JOIN curriculum_items c ON c.id = q.item_id AND c.curriculum_source = 'bundled' AND c.release_ready = 1
       LEFT JOIN curriculum_content_details details ON details.item_id = c.id
       LEFT JOIN learner_profile p ON 1 = 1 LEFT JOIN user_mastery m ON m.user_id = p.id AND m.item_id = c.id
       LEFT JOIN fsrs_cards cards ON cards.user_id = p.id AND cards.item_id = c.id
       LEFT JOIN curriculum_bookmarks bookmarks ON bookmarks.user_id = p.id AND bookmarks.item_id = c.id
       LEFT JOIN (SELECT question_id, SUM(CASE WHEN correct = 0 THEN 1 ELSE 0 END) AS incorrect_count, MAX(created_at) AS last_seen_at FROM learning_attempts GROUP BY question_id) exposure ON exposure.question_id = q.id
       WHERE q.level = ? AND q.domain IN (${marks}) ORDER BY q.domain, q.id LIMIT 900`, now, selection.level, ...contentDomains) : Promise.resolve([]),
  ]);
  return [...vocabularyRows, ...contentRows].map(mapQuestion).filter((candidate) => selectionFilter(candidate, selection.source)
    && (!selection.targetItemIds?.length || selection.targetItemIds.includes(candidate.itemId))
    && (!selection.vocabularyTag || candidate.domain !== 'vocabulary' || candidate.tags.includes(selection.vocabularyTag)));
}

async function questionsByIds(questionIds: string[]): Promise<PracticeQuestion[]> {
  if (!questionIds.length) return [];
  const database = await getDatabase(); const marks = questionIds.map(() => '?').join(', ');
  const [vocabularyRows, contentRows] = await Promise.all([
    database.getAllAsync<QuestionRow>(`SELECT q.id, q.vocabulary_id AS item_id, 'vocabulary' AS domain, q.level, q.presentation, q.prompt, q.explanation, q.correct_option_id, q.options_json, c.tags_json, 'new' AS mastery_status, 0 AS bookmarked, 0 AS is_due, 0 AS incorrect_count, NULL AS last_seen_at, 3 AS difficulty_rank FROM vocabulary_question_bank q INNER JOIN curriculum_items c ON c.id = q.vocabulary_id WHERE q.id IN (${marks})`, ...questionIds),
    database.getAllAsync<QuestionRow>(`SELECT q.id, q.item_id, q.domain, q.level, q.presentation, q.prompt, q.explanation, q.correct_option_id, q.options_json, c.tags_json, 'new' AS mastery_status, 0 AS bookmarked, 0 AS is_due, 0 AS incorrect_count, NULL AS last_seen_at, COALESCE(json_extract(details.detail_json, '$.difficultyRank'), 3) AS difficulty_rank FROM canonical_practice_question_bank q INNER JOIN curriculum_items c ON c.id = q.item_id LEFT JOIN curriculum_content_details details ON details.item_id = c.id WHERE q.id IN (${marks})`, ...questionIds),
  ]);
  const byId = new Map([...vocabularyRows, ...contentRows].map((row) => [row.id, mapQuestion(row)]));
  return questionIds.map((id) => { const question = byId.get(id); if (!question) throw new Error(`Practice question ${id} is unavailable in this release.`); return question; });
}

function mapSelection(row: SessionRow): PracticeSelection { return selectionSchema.parse(JSON.parse(row.selection_json) as unknown); }
async function mapSession(row: SessionRow): Promise<PracticeSession> {
  const database = await getDatabase(); const questionIds = idsSchema.parse(JSON.parse(row.question_ids_json) as unknown);
  const [questions, answerRows] = await Promise.all([questionsByIds(questionIds), database.getAllAsync<AnswerRow>('SELECT question_id, selected_option_id, correct, response_time_ms, answered_at FROM practice_session_answers WHERE session_id = ? ORDER BY answered_at', row.id)]);
  const answers: PracticeAnswer[] = answerRows.map((answer) => ({ questionId: answer.question_id, selectedOptionId: answer.selected_option_id ?? undefined, correct: Boolean(answer.correct), responseTimeMs: answer.response_time_ms, answeredAt: answer.answered_at }));
  return { id: row.id, selection: mapSelection(row), status: row.status, questionIds, currentIndex: row.current_index, elapsedSeconds: row.elapsed_seconds, createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at ?? undefined, questions, answers };
}

export function defaultMockSelection(level: 'N5' | 'N4', domains: PracticeDomain[] = ['vocabulary', 'grammar', 'kanji', 'reading', 'listening']): PracticeSelection {
  const full = domains.length === 5;
  return { kind: full ? 'mock-exam' : 'section-exam', level, domains, questionCount: full ? 40 : 12, timerMode: 'countdown', timeLimitSeconds: full ? 50 * 60 : 15 * 60, source: 'all', seed: `${level}-${domains.join('-')}-mock-v1` };
}

export async function startPracticeSession(input: PracticeSelection): Promise<PracticeSession> {
  const selection = selectionSchema.parse(input); const database = await getDatabase(); const profile = await getLearnerProfile();
  const existing = await database.getFirstAsync<SessionRow>(`SELECT * FROM practice_sessions WHERE user_id = ? AND status IN ('in-progress', 'paused') AND kind = ? ORDER BY updated_at DESC LIMIT 1`, profile.id, selection.kind);
  if (existing) return mapSession(existing);
  const candidateIds = generateExamQuestionIds(await getCandidates(selection), selection);
  if (candidateIds.length < selection.questionCount) throw new Error('Not enough matching release-ready questions are available for this practice session.');
  const id = createLocalId('practice-session'); const now = new Date().toISOString();
  await database.runAsync(`INSERT INTO practice_sessions (id, user_id, kind, level, domains_json, source_filter, seed, selection_json, timer_mode, time_limit_seconds, status, question_ids_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in-progress', ?, ?, ?)`, id, profile.id, selection.kind, selection.level, JSON.stringify(selection.domains), selection.source, selection.seed, JSON.stringify(selection), selection.timerMode, selection.timeLimitSeconds ?? null, JSON.stringify(candidateIds), now, now);
  const session = await getPracticeSession(id); if (!session) throw new Error('Practice session could not be opened.'); return session;
}

export async function startMistakePractice(): Promise<PracticeSession> {
  const questions = await getMistakeQuestions(80);
  if (!questions.length) throw new Error('There are no saved mistakes to review.');
  const level = questions[0].level;
  const selected = questions.filter((question) => question.level === level).slice(0, 20);
  const selection = selectionSchema.parse({ kind: 'practice', level, domains: [...new Set(selected.map((question) => question.domain))], questionCount: selected.length, timerMode: 'none', source: 'incorrect', seed: `mistake-notebook-${selected.map((question) => question.id).join('-')}`, targetItemIds: [...new Set(selected.map((question) => question.itemId))] });
  const database = await getDatabase(); const profile = await getLearnerProfile();
  const existing = await database.getFirstAsync<SessionRow>(`SELECT * FROM practice_sessions WHERE user_id = ? AND status IN ('in-progress', 'paused') AND kind = 'practice' ORDER BY updated_at DESC LIMIT 1`, profile.id);
  if (existing) return mapSession(existing);
  const id = createLocalId('mistake-session'); const now = new Date().toISOString(); const questionIds = selected.map((question) => question.id);
  await database.runAsync(`INSERT INTO practice_sessions (id, user_id, kind, level, domains_json, source_filter, seed, selection_json, timer_mode, time_limit_seconds, status, question_ids_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in-progress', ?, ?, ?)`, id, profile.id, selection.kind, selection.level, JSON.stringify(selection.domains), selection.source, selection.seed, JSON.stringify(selection), selection.timerMode, null, JSON.stringify(questionIds), now, now);
  return (await getPracticeSession(id))!;
}

export async function getPracticeSession(id: string): Promise<PracticeSession | undefined> { const database = await getDatabase(); const row = await database.getFirstAsync<SessionRow>('SELECT * FROM practice_sessions WHERE id = ?', id); return row ? mapSession(row) : undefined; }

export async function updatePracticeTimer(id: string, elapsedSeconds: number, paused = false): Promise<PracticeSession> {
  const database = await getDatabase(); const now = new Date().toISOString();
  await database.runAsync(`UPDATE practice_sessions SET elapsed_seconds = ?, status = CASE WHEN status IN ('completed', 'time-expired') THEN status ELSE ? END, updated_at = ? WHERE id = ?`, Math.max(0, Math.round(elapsedSeconds)), paused ? 'paused' : 'in-progress', now, id);
  const session = await getPracticeSession(id); if (!session) throw new Error('Practice session is unavailable.'); return session;
}

export async function answerPracticeQuestion(sessionId: string, selectedOptionId: string, responseTimeMs: number, elapsedSeconds: number): Promise<PracticeSession> {
  const session = await getPracticeSession(sessionId); if (!session || session.status !== 'in-progress') throw new Error('This practice session is no longer active.');
  const question = session.questions[session.currentIndex]; if (!question || !question.options.some((option) => option.id === selectedOptionId)) throw new Error('Select an available answer.');
  const now = new Date().toISOString(); const database = await getDatabase();
  const inserted = await database.runAsync(`INSERT OR IGNORE INTO practice_session_answers (session_id, question_id, selected_option_id, correct, response_time_ms, answered_at) VALUES (?, ?, ?, ?, ?, ?)`, sessionId, question.id, selectedOptionId, selectedOptionId === question.correctOptionId ? 1 : 0, Math.max(0, Math.round(responseTimeMs)), now);
  await updatePracticeTimer(sessionId, elapsedSeconds);
  if (inserted.changes) {
    const profile = await getLearnerProfile(); const correct = selectedOptionId === question.correctOptionId;
    await recordLearningAttempt({ id: createLocalId('practice-attempt'), userId: profile.id, itemId: question.itemId, questionId: question.id, lessonId: sessionId, mode: question.domain === 'reading' ? 'reading' : question.domain === 'listening' ? 'listening' : 'quiz', correct, responseTimeMs: Math.max(0, Math.round(responseTimeMs)), selectedAnswer: selectedOptionId, expectedAnswer: question.correctOptionId, createdAt: now });
    if (!correct) await database.runAsync(`INSERT INTO mistake_notebook (user_id, question_id, item_id, domain, added_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, question_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`, profile.id, question.id, question.itemId, question.domain, now, now);
  }
  return (await getPracticeSession(sessionId))!;
}

export async function advancePracticeSession(sessionId: string, elapsedSeconds: number, timeExpired = false): Promise<PracticeSession> {
  const session = await getPracticeSession(sessionId); if (!session || session.status !== 'in-progress') throw new Error('This practice session is no longer active.');
  const question = session.questions[session.currentIndex]; if (!timeExpired && (!question || !session.answers.some((answer) => answer.questionId === question.id))) throw new Error('Answer the current question before continuing.');
  const complete = timeExpired || session.currentIndex >= session.questions.length - 1; const now = new Date().toISOString(); const database = await getDatabase();
  await database.runAsync(`UPDATE practice_sessions SET current_index = ?, elapsed_seconds = ?, status = ?, updated_at = ?, completed_at = ? WHERE id = ?`, complete ? session.currentIndex : session.currentIndex + 1, Math.max(0, Math.round(elapsedSeconds)), timeExpired ? 'time-expired' : complete ? 'completed' : 'in-progress', now, complete ? now : null, sessionId);
  return (await getPracticeSession(sessionId))!;
}

export async function getPracticeResult(sessionId: string): Promise<PracticeResult | undefined> {
  const session = await getPracticeSession(sessionId); if (!session) return undefined; const answers = new Map(session.answers.map((answer) => [answer.questionId, answer]));
  const aggregates = session.selection.domains.map((domain): PracticeAggregate => { const questions = session.questions.filter((question) => question.domain === domain); const correct = questions.filter((question) => answers.get(question.id)?.correct).length; return { key: domain, correct, incorrect: questions.filter((question) => answers.has(question.id) && !answers.get(question.id)?.correct).length, total: questions.length, percentage: questions.length ? Math.round((correct / questions.length) * 100) : 0 }; });
  const correctCount = session.answers.filter((answer) => answer.correct).length; const incorrectCount = session.answers.filter((answer) => !answer.correct).length; const missed = session.questions.filter((question) => answers.has(question.id) && !answers.get(question.id)?.correct);
  return { session, correctCount, incorrectCount, unansweredCount: session.questions.length - session.answers.length, percentage: session.questions.length ? Math.round((correctCount / session.questions.length) * 100) : 0, timeTakenSeconds: session.elapsedSeconds, sectionScores: aggregates, recommendedItemIds: [...new Set(missed.map((question) => question.itemId))], weakGrammarIds: [...new Set(missed.filter((question) => question.domain === 'grammar').map((question) => question.itemId))], weakVocabularyIds: [...new Set(missed.filter((question) => question.domain === 'vocabulary').map((question) => question.itemId))], weakKanjiIds: [...new Set(missed.filter((question) => question.domain === 'kanji').map((question) => question.itemId))] };
}

export async function getExamHistory(limit = 40): Promise<ExamHistoryItem[]> { const database = await getDatabase(); const profile = await getLearnerProfile(); const rows = await database.getAllAsync<SessionRow>(`SELECT * FROM practice_sessions WHERE user_id = ? AND kind IN ('mock-exam', 'section-exam') ORDER BY created_at DESC LIMIT ?`, profile.id, Math.max(1, Math.min(limit, 100))); return Promise.all(rows.map(async (row) => { const result = await getPracticeResult(row.id); return { id: row.id, kind: row.kind, level: row.level, status: row.status, percentage: result?.percentage, elapsedSeconds: row.elapsed_seconds, createdAt: row.created_at, completedAt: row.completed_at ?? undefined, questionCount: idsSchema.parse(JSON.parse(row.question_ids_json) as unknown).length }; })); }

export async function getMistakeQuestions(limit = 80): Promise<PracticeQuestion[]> { const database = await getDatabase(); const profile = await getLearnerProfile(); const rows = await database.getAllAsync<{ question_id: string }>('SELECT question_id FROM mistake_notebook WHERE user_id = ? ORDER BY last_seen_at DESC LIMIT ?', profile.id, Math.max(1, Math.min(limit, 100))); return questionsByIds(rows.map((row) => row.question_id)); }
export async function removeMistake(questionId: string): Promise<void> { const database = await getDatabase(); const profile = await getLearnerProfile(); await database.runAsync('DELETE FROM mistake_notebook WHERE user_id = ? AND question_id = ?', profile.id, questionId); }
export async function clearMistakes(): Promise<void> { const database = await getDatabase(); const profile = await getLearnerProfile(); await database.runAsync('DELETE FROM mistake_notebook WHERE user_id = ?', profile.id); }
export async function bookmarkMistakeItem(question: Pick<PracticeQuestion, 'itemId' | 'domain'>): Promise<void> { const database = await getDatabase(); const profile = await getLearnerProfile(); if (question.domain === 'vocabulary') { await database.runAsync(`INSERT OR IGNORE INTO vocabulary_bookmarks (user_id, vocabulary_id, created_at) VALUES (?, ?, ?)`, profile.id, question.itemId, new Date().toISOString()); return; } await database.runAsync(`INSERT OR IGNORE INTO curriculum_bookmarks (user_id, item_id, created_at) VALUES (?, ?, ?)`, profile.id, question.itemId, new Date().toISOString()); }

export async function getExamAnalytics(): Promise<ExamAnalytics> { const history = await getExamHistory(100); const complete = history.filter((item) => item.status === 'completed' || item.status === 'time-expired'); const scores = complete.flatMap((item) => item.percentage === undefined ? [] : [item.percentage]); const database = await getDatabase(); const profile = await getLearnerProfile(); const accuracyRows = await database.getAllAsync<{ domain: PracticeDomain; correct: number; total: number }>(`SELECT domain, SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) AS correct, COUNT(*) AS total FROM (SELECT 'vocabulary' AS domain, answers.correct FROM practice_session_answers answers INNER JOIN practice_sessions sessions ON sessions.id = answers.session_id INNER JOIN vocabulary_question_bank questions ON questions.id = answers.question_id WHERE sessions.user_id = ? UNION ALL SELECT questions.domain AS domain, answers.correct FROM practice_session_answers answers INNER JOIN practice_sessions sessions ON sessions.id = answers.session_id INNER JOIN canonical_practice_question_bank questions ON questions.id = answers.question_id WHERE sessions.user_id = ?) GROUP BY domain`, profile.id, profile.id); const accuracyByDomain = accuracyRows.map((row) => ({ key: row.domain, correct: row.correct, incorrect: row.total - row.correct, total: row.total, percentage: row.total ? Math.round((row.correct / row.total) * 100) : 0 })); const sorted = [...accuracyByDomain].sort((a, b) => a.percentage - b.percentage); const averageMockScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : undefined; return { completedMocks: complete.length, averageMockScore, highestMockScore: scores.length ? Math.max(...scores) : undefined, improvement: scores.length >= 2 ? scores.at(-1)! - scores[0] : undefined, strongestSection: sorted.at(-1)?.key, weakestSection: sorted[0]?.key, readiness: averageMockScore ?? 0, accuracyByDomain }; }
