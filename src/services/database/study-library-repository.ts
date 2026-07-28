import type { CurriculumWithMastery } from '@/types/learning';
import { calculateContentMastery } from '@/features/progress/content-mastery';
import type {
  StudyLibraryContentType,
  StudyLibraryFilter,
  StudyLibraryHomeData,
  StudyLibraryItem,
  StudyLibraryResumeTarget,
  StudyLibrarySearchOptions,
  StudyLibrarySummary,
} from '@/types/study-library';

import { getDatabase } from './database';
import { getLatestKanjiFlashcardSession } from './kanji-flashcard-repository';
import { getRecentlyViewedStudyContent } from './study-history-repository';
import { mapCurriculumRow, mapMasteryRow, type CurriculumRow, type MasteryRow } from './row-mappers';

interface LibraryItemRow extends CurriculumRow, MasteryRow {
  bookmarked: number;
  quiz_score: number | null;
}

interface SummaryRow {
  type: StudyLibraryContentType;
  total_count: number;
  studied_count: number;
  mastered_count: number;
  bookmarked_count: number;
}

interface ResumeRow {
  kind: StudyLibraryResumeTarget['kind'];
  session_id: string;
  content_type: 'grammar' | 'kanji' | 'reading' | 'listening' | null;
  item_id: string;
  updated_at: string;
}

const libraryTypes: readonly StudyLibraryContentType[] = ['grammar', 'vocabulary', 'kanji'];

const libraryItemSelect = `
  SELECT
    c.id, c.type, c.level, c.title, c.meaning, c.reading, c.explanation, c.tags_json,
    m.user_id, m.item_id, m.mastery_score, m.confidence_score, m.correct_count,
    m.incorrect_count, m.average_response_time_ms, m.last_reviewed_at,
    m.next_review_at, m.review_interval_days, m.status,
    CASE
      WHEN c.type = 'vocabulary' AND vocabulary_bookmarks.vocabulary_id IS NOT NULL THEN 1
      WHEN c.type != 'vocabulary' AND curriculum_bookmarks.item_id IS NOT NULL THEN 1
      ELSE 0
    END AS bookmarked,
    (
      SELECT ROUND(100.0 * SUM(CASE WHEN attempts.correct = 1 THEN 1 ELSE 0 END) / COUNT(*))
      FROM learning_attempts AS attempts
      WHERE attempts.item_id = c.id AND attempts.mode = 'quiz'
    ) AS quiz_score
  FROM curriculum_items AS c
  INNER JOIN learner_profile AS p ON 1 = 1
  INNER JOIN user_mastery AS m ON m.item_id = c.id AND m.user_id = p.id
  LEFT JOIN vocabulary_bookmarks
    ON vocabulary_bookmarks.user_id = p.id AND vocabulary_bookmarks.vocabulary_id = c.id
  LEFT JOIN curriculum_bookmarks
    ON curriculum_bookmarks.user_id = p.id AND curriculum_bookmarks.item_id = c.id
  WHERE c.curriculum_source IN ('bundled', 'course-support') AND c.release_ready = 1
    AND c.type IN ('grammar', 'vocabulary', 'kanji')
`;

function mapLibraryItem(row: LibraryItemRow): StudyLibraryItem {
  const item: CurriculumWithMastery = {
    ...mapCurriculumRow(row),
    mastery: mapMasteryRow(row),
  };
  return {
    ...item,
    bookmarked: row.bookmarked === 1,
    quizScore: row.quiz_score ?? undefined,
    contentMastery: calculateContentMastery({ mastery: item.mastery, latestQuizScore: row.quiz_score ?? undefined }),
  };
}

function summaryFor(type: StudyLibraryContentType): StudyLibrarySummary {
  return {
    type,
    totalCount: 0,
    studiedCount: 0,
    masteredCount: 0,
    bookmarkedCount: 0,
  };
}

export async function getStudyLibrarySummaries(): Promise<StudyLibrarySummary[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<SummaryRow>(`
    SELECT
      c.type,
      COUNT(*) AS total_count,
      SUM(CASE WHEN m.correct_count + m.incorrect_count > 0 THEN 1 ELSE 0 END) AS studied_count,
      SUM(CASE WHEN m.status = 'mastered' THEN 1 ELSE 0 END) AS mastered_count,
      SUM(CASE
        WHEN c.type = 'vocabulary' AND vocabulary_bookmarks.vocabulary_id IS NOT NULL THEN 1
        WHEN c.type != 'vocabulary' AND curriculum_bookmarks.item_id IS NOT NULL THEN 1
        ELSE 0
      END) AS bookmarked_count
    FROM curriculum_items AS c
    INNER JOIN learner_profile AS p ON 1 = 1
    INNER JOIN user_mastery AS m ON m.item_id = c.id AND m.user_id = p.id
    LEFT JOIN vocabulary_bookmarks
      ON vocabulary_bookmarks.user_id = p.id AND vocabulary_bookmarks.vocabulary_id = c.id
    LEFT JOIN curriculum_bookmarks
      ON curriculum_bookmarks.user_id = p.id AND curriculum_bookmarks.item_id = c.id
    WHERE c.curriculum_source IN ('bundled', 'course-support') AND c.release_ready = 1
      AND c.type IN ('grammar', 'vocabulary', 'kanji')
    GROUP BY c.type
  `);

  const summaries = new Map(libraryTypes.map((type) => [type, summaryFor(type)]));
  for (const row of rows) {
    summaries.set(row.type, {
      type: row.type,
      totalCount: row.total_count,
      studiedCount: row.studied_count,
      masteredCount: row.mastered_count,
      bookmarkedCount: row.bookmarked_count,
    });
  }
  return libraryTypes.map((type) => summaries.get(type) ?? summaryFor(type));
}

export async function getBookmarkedStudyLibraryItems(limit = 4): Promise<StudyLibraryItem[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<LibraryItemRow>(
    `${libraryItemSelect}
     AND ((c.type = 'vocabulary' AND vocabulary_bookmarks.vocabulary_id IS NOT NULL)
       OR (c.type != 'vocabulary' AND curriculum_bookmarks.item_id IS NOT NULL))
     ORDER BY CASE c.type WHEN 'grammar' THEN 0 WHEN 'vocabulary' THEN 1 ELSE 2 END, c.level, c.id
     LIMIT ?`,
    Math.max(1, Math.min(limit, 12)),
  );
  return rows.map(mapLibraryItem);
}

export async function getWeakStudyLibraryItems(limit = 4): Promise<StudyLibraryItem[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<LibraryItemRow>(
    `${libraryItemSelect}
     AND m.status = 'weak'
     ORDER BY m.mastery_score ASC, m.incorrect_count DESC, c.level, c.id
     LIMIT ?`,
    Math.max(1, Math.min(limit, 12)),
  );
  return rows.map(mapLibraryItem);
}

export async function getResumableStudyLibrarySession(): Promise<StudyLibraryResumeTarget | undefined> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<ResumeRow>(`
    SELECT kind, session_id, content_type, item_id, updated_at
    FROM (
      SELECT 'content-practice' AS kind, id AS session_id, content_type, item_id, updated_at
      FROM content_study_sessions
      WHERE user_id = (SELECT id FROM learner_profile LIMIT 1) AND status = 'in-progress'
      UNION ALL
      SELECT 'vocabulary-practice' AS kind, id AS session_id, NULL AS content_type,
        json_extract(item_ids_json, '$[0]') AS item_id, updated_at
      FROM study_sessions
      WHERE user_id = (SELECT id FROM learner_profile LIMIT 1)
        AND session_type = 'vocabulary-practice' AND status = 'in-progress'
    )
    ORDER BY updated_at DESC
    LIMIT 1
  `);
  if (!row) return undefined;
  if (row.kind === 'vocabulary-practice') {
    return { kind: row.kind, sessionId: row.session_id, itemId: row.item_id, updatedAt: row.updated_at };
  }
  if (!row.content_type) return undefined;
  return {
    kind: row.kind,
    sessionId: row.session_id,
    contentType: row.content_type,
    itemId: row.item_id,
    updatedAt: row.updated_at,
  };
}

export async function getStudyLibraryHomeData(): Promise<StudyLibraryHomeData> {
  const [summaries, resumableSession, bookmarkedItems, weakItems, recentlyViewed, latestFlashcardSession] = await Promise.all([
    getStudyLibrarySummaries(),
    getResumableStudyLibrarySession(),
    getBookmarkedStudyLibraryItems(),
    getWeakStudyLibraryItems(),
    getRecentlyViewedStudyContent(),
    getLatestKanjiFlashcardSession(),
  ]);
  return { summaries, resumableSession, bookmarkedItems, weakItems, recentlyViewed, latestFlashcardSession };
}

export async function searchStudyLibrary(
  query: string,
  options: StudyLibrarySearchOptions = {},
): Promise<StudyLibraryItem[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  const database = await getDatabase();
  const pattern = `%${normalized.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
  const types = options.types?.length ? [...new Set(options.types)] : libraryTypes;
  const level = options.level ?? 'all';
  const limit = options.limit ?? 24;
  const typePlaceholders = types.map(() => '?').join(', ');
  const levelClause = level === 'all' ? '' : 'AND c.level = ?';
  const values: (string | number)[] = [
    ...types,
    pattern,
    pattern,
    pattern,
  ];
  if (level !== 'all') values.push(level);
  values.push(normalized, normalized);
  values.push(Math.max(1, Math.min(limit, 50)));
  const rows = await database.getAllAsync<LibraryItemRow>(
    `${libraryItemSelect}
     AND c.type IN (${typePlaceholders})
     AND (c.title LIKE ? ESCAPE '\\' COLLATE NOCASE
       OR c.reading LIKE ? ESCAPE '\\' COLLATE NOCASE
       OR c.meaning LIKE ? ESCAPE '\\' COLLATE NOCASE)
     ${levelClause}
     ORDER BY CASE WHEN c.title = ? OR c.reading = ? THEN 0 ELSE 1 END, c.type, c.level, c.id
     LIMIT ?`,
    ...values,
  );
  return rows.map(mapLibraryItem);
}

function filterClause(filter: StudyLibraryFilter): { sql: string; values: string[] } {
  switch (filter) {
    case 'N5':
    case 'N4':
      return { sql: 'AND c.level = ?', values: [filter] };
    case 'studied':
      return { sql: "AND (m.correct_count + m.incorrect_count > 0 OR m.status != 'new')", values: [] };
    case 'not-studied':
      return { sql: "AND m.correct_count + m.incorrect_count = 0 AND m.status = 'new'", values: [] };
    case 'weak':
      return { sql: "AND m.status = 'weak'", values: [] };
    case 'mastered':
      return { sql: "AND m.status = 'mastered'", values: [] };
    case 'bookmarked':
      return {
        sql: `AND ((c.type = 'vocabulary' AND vocabulary_bookmarks.vocabulary_id IS NOT NULL)
          OR (c.type != 'vocabulary' AND curriculum_bookmarks.item_id IS NOT NULL))`,
        values: [],
      };
    case 'recently':
      return {
        sql: `AND EXISTS (
          SELECT 1 FROM study_content_views AS views
          WHERE views.user_id = m.user_id AND views.item_id = c.id
        )`,
        values: [],
      };
    case 'all':
      return { sql: '', values: [] };
  }
}

export async function getStudyLibraryItems(
  type: StudyLibraryContentType,
  filter: StudyLibraryFilter = 'all',
  limit = 120,
): Promise<StudyLibraryItem[]> {
  const database = await getDatabase();
  const clause = filterClause(filter);
  const rows = await database.getAllAsync<LibraryItemRow>(
    `${libraryItemSelect}
     AND c.type = ?
     ${clause.sql}
     ORDER BY CASE c.level WHEN 'N5' THEN 0 ELSE 1 END, c.id
     LIMIT ?`,
    type,
    ...clause.values,
    Math.max(1, Math.min(limit, 500)),
  );
  return rows.map(mapLibraryItem);
}
