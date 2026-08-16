import { practiceAnalysisSchema } from '@/features/google-practice/schemas';
import { updatePracticeSkillProfile } from '@/features/google-practice/learner-profile';
import type {
  PracticeDashboard,
  PracticeLogSession,
  PracticeMistakeCategory,
  PracticeMistakeInsight,
  PracticeSessionAnalysis,
  PracticeSkillProfile,
  PracticeSkillType,
  PracticeSyncState,
  PracticeVocabularyInsight,
} from '@/types/google-practice';
import { createLocalId } from '@/utils/id';

import { getDatabase } from './database';
import { getLearnerProfile } from './profile-repository';

interface SyncStateRow {
  google_connected: number;
  document_id: string | null;
  document_title: string | null;
  last_processed_index: number;
  last_processed_session_id: string | null;
  last_synced_at: string | null;
  last_new_conversation_count: number;
  personalization_enabled: number;
  connected_at: string | null;
}

interface PracticeSkillRow {
  skill_type: PracticeSkillType;
  skill_key: string;
  curriculum_item_id: string | null;
  mastery: number;
  mistakes: number;
  successful_uses: number;
  encounters: number;
  last_practiced_at: string;
}

interface MistakeRow {
  id: string;
  session_id: string;
  practiced_at: string;
  original: string;
  corrected: string;
  category: PracticeMistakeCategory;
  explanation: string;
  confidence: number;
  frequency: number;
}

interface VocabularyRow {
  word: string;
  reading: string;
  meaning: string;
  first_seen_at: string;
  last_seen_at: string;
  frequency: number;
}

export interface PracticeCurriculumCandidate {
  id: string;
  type: PracticeSkillType;
  title: string;
  reading?: string;
  meaning?: string;
}

const defaultState: PracticeSyncState = {
  googleConnected: false,
  lastProcessedIndex: 0,
  lastNewConversationCount: 0,
  personalizationEnabled: true,
};

function mapState(row: SyncStateRow | null): PracticeSyncState {
  if (!row) return defaultState;
  return {
    googleConnected: row.google_connected === 1,
    documentId: row.document_id ?? undefined,
    documentTitle: row.document_title ?? undefined,
    lastProcessedIndex: row.last_processed_index,
    lastProcessedSessionId: row.last_processed_session_id ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    lastNewConversationCount: row.last_new_conversation_count,
    personalizationEnabled: row.personalization_enabled === 1,
    connectedAt: row.connected_at ?? undefined,
  };
}

function mapSkill(row: PracticeSkillRow): PracticeSkillProfile {
  return {
    type: row.skill_type,
    key: row.skill_key,
    curriculumItemId: row.curriculum_item_id ?? undefined,
    mastery: row.mastery,
    mistakes: row.mistakes,
    successfulUses: row.successful_uses,
    encounters: row.encounters,
    lastPracticedAt: row.last_practiced_at,
  };
}

export async function getPracticeSyncState(): Promise<PracticeSyncState> {
  const database = await getDatabase();
  return mapState(await database.getFirstAsync<SyncStateRow>('SELECT * FROM practice_sync_state WHERE id = 1'));
}

async function ensureState(): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR IGNORE INTO practice_sync_state
      (id, google_connected, last_processed_index, last_new_conversation_count, personalization_enabled)
     VALUES (1, 0, 0, 0, 1)`,
  );
}

export async function setPracticeGoogleConnected(connected: boolean): Promise<void> {
  await ensureState();
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `UPDATE practice_sync_state SET google_connected = ?, connected_at = CASE WHEN ? = 1 THEN COALESCE(connected_at, ?) ELSE connected_at END
     WHERE id = 1`,
    connected ? 1 : 0,
    connected ? 1 : 0,
    now,
  );
}

export async function setPracticeDocument(documentId: string, documentTitle?: string): Promise<void> {
  await ensureState();
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE practice_sync_state SET google_connected = 1, document_id = ?, document_title = ?,
       last_processed_index = 0, last_processed_session_id = NULL,
       last_synced_at = NULL, last_new_conversation_count = 0,
       connected_at = COALESCE(connected_at, ?)
     WHERE id = 1`,
    documentId,
    documentTitle ?? null,
    new Date().toISOString(),
  );
}

export async function disconnectPracticeGoogle(): Promise<void> {
  await ensureState();
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE practice_sync_state SET google_connected = 0, document_id = NULL, document_title = NULL,
       last_processed_index = 0, last_processed_session_id = NULL,
       last_synced_at = NULL, last_new_conversation_count = 0
     WHERE id = 1`,
  );
}

export async function setPracticePersonalizationEnabled(enabled: boolean): Promise<void> {
  await ensureState();
  const database = await getDatabase();
  await database.runAsync('UPDATE practice_sync_state SET personalization_enabled = ? WHERE id = 1', enabled ? 1 : 0);
}

export async function getProcessedPracticeSessionIds(documentId: string, sessionIds: readonly string[]): Promise<Set<string>> {
  if (!sessionIds.length) return new Set();
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ id: string }>(
    `SELECT source_session_id AS id FROM practice_imported_sessions
     WHERE document_id = ? AND source_session_id IN (${sessionIds.map(() => '?').join(', ')})`,
    documentId,
    ...sessionIds,
  );
  return new Set(rows.map(({ id }) => id));
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/[\s\-‐‑–—_.,、。()（）]/gu, '');
}

export async function getPracticeCurriculumCandidates(
  sessions: readonly PracticeLogSession[],
): Promise<PracticeCurriculumCandidate[]> {
  const database = await getDatabase();
  const sourceText = sessions.map((session) => [
    session.transcript,
    session.metadata?.mistakes.map(({ point, type }) => `${point ?? ''} ${type ?? ''}`).join(' ') ?? '',
    session.metadata?.newVocabulary.join(' ') ?? '',
  ].join('\n')).join('\n');
  const metadataTerms = [...new Set(sessions.flatMap((session) =>
    session.metadata?.mistakes.flatMap(({ point }) => point ? [normalize(point)] : []) ?? [],
  ))].filter((term) => term.length >= 3).slice(0, 12);
  const metadataClauses = metadataTerms.map(() => "replace(replace(replace(lower(COALESCE(meaning, '') || COALESCE(explanation, '')), ' ', ''), '-', ''), '_', '') LIKE ?");
  const rows = await database.getAllAsync<{
    id: string;
    type: PracticeSkillType;
    title: string;
    reading: string | null;
    meaning: string | null;
    explanation: string | null;
  }>(
    `SELECT id, type, title, reading, meaning, explanation FROM curriculum_items
     WHERE type IN ('grammar', 'vocabulary', 'kanji')
       AND curriculum_source IN ('bundled', 'course-support') AND release_ready = 1
       AND (
         instr(?, title) > 0
         OR (reading IS NOT NULL AND length(reading) >= 2 AND instr(?, reading) > 0)
         ${metadataClauses.length ? `OR ${metadataClauses.join(' OR ')}` : ''}
         OR id IN (SELECT curriculum_item_id FROM practice_skill_profile WHERE curriculum_item_id IS NOT NULL)
       )
     ORDER BY length(title) DESC, CASE level WHEN 'N5' THEN 0 ELSE 1 END, type, id
     LIMIT 300`,
    sourceText,
    sourceText,
    ...metadataTerms.map((term) => `%${term}%`),
  );
  const normalizedSource = normalize(sourceText);
  const scored = rows.flatMap((row) => {
    const title = normalize(row.title);
    const reading = normalize(row.reading ?? '');
    const meaning = normalize(`${row.meaning ?? ''} ${row.explanation ?? ''}`);
    let score = title && normalizedSource.includes(title) ? 30 : 0;
    if (reading && reading !== title && normalizedSource.includes(reading)) score += 18;
    if (metadataTerms.some((term) => meaning.includes(term))) score += 12;
    if (row.type === 'kanji' && row.title.length === 1 && sourceText.includes(row.title)) score += 8;
    return score ? [{ row, score }] : [];
  });
  const limits: Record<PracticeSkillType, number> = { grammar: 50, vocabulary: 50, kanji: 30 };
  const counts: Record<PracticeSkillType, number> = { grammar: 0, vocabulary: 0, kanji: 0 };
  return scored
    .sort((left, right) => right.score - left.score || left.row.id.localeCompare(right.row.id))
    .flatMap(({ row }) => {
      if (counts[row.type] >= limits[row.type]) return [];
      counts[row.type] += 1;
      return [{ id: row.id, type: row.type, title: row.title, reading: row.reading ?? undefined, meaning: row.meaning ?? undefined }];
    });
}

export async function getPracticeEvidenceSummary(): Promise<PracticeSkillProfile[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<PracticeSkillRow>(
    `SELECT skill_type, skill_key, curriculum_item_id, mastery, mistakes, successful_uses, encounters, last_practiced_at
     FROM practice_skill_profile WHERE user_id = (SELECT id FROM learner_profile LIMIT 1)
     ORDER BY mistakes DESC, mastery ASC LIMIT 30`,
  );
  return rows.map(mapSkill);
}

async function saveSkillEvidence(input: {
  userId: string;
  type: PracticeSkillType;
  key: string;
  curriculumItemId?: string;
  evidence: 'weak' | 'strong';
  practicedAt: string;
}): Promise<void> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<PracticeSkillRow>(
    `SELECT skill_type, skill_key, curriculum_item_id, mastery, mistakes, successful_uses, encounters, last_practiced_at
     FROM practice_skill_profile WHERE user_id = ? AND skill_type = ? AND skill_key = ?`,
    input.userId,
    input.type,
    input.key,
  );
  const current: PracticeSkillProfile = row ? mapSkill(row) : {
    type: input.type,
    key: input.key,
    curriculumItemId: input.curriculumItemId,
    mastery: 0.5,
    mistakes: 0,
    successfulUses: 0,
    encounters: 0,
    lastPracticedAt: input.practicedAt,
  };
  const next = updatePracticeSkillProfile(current, {
    mistakes: input.evidence === 'weak' ? 1 : 0,
    successfulUses: input.evidence === 'strong' ? 1 : 0,
    practicedAt: input.practicedAt,
  });
  await database.runAsync(
    `INSERT INTO practice_skill_profile
      (user_id, skill_type, skill_key, curriculum_item_id, mastery, mistakes, successful_uses, encounters, last_practiced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, skill_type, skill_key) DO UPDATE SET
       curriculum_item_id = COALESCE(excluded.curriculum_item_id, practice_skill_profile.curriculum_item_id),
       mastery = excluded.mastery, mistakes = excluded.mistakes,
       successful_uses = excluded.successful_uses, encounters = excluded.encounters,
       last_practiced_at = excluded.last_practiced_at`,
    input.userId,
    next.type,
    next.key,
    input.curriculumItemId ?? next.curriculumItemId ?? null,
    next.mastery,
    next.mistakes,
    next.successfulUses,
    next.encounters,
    next.lastPracticedAt,
  );
}

function unlinkedWeaknesses(result: PracticeSessionAnalysis): { type: PracticeSkillType; key: string }[] {
  const linked = new Set(result.curriculumLinks.filter(({ evidence }) => evidence === 'weak').map(({ type, key }) => `${type}:${normalize(key)}`));
  return [
    ...result.analysis.weakGrammar.map((key) => ({ type: 'grammar' as const, key })),
    ...result.analysis.weakVocabulary.map((key) => ({ type: 'vocabulary' as const, key })),
    ...result.analysis.weakKanji.map((key) => ({ type: 'kanji' as const, key })),
  ].filter(({ type, key }) => !linked.has(`${type}:${normalize(key)}`));
}

export async function savePracticeImport(input: {
  documentId: string;
  documentTitle: string;
  sessions: readonly PracticeLogSession[];
  analyses: readonly PracticeSessionAnalysis[];
  syncedAt: string;
}): Promise<number> {
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  const analysisBySession = new Map(input.analyses.map((analysis) => [analysis.sessionId, analysis]));
  let imported = 0;
  let lastProcessedIndex = 0;
  let lastProcessedSessionId: string | undefined;
  await database.withTransactionAsync(async () => {
    for (const session of input.sessions) {
      const analysis = analysisBySession.get(session.id);
      if (!analysis) throw new Error(`Practice analysis is missing for ${session.id}.`);
      const existing = await database.getFirstAsync<{ id: string }>(
        'SELECT id FROM practice_imported_sessions WHERE document_id = ? AND source_session_id = ?',
        input.documentId,
        session.id,
      );
      if (existing) continue;
      const validated = practiceAnalysisSchema.parse(analysis.analysis);
      const storageSessionId = `${input.documentId}:${session.id}`;
      await database.runAsync(
        `INSERT INTO practice_imported_sessions
          (id, source_session_id, user_id, document_id, practiced_at, document_start_index, document_end_index,
           transcript, metadata_json, analysis_json, imported_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        storageSessionId,
        session.id,
        profile.id,
        input.documentId,
        session.practicedAt,
        session.startIndex,
        session.endIndex,
        session.transcript,
        session.metadata ? JSON.stringify(session.metadata) : null,
        JSON.stringify(validated),
        input.syncedAt,
      );
      for (const mistake of validated.mistakes) {
        await database.runAsync(
          `INSERT INTO practice_analysis_mistakes
            (id, session_id, original, corrected, category, explanation, confidence, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          createLocalId('practice-mistake'),
          storageSessionId,
          mistake.original,
          mistake.corrected,
          mistake.category,
          mistake.explanation,
          mistake.confidence,
          session.practicedAt,
        );
      }
      for (const vocabulary of validated.learnedVocabulary) {
        await database.runAsync(
          `INSERT INTO practice_learned_vocabulary
            (user_id, word, reading, meaning, first_seen_at, last_seen_at, frequency)
           VALUES (?, ?, ?, ?, ?, ?, 1)
           ON CONFLICT(user_id, word, reading) DO UPDATE SET
             meaning = excluded.meaning, last_seen_at = excluded.last_seen_at, frequency = frequency + 1`,
          profile.id,
          vocabulary.word,
          vocabulary.reading,
          vocabulary.meaning,
          session.practicedAt,
          session.practicedAt,
        );
      }
      const topics = [...new Set([...(session.metadata?.topics ?? []), ...validated.topics])];
      for (const topic of topics) {
        await database.runAsync(
          `INSERT INTO practice_topics (user_id, topic, first_seen_at, last_seen_at, frequency)
           VALUES (?, ?, ?, ?, 1)
           ON CONFLICT(user_id, topic) DO UPDATE SET last_seen_at = excluded.last_seen_at, frequency = frequency + 1`,
          profile.id,
          topic,
          session.practicedAt,
          session.practicedAt,
        );
      }
      const evidence = [
        ...analysis.curriculumLinks,
        ...unlinkedWeaknesses(analysis).map((weakness) => ({ ...weakness, evidence: 'weak' as const, curriculumItemId: undefined })),
      ];
      const seenEvidence = new Set<string>();
      for (const item of evidence) {
        const key = `${item.type}:${normalize(item.key)}:${item.evidence}`;
        if (seenEvidence.has(key)) continue;
        seenEvidence.add(key);
        await saveSkillEvidence({
          userId: profile.id,
          type: item.type,
          key: item.key,
          curriculumItemId: item.curriculumItemId,
          evidence: item.evidence,
          practicedAt: session.practicedAt,
        });
      }
      imported += 1;
      if (session.endIndex >= lastProcessedIndex) {
        lastProcessedIndex = session.endIndex;
        lastProcessedSessionId = session.id;
      }
    }
    await ensureState();
    await database.runAsync(
      `UPDATE practice_sync_state SET google_connected = 1, document_title = ?,
         last_processed_index = CASE WHEN ? > last_processed_index THEN ? ELSE last_processed_index END,
         last_processed_session_id = COALESCE(?, last_processed_session_id),
         last_synced_at = ?, last_new_conversation_count = ?
       WHERE id = 1`,
      input.documentTitle,
      lastProcessedIndex,
      lastProcessedIndex,
      lastProcessedSessionId ?? null,
      input.syncedAt,
      imported,
    );
  });
  return imported;
}

export async function markPracticeSyncChecked(
  documentTitle: string,
  syncedAt: string,
  processed?: Pick<PracticeLogSession, 'id' | 'endIndex'>,
): Promise<void> {
  await ensureState();
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE practice_sync_state SET document_title = ?, last_synced_at = ?, last_new_conversation_count = 0,
       last_processed_index = CASE WHEN ? > last_processed_index THEN ? ELSE last_processed_index END,
       last_processed_session_id = CASE WHEN ? > last_processed_index THEN ? ELSE last_processed_session_id END
     WHERE id = 1`,
    documentTitle,
    syncedAt,
    processed?.endIndex ?? 0,
    processed?.endIndex ?? 0,
    processed?.endIndex ?? 0,
    processed?.id ?? null,
  );
}

export async function deleteImportedPracticeHistory(): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM practice_imported_sessions');
    await database.runAsync('DELETE FROM practice_skill_profile');
    await database.runAsync('DELETE FROM practice_learned_vocabulary');
    await database.runAsync('DELETE FROM practice_topics');
    await database.runAsync("DELETE FROM notification_log WHERE notification_type = 'practice_review'");
  });
}

export async function getPracticeDashboard(): Promise<PracticeDashboard> {
  const [database, state] = await Promise.all([getDatabase(), getPracticeSyncState()]);
  const [countRow, mistakeRows, skillRows, vocabularyRows, topicRows, analysisRows] = await Promise.all([
    database.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM practice_imported_sessions'),
    database.getAllAsync<MistakeRow>(
      `SELECT mistakes.id, mistakes.session_id, sessions.practiced_at, mistakes.original, mistakes.corrected,
              mistakes.category, mistakes.explanation, mistakes.confidence,
              (SELECT COUNT(*) FROM practice_analysis_mistakes AS repeated
               WHERE repeated.original = mistakes.original AND repeated.corrected = mistakes.corrected) AS frequency
       FROM practice_analysis_mistakes AS mistakes
       INNER JOIN practice_imported_sessions AS sessions ON sessions.id = mistakes.session_id
       ORDER BY sessions.practiced_at DESC, mistakes.created_at DESC LIMIT 12`,
    ),
    database.getAllAsync<PracticeSkillRow>(
      `SELECT skill_type, skill_key, curriculum_item_id, mastery, mistakes, successful_uses, encounters, last_practiced_at
       FROM practice_skill_profile WHERE mistakes >= 2
       ORDER BY mistakes DESC, mastery ASC, last_practiced_at DESC LIMIT 12`,
    ),
    database.getAllAsync<VocabularyRow>(
      `SELECT word, reading, meaning, first_seen_at, last_seen_at, frequency
       FROM practice_learned_vocabulary ORDER BY last_seen_at DESC, frequency DESC LIMIT 12`,
    ),
    database.getAllAsync<{ topic: string }>('SELECT topic FROM practice_topics ORDER BY last_seen_at DESC, frequency DESC LIMIT 10'),
    database.getAllAsync<{ analysis_json: string }>('SELECT analysis_json FROM practice_imported_sessions ORDER BY practiced_at DESC LIMIT 6'),
  ]);
  const suggestedReview = [...new Set(analysisRows.flatMap(({ analysis_json }) => {
    try {
      const result = practiceAnalysisSchema.safeParse(JSON.parse(analysis_json) as unknown);
      return result.success ? result.data.suggestedReview : [];
    } catch {
      return [];
    }
  }))].slice(0, 8);
  const improving = await database.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM practice_skill_profile WHERE successful_uses >= 2 AND mastery >= 0.55',
  );
  const recentMistakes: PracticeMistakeInsight[] = mistakeRows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    practicedAt: row.practiced_at,
    original: row.original,
    corrected: row.corrected,
    category: row.category,
    explanation: row.explanation,
    confidence: row.confidence,
    frequency: row.frequency,
  }));
  const learnedVocabulary: PracticeVocabularyInsight[] = vocabularyRows.map((row) => ({
    word: row.word,
    reading: row.reading,
    meaning: row.meaning,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    frequency: row.frequency,
  }));
  return {
    state,
    sessionCount: countRow?.count ?? 0,
    recentMistakes,
    recurringWeaknesses: skillRows.map(mapSkill),
    learnedVocabulary,
    suggestedReview,
    recentTopics: topicRows.map(({ topic }) => topic),
    improvingSkillCount: improving?.count ?? 0,
  };
}

export async function getPracticeNotificationInsight(): Promise<{ key: string; mistakes: number; lastPracticedAt: string } | undefined> {
  const database = await getDatabase();
  const state = await getPracticeSyncState();
  if (!state.personalizationEnabled) return undefined;
  const row = await database.getFirstAsync<{ skill_key: string; mistakes: number; last_practiced_at: string }>(
    `SELECT skill_key, mistakes, last_practiced_at FROM practice_skill_profile
     WHERE mistakes >= 2 ORDER BY mistakes DESC, last_practiced_at DESC LIMIT 1`,
  );
  return row ? { key: row.skill_key, mistakes: row.mistakes, lastPracticedAt: row.last_practiced_at } : undefined;
}
