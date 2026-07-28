import * as SQLite from 'expo-sqlite';
import { z } from 'zod';

import { buildCourseManifest, buildCourseOutline, validateCourseManifest } from '@/features/course/course-definition';
import { getPlacementRecommendation, isUnitReviewAvailable, nextLessonState, scoreCourseCheckpoint } from '@/features/course/course-engine';
import { evaluateCourseAnswer } from '@/features/course/course-feedback';
import type { CourseActivitySubmission, CourseActivitySubmissionResult, CourseCheckpointResult, CourseDefinition, CourseHomeData, CourseItemUsage, CourseLessonActivityProgress, CourseLessonActivitySummary, CourseLessonAnalytics, CourseLessonDefinition, CourseLessonProgress, CourseLessonSummary, CoursePlacementRecommendation, CourseQuestion, GuidedCourseLesson, LessonActivityExercise } from '@/types/course';
import type { CurriculumItemType } from '@/types/learning';
import { createLocalId } from '@/utils/id';

import { getDatabase } from './database';
import { getFsrsCard, getFsrsDailyQueue } from './fsrs-repository';
import { getLearnerProfile } from './profile-repository';
import { recordLearningAttempt } from './progress-repository';
import { insertSqlRows } from './sql-batch';

const browseSettingKey = 'course_allow_lesson_browsing';
const browseSettingSchema = z.boolean();
const idsSchema = z.array(z.string().min(1));

interface ManifestStateRow { manifest_version: number; manifest_hash: string; }
interface ProgressRow {
  lesson_id: string; current_section_id: string | null; completed_sections_json: string; best_checkpoint_score: number | null;
  latest_checkpoint_score: number | null; started_at: string | null; completed_at: string | null; time_spent_seconds: number; placed_by_assessment: number;
}
interface ReferenceRow { reference_type: CourseQuestion['type']; reference_id: string; }
interface QuestionRow { id: string; item_id: string; domain: CurriculumItemType; prompt: string; explanation: string | null; correct_option_id: string; options_json: string; }
interface AssessmentQuestionRow { id: string; curriculum_item_id: string; category: CurriculumItemType; prompt: string; explanation: string; correct_option_id: string; options_json: string; }
interface ActivityProgressRow { activity_id: string; current_interaction_index: number; completed_at: string | null; time_spent_seconds: number; }
interface ActivityAttemptRow { item_id: string | null; category: LessonActivityExercise['category']; correct: number; }
interface ActivityAttemptHistoryRow { activity_id: string; exercise_id: string; interaction_index: number; attempt_number: number; category: LessonActivityExercise['category']; correct: number; }

let courseManifestInstallationPromise: Promise<void> | undefined;

export interface CourseContentCard { id: string; type: CurriculumItemType; title: string; reading?: string; meaning?: string; }
export interface CourseExperienceDebugReport {
  lessonId: string;
  attempts: number;
  retries: number;
  repeatedFailureLoops: number;
  hintedInteractions: number;
  revealedAnswers: number;
  completedSections: number;
  activityTypeDistribution: Record<string, number>;
}

function allLessons(course: CourseDefinition): (CourseLessonDefinition & { courseId: string; unitId: string; unitOrder: number })[] {
  return course.units.flatMap((unit) => unit.lessons.map((lesson) => ({ ...lesson, courseId: course.id, unitId: unit.id, unitOrder: unit.order })));
}

function mapProgress(row: ProgressRow | undefined, lessonId: string): CourseLessonProgress {
  if (!row) return { lessonId, state: 'locked', completedSectionIds: [], timeSpentSeconds: 0, placedByAssessment: false };
  return {
    lessonId,
    state: 'locked',
    currentSectionId: row.current_section_id ?? undefined,
    completedSectionIds: idsSchema.parse(JSON.parse(row.completed_sections_json) as unknown),
    bestCheckpointScore: row.best_checkpoint_score ?? undefined,
    latestCheckpointScore: row.latest_checkpoint_score ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    timeSpentSeconds: row.time_spent_seconds,
    placedByAssessment: Boolean(row.placed_by_assessment),
  };
}

function roleFor(type: ReferenceRow['reference_type']): 'introduced' | 'practice' | 'checkpoint' | 'context' {
  if (type === 'vocabulary' || type === 'grammar' || type === 'kanji') return 'introduced';
  if (type === 'reading' || type === 'listening') return 'context';
  return 'checkpoint';
}

async function upsertManifest(database: SQLite.SQLiteDatabase): Promise<void> {
  const manifest = buildCourseManifest();
  const validation = validateCourseManifest(manifest);
  if (validation.length) throw new Error(`Course manifest is invalid: ${validation.map((issue) => `${issue.path}: ${issue.message}`).join(' ')}`);
  const state = await database.getFirstAsync<ManifestStateRow>('SELECT manifest_version, manifest_hash FROM course_manifest_state WHERE manifest_key = ?', 'structured-course');
  const manifestVersion = Math.max(...manifest.courses.map((course) => course.manifestVersion));
  if (state?.manifest_version === manifestVersion && state.manifest_hash === manifest.hash) return;
  const authoredLessons = manifest.courses.flatMap((course) => course.units.flatMap((unit) => unit.lessons.map((lesson) => ({ course, unit, lesson }))));
  const referenceRows = authoredLessons.flatMap(({ lesson }) => [
    ...lesson.vocabularyIds.map((referenceId) => [lesson.id, 'vocabulary', referenceId, roleFor('vocabulary')] as const),
    ...lesson.grammarIds.map((referenceId) => [lesson.id, 'grammar', referenceId, roleFor('grammar')] as const),
    ...lesson.kanjiIds.map((referenceId) => [lesson.id, 'kanji', referenceId, roleFor('kanji')] as const),
    ...lesson.readingIds.map((referenceId) => [lesson.id, 'reading', referenceId, roleFor('reading')] as const),
    ...lesson.listeningIds.map((referenceId) => [lesson.id, 'listening', referenceId, roleFor('listening')] as const),
    ...lesson.vocabularyQuestionIds.map((referenceId) => [lesson.id, 'vocabulary-question', referenceId, roleFor('vocabulary-question')] as const),
    ...lesson.practiceQuestionIds.map((referenceId) => [lesson.id, 'practice-question', referenceId, roleFor('practice-question')] as const),
    ...lesson.assessmentQuestionIds.map((referenceId) => [lesson.id, 'assessment-question', referenceId, roleFor('assessment-question')] as const),
  ]);
  await database.withTransactionAsync(async () => {
    await insertSqlRows(
      database,
      'INSERT INTO courses (id, level, title, description, manifest_version, manifest_hash) VALUES',
      manifest.courses.map((course) => [course.id, course.level, course.title, course.description, course.manifestVersion, manifest.hash]),
      'ON CONFLICT(id) DO UPDATE SET level = excluded.level, title = excluded.title, description = excluded.description, manifest_version = excluded.manifest_version, manifest_hash = excluded.manifest_hash',
    );
    await insertSqlRows(
      database,
      'INSERT INTO course_units (id, course_id, unit_order, title, goal) VALUES',
      manifest.courses.flatMap((course) => course.units.map((unit) => [unit.id, course.id, unit.order, unit.title, unit.goal])),
      'ON CONFLICT(id) DO UPDATE SET course_id = excluded.course_id, unit_order = excluded.unit_order, title = excluded.title, goal = excluded.goal',
    );
    await insertSqlRows(
      database,
      `INSERT INTO course_lessons (id, course_id, unit_id, lesson_order, lesson_number, title, theme, communication_goal, objectives_json, estimated_minutes, prerequisites_json, lesson_kind, depth_exception, depth_exception_reason, verb_forms_json, adjective_forms_json)
       VALUES`,
      authoredLessons.map(({ course, unit, lesson }) => [
        lesson.id, course.id, unit.id, lesson.order, lesson.number, lesson.title, lesson.theme, lesson.communicationGoal,
        JSON.stringify(lesson.objectives), lesson.estimatedMinutes, JSON.stringify(lesson.prerequisiteLessonIds), lesson.kind ?? 'lesson', lesson.depthException ?? null, lesson.depthExceptionReason ?? null, JSON.stringify(lesson.verbForms), JSON.stringify(lesson.adjectiveForms),
      ]),
      'ON CONFLICT(id) DO UPDATE SET course_id = excluded.course_id, unit_id = excluded.unit_id, lesson_order = excluded.lesson_order, lesson_number = excluded.lesson_number, title = excluded.title, theme = excluded.theme, communication_goal = excluded.communication_goal, objectives_json = excluded.objectives_json, estimated_minutes = excluded.estimated_minutes, prerequisites_json = excluded.prerequisites_json, lesson_kind = excluded.lesson_kind, depth_exception = excluded.depth_exception, depth_exception_reason = excluded.depth_exception_reason, verb_forms_json = excluded.verb_forms_json, adjective_forms_json = excluded.adjective_forms_json',
    );
    await database.runAsync(
      `DELETE FROM course_lesson_content_refs WHERE lesson_id IN (${authoredLessons.map(() => '?').join(', ')})`,
      ...authoredLessons.map(({ lesson }) => lesson.id),
    );
    await insertSqlRows(
      database,
      'INSERT INTO course_lesson_content_refs (lesson_id, reference_type, reference_id, reference_role) VALUES',
      referenceRows,
    );
    await insertSqlRows(
      database,
      'INSERT INTO course_lesson_sections (id, lesson_id, section_order, kind, title, instruction, estimated_minutes) VALUES',
      authoredLessons.flatMap(({ lesson }) => lesson.sections.map((section) => [section.id, lesson.id, section.order, section.kind, section.title, section.instruction, section.estimatedMinutes])),
      'ON CONFLICT(id) DO UPDATE SET lesson_id = excluded.lesson_id, section_order = excluded.section_order, kind = excluded.kind, title = excluded.title, instruction = excluded.instruction, estimated_minutes = excluded.estimated_minutes',
    );
    await insertSqlRows(
      database,
      'INSERT INTO course_lesson_activities (id, lesson_id, activity_order, activity_type, title, instruction, estimated_minutes, required, interaction_count, content_refs_json, config_json) VALUES',
      authoredLessons.flatMap(({ lesson }) => lesson.activities.map((activity) => [
        activity.id, lesson.id, activity.order, activity.type, activity.title, activity.instruction, activity.estimatedMinutes,
        activity.required ? 1 : 0, activity.interactionCount, JSON.stringify(activity.contentRefs), JSON.stringify(activity.exercises),
      ])),
      'ON CONFLICT(id) DO UPDATE SET lesson_id = excluded.lesson_id, activity_order = excluded.activity_order, activity_type = excluded.activity_type, title = excluded.title, instruction = excluded.instruction, estimated_minutes = excluded.estimated_minutes, required = excluded.required, interaction_count = excluded.interaction_count, content_refs_json = excluded.content_refs_json, config_json = excluded.config_json',
    );
    await database.runAsync(
      `INSERT INTO course_manifest_state (manifest_key, manifest_version, manifest_hash, installed_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(manifest_key) DO UPDATE SET manifest_version = excluded.manifest_version, manifest_hash = excluded.manifest_hash, installed_at = excluded.installed_at`,
      'structured-course', manifestVersion, manifest.hash, new Date().toISOString(),
    );
  });
}

/** Installs deterministic authored course structure after canonical curriculum installation. */
export async function installCourseManifestIfNeeded(database: SQLite.SQLiteDatabase): Promise<void> {
  if (!courseManifestInstallationPromise) {
    courseManifestInstallationPromise = upsertManifest(database).catch((error: unknown) => {
      courseManifestInstallationPromise = undefined;
      throw error;
    });
  }
  await courseManifestInstallationPromise;
}

async function getAllowBrowsing(database: SQLite.SQLiteDatabase): Promise<boolean> {
  const row = await database.getFirstAsync<{ value_json: string }>('SELECT value_json FROM app_settings WHERE key = ?', browseSettingKey);
  if (!row) return false;
  return browseSettingSchema.safeParse(JSON.parse(row.value_json) as unknown).data ?? false;
}

export async function getLessonBrowsingEnabled(): Promise<boolean> {
  return getAllowBrowsing(await getDatabase());
}

export async function setAllowLessonBrowsing(enabled: boolean): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    browseSettingKey, JSON.stringify(browseSettingSchema.parse(enabled)), new Date().toISOString(),
  );
}

async function courseProgress(course: CourseDefinition, database: SQLite.SQLiteDatabase): Promise<Map<string, CourseLessonProgress>> {
  const profile = await getLearnerProfile();
  const lessons = allLessons(course);
  const rows = await database.getAllAsync<ProgressRow>(
    `SELECT lesson_id, current_section_id, completed_sections_json, best_checkpoint_score, latest_checkpoint_score, started_at, completed_at, time_spent_seconds, placed_by_assessment
     FROM course_lesson_progress WHERE user_id = ? AND lesson_id IN (${lessons.map(() => '?').join(', ')})`,
    profile.id, ...lessons.map((lesson) => lesson.id),
  );
  const progressById = new Map(rows.map((row) => [row.lesson_id, mapProgress(row, row.lesson_id)]));
  return new Map(lessons.map((lesson) => [lesson.id, progressById.get(lesson.id) ?? mapProgress(undefined, lesson.id)]));
}

function summariesForCourse(course: CourseDefinition, progress: Map<string, CourseLessonProgress>, allowBrowsing: boolean): CourseLessonSummary[] {
  const result: CourseLessonSummary[] = [];
  for (const lesson of allLessons(course)) {
    const prerequisiteStates = lesson.prerequisiteLessonIds.map((id) => result.find((candidate) => candidate.id === id)?.progress.state ?? progress.get(id)?.state ?? 'locked');
    const stored = progress.get(lesson.id) ?? mapProgress(undefined, lesson.id);
    const state = nextLessonState(lesson, stored, prerequisiteStates, allowBrowsing);
    const actual = { ...stored, state };
    progress.set(lesson.id, actual);
    result.push({ ...lesson, progress: actual, prerequisiteState: state === 'locked' ? 'unmet' : (lesson.prerequisiteLessonIds.length && allowBrowsing && prerequisiteStates.some((value) => value === 'locked') ? 'browsable' : 'met') });
  }
  return result;
}

export async function getCourseHome(courseId = 'foundations'): Promise<CourseHomeData> {
  const database = await getDatabase();
  const courses = buildCourseOutline();
  const course = courses.find((candidate) => candidate.id === courseId) ?? courses[0];
  if (!course) throw new Error('The local course map is unavailable.');
  const [progress, allowBrowsing, queue] = await Promise.all([courseProgress(course, database), getAllowBrowsing(database), getFsrsDailyQueue()]);
  const summaries = summariesForCourse(course, progress, allowBrowsing);
  const profile = await getLearnerProfile();
  const reviewRows = await database.getAllAsync<{ unit_id: string }>(
    `SELECT unit_id FROM course_unit_review_attempts WHERE user_id = ? AND unit_id IN (${course.units.map(() => '?').join(', ')}) GROUP BY unit_id`,
    profile.id, ...course.units.map((unit) => unit.id),
  );
  const reviewedUnitIds = new Set(reviewRows.map((row) => row.unit_id));
  const units = course.units.map((unit) => {
    const lessons = summaries.filter((lesson) => lesson.unitId === unit.id);
    const reviewAvailable = isUnitReviewAvailable(lessons.map((lesson) => lesson.progress));
    return { id: unit.id, order: unit.order, title: unit.title, goal: unit.goal, lessons, reviewAvailable, reviewCompleted: reviewedUnitIds.has(unit.id) };
  });
  const currentLesson = summaries.find((lesson) => lesson.progress.state === 'in_progress') ?? summaries.find((lesson) => lesson.progress.state === 'available' || lesson.progress.state === 'needs_review');
  const completed = summaries.filter((lesson) => ['completed', 'strong', 'skipped_by_placement'].includes(lesson.progress.state)).length;
  return {
    course: { id: course.id, level: course.level, title: course.title, description: course.description },
    units,
    currentLesson,
    totalProgress: summaries.length ? Math.round((completed / summaries.length) * 100) : 0,
    reviewDueCount: queue.overdue.length + queue.due.length + queue.learning.length,
    estimatedRemainingMinutes: summaries.filter((lesson) => !['completed', 'strong', 'skipped_by_placement'].includes(lesson.progress.state)).reduce((sum, lesson) => sum + lesson.estimatedMinutes, 0),
  };
}

export async function getCourseLesson(lessonId: string): Promise<CourseLessonSummary | undefined> {
  const manifest = buildCourseManifest();
  const course = manifest.courses.find((candidate) => allLessons(candidate).some((lesson) => lesson.id === lessonId));
  if (!course) return undefined;
  const database = await getDatabase();
  const [progress, allowBrowsing] = await Promise.all([courseProgress(course, database), getAllowBrowsing(database)]);
  return summariesForCourse(course, progress, allowBrowsing).find((lesson) => lesson.id === lessonId);
}

function mapActivityProgress(row: ActivityProgressRow | undefined, activityId: string): CourseLessonActivityProgress {
  return {
    activityId,
    currentInteractionIndex: row?.current_interaction_index ?? 0,
    completedAt: row?.completed_at ?? undefined,
    timeSpentSeconds: row?.time_spent_seconds ?? 0,
  };
}

async function activityProgressFor(
  database: SQLite.SQLiteDatabase,
  userId: string,
  lesson: CourseLessonSummary,
): Promise<Map<string, CourseLessonActivityProgress>> {
  if (!lesson.activities.length) return new Map();
  const rows = await database.getAllAsync<ActivityProgressRow>(
    `SELECT activity_id, current_interaction_index, completed_at, time_spent_seconds
     FROM course_activity_progress
     WHERE user_id = ? AND activity_id IN (${lesson.activities.map(() => '?').join(', ')})`,
    userId,
    ...lesson.activities.map((activity) => activity.id),
  );
  const byId = new Map(rows.map((row) => [row.activity_id, mapActivityProgress(row, row.activity_id)]));
  return new Map(lesson.activities.map((activity) => [activity.id, byId.get(activity.id) ?? mapActivityProgress(undefined, activity.id)]));
}

async function guidedLessonFor(lesson: CourseLessonSummary, database: SQLite.SQLiteDatabase, userId: string): Promise<GuidedCourseLesson> {
  const progress = await activityProgressFor(database, userId, lesson);
  const activities: CourseLessonActivitySummary[] = lesson.activities
    .slice()
    .sort((left, right) => left.order - right.order)
    .map((activity) => ({ ...activity, progress: progress.get(activity.id) ?? mapActivityProgress(undefined, activity.id) }));
  return { lesson, activities, currentActivity: activities.find((activity) => !activity.progress.completedAt) };
}

/** Returns a single resumable activity sequence instead of a set of lesson tabs. */
export async function getGuidedCourseLesson(lessonId: string): Promise<GuidedCourseLesson | undefined> {
  const lesson = await getCourseLesson(lessonId);
  if (!lesson) return undefined;
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  return guidedLessonFor(lesson, database, profile.id);
}

export async function startCourseLesson(lessonId: string): Promise<CourseLessonSummary> {
  const lesson = await getCourseLesson(lessonId);
  if (!lesson) throw new Error('This lesson is unavailable in the installed course.');
  if (lesson.progress.state === 'locked') throw new Error('Complete the prerequisite lesson first, or enable lesson browsing.');
  const database = await getDatabase();
  await installCourseManifestIfNeeded(database);
  const profile = await getLearnerProfile();
  const now = new Date().toISOString();
  const firstSectionId = lesson.sections[0]?.id;
  await database.runAsync(
    `INSERT INTO course_enrollments (user_id, course_id, started_at, selected_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, course_id) DO NOTHING`, profile.id, lesson.courseId, now, now,
  );
  await database.runAsync(
    `INSERT INTO course_lesson_progress (user_id, lesson_id, current_section_id, completed_sections_json, started_at)
     VALUES (?, ?, ?, '[]', ?)
     ON CONFLICT(user_id, lesson_id) DO UPDATE SET current_section_id = COALESCE(course_lesson_progress.current_section_id, excluded.current_section_id), started_at = COALESCE(course_lesson_progress.started_at, excluded.started_at)`,
    profile.id, lesson.id, firstSectionId ?? null, now,
  );
  for (const itemId of [...lesson.vocabularyIds, ...lesson.grammarIds, ...lesson.kanjiIds]) await getFsrsCard(database, profile.id, itemId);
  return (await getCourseLesson(lessonId)) ?? lesson;
}

function learningModeFor(category: LessonActivityExercise['category']): 'reading' | 'listening' | 'quiz' {
  return category === 'reading' ? 'reading' : category === 'listening' ? 'listening' : 'quiz';
}

function mistakeDomainFor(category: LessonActivityExercise['category']): CurriculumItemType {
  return category === 'conjugation' || category === 'production' ? 'grammar' : category;
}

function sectionKindForActivity(activity: CourseLessonDefinition['activities'][number]): CourseLessonDefinition['sections'][number]['kind'] {
  if (activity.type === 'vocabulary_intro' || activity.type === 'vocabulary_practice') return 'vocabulary';
  if (['grammar_explanation', 'substitution_drill', 'conjugation_drill', 'sentence_transformation', 'sentence_ordering', 'error_correction'].includes(activity.type)) return 'grammar';
  if (activity.type === 'kanji_intro' || activity.type === 'kanji_practice') return 'kanji';
  if (activity.type === 'dialogue' || activity.type === 'story') return 'dialogue';
  if (activity.type === 'listening' || activity.type === 'dictation' || activity.type === 'shadowing') return 'listening';
  if (activity.type === 'reading' || activity.type === 'timed_reading') return 'reading';
  if (activity.type === 'checkpoint') return 'checkpoint';
  if (activity.type === 'reflection') return 'summary';
  return activity.type === 'introduction' || activity.type === 'warm_up' ? 'introduction' : 'practice';
}

function sectionForActivity(lesson: CourseLessonSummary, activity: CourseLessonDefinition['activities'][number]) {
  const kind = sectionKindForActivity(activity);
  return lesson.sections.find((section) => section.kind === kind) ?? lesson.sections[0];
}

async function saveHintUsage(
  database: SQLite.SQLiteDatabase,
  userId: string,
  activityId: string,
  exerciseId: string,
  interactionIndex: number,
  hintLevel: number,
  answerRevealed: boolean,
): Promise<void> {
  if (hintLevel <= 0 && !answerRevealed) return;
  await database.runAsync(
    `INSERT INTO course_activity_hint_usage
       (user_id, activity_id, exercise_id, interaction_index, highest_hint_level, answer_revealed, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, activity_id, exercise_id, interaction_index)
     DO UPDATE SET highest_hint_level = MAX(course_activity_hint_usage.highest_hint_level, excluded.highest_hint_level),
                   answer_revealed = MAX(course_activity_hint_usage.answer_revealed, excluded.answer_revealed),
                   updated_at = excluded.updated_at`,
    userId, activityId, exerciseId, interactionIndex, Math.min(3, Math.max(0, Math.round(hintLevel))), answerRevealed ? 1 : 0, new Date().toISOString(),
  );
}

/** Persists a learner-requested hint without marking an answer wrong. */
export async function recordCourseActivityHint(lessonId: string, activityId: string, hintLevel: number): Promise<void> {
  await startCourseLesson(lessonId);
  const [lesson, database, profile] = await Promise.all([getCourseLesson(lessonId), getDatabase(), getLearnerProfile()]);
  const activity = lesson?.activities.find((candidate) => candidate.id === activityId);
  if (!activity) return;
  const current = await database.getFirstAsync<ActivityProgressRow>(
    'SELECT activity_id, current_interaction_index, completed_at, time_spent_seconds FROM course_activity_progress WHERE user_id = ? AND activity_id = ?',
    profile.id, activityId,
  );
  const index = current?.current_interaction_index ?? 0;
  const exercise = activity.exercises[index];
  if (!exercise) return;
  await saveHintUsage(database, profile.id, activityId, exercise.id, index, hintLevel, hintLevel >= 3);
}

async function saveActivityCheckpointResult(
  database: SQLite.SQLiteDatabase,
  userId: string,
  lesson: CourseLessonSummary,
  activityId: string,
  createdAt: string,
): Promise<void> {
  const rows = await database.getAllAsync<ActivityAttemptRow>(
    'SELECT item_id, category, correct FROM course_activity_attempts WHERE user_id = ? AND activity_id = ?',
    userId,
    activityId,
  );
  if (!rows.length) return;
  const byDomain: CourseCheckpointResult['byDomain'] = {};
  const weakItemIds: string[] = [];
  for (const row of rows) {
    const domain = mistakeDomainFor(row.category);
    const current = byDomain[domain] ?? { correct: 0, total: 0, score: 0 };
    current.total += 1;
    current.correct += row.correct;
    current.score = Math.round((current.correct / current.total) * 100);
    byDomain[domain] = current;
    if (!row.correct && row.item_id) weakItemIds.push(row.item_id);
  }
  const correct = rows.filter((row) => Boolean(row.correct)).length;
  const score = Math.round((correct / rows.length) * 100);
  const result: CourseCheckpointResult = {
    score,
    classification: score < 60 ? 'needs_review' : score < 75 ? 'developing' : score < 90 ? 'passed' : 'strong',
    byDomain,
    weakItemIds: [...new Set(weakItemIds)],
  };
  await database.runAsync(
    'INSERT INTO course_checkpoint_attempts (id, user_id, lesson_id, score, result_json, answers_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    createLocalId('course-activity-checkpoint'), userId, lesson.id, result.score, JSON.stringify(result), JSON.stringify({ activityId }), createdAt,
  );
  await database.runAsync(
    'UPDATE course_lesson_progress SET latest_checkpoint_score = ?, best_checkpoint_score = MAX(COALESCE(best_checkpoint_score, 0), ?) WHERE user_id = ? AND lesson_id = ?',
    result.score, result.score, userId, lesson.id,
  );
}

async function completeCourseWhenEligible(database: SQLite.SQLiteDatabase, userId: string, courseId: string, now: string): Promise<void> {
  const unfinished = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM course_lessons AS lessons
     LEFT JOIN course_lesson_progress AS progress ON progress.lesson_id = lessons.id AND progress.user_id = ?
     WHERE lessons.course_id = ? AND progress.completed_at IS NULL AND COALESCE(progress.placed_by_assessment, 0) = 0`,
    userId,
    courseId,
  );
  if ((unfinished?.count ?? 1) === 0) await database.runAsync(
    'UPDATE course_enrollments SET completed_at = ? WHERE user_id = ? AND course_id = ?', now, userId, courseId,
  );
}

/** Saves exactly one response and returns the next resumable activity state. */
export async function submitCourseActivity(
  lessonId: string,
  submission: CourseActivitySubmission,
): Promise<CourseActivitySubmissionResult> {
  await startCourseLesson(lessonId);
  const [lesson, database, profile] = await Promise.all([getCourseLesson(lessonId), getDatabase(), getLearnerProfile()]);
  if (!lesson) throw new Error('This lesson is unavailable in the installed course.');
  const activity = lesson.activities.find((candidate) => candidate.id === submission.activityId);
  if (!activity) throw new Error('That activity is not part of this lesson.');
  const current = await database.getFirstAsync<ActivityProgressRow>(
    'SELECT activity_id, current_interaction_index, completed_at, time_spent_seconds FROM course_activity_progress WHERE user_id = ? AND activity_id = ?',
    profile.id,
    activity.id,
  );
  if (current?.completed_at) return { correct: true, lesson: await guidedLessonFor(lesson, database, profile.id) };
  const interactionIndex = current?.current_interaction_index ?? 0;
  const exercise = activity.exercises[interactionIndex];
  if (!exercise) throw new Error('This activity has already been completed.');
  const response = submission.response?.trim();
  const previousAttempt = await database.getFirstAsync<{ attempt_number: number | null; incorrect_attempts: number }>(
    `SELECT MAX(attempt_number) AS attempt_number,
            COALESCE(SUM(CASE WHEN correct = 0 THEN 1 ELSE 0 END), 0) AS incorrect_attempts
     FROM course_activity_attempt_history
     WHERE user_id = ? AND activity_id = ? AND exercise_id = ? AND interaction_index = ?`,
    profile.id, activity.id, exercise.id, interactionIndex,
  );
  const previousIncorrectAttempts = previousAttempt?.incorrect_attempts ?? 0;
  const evaluation = evaluateCourseAnswer(exercise, response, previousIncorrectAttempts);
  const correct = evaluation.correct;
  const continueAfterTeaching = Boolean(submission.continueAfterTeaching && previousIncorrectAttempts >= 3 && !correct);
  const now = new Date().toISOString();
  const responseTimeMs = Math.max(0, Math.round(submission.responseTimeMs ?? 0));
  const secondsSpent = Math.round(responseTimeMs / 1000);

  if (!continueAfterTeaching) {
    await database.runAsync(
      `INSERT INTO course_activity_attempts (id, user_id, activity_id, exercise_id, interaction_index, item_id, category, response_text, accepted_answers_json, correct, response_time_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, activity_id, exercise_id, interaction_index) DO UPDATE SET response_text = excluded.response_text, correct = excluded.correct, response_time_ms = excluded.response_time_ms, created_at = excluded.created_at`,
      createLocalId('course-activity-attempt'), profile.id, activity.id, exercise.id, interactionIndex, exercise.itemId ?? null, exercise.category, response ?? null,
      JSON.stringify(exercise.acceptedAnswers ?? []), correct ? 1 : 0, responseTimeMs, now,
    );
    await database.runAsync(
      `INSERT INTO course_activity_attempt_history (id, user_id, activity_id, exercise_id, interaction_index, attempt_number, item_id, category, correct, response_time_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      createLocalId('course-activity-history'), profile.id, activity.id, exercise.id, interactionIndex, (previousAttempt?.attempt_number ?? 0) + 1,
      exercise.itemId ?? null, exercise.category, correct ? 1 : 0, responseTimeMs, now,
    );
    if (exercise.itemId) await recordLearningAttempt({
      id: createLocalId('course-learning-attempt'), userId: profile.id, itemId: exercise.itemId, questionId: `${activity.id}-${exercise.id}-${now}`,
      lessonId: `course-activity-${activity.id}`, mode: learningModeFor(exercise.category), correct, responseTimeMs,
      selectedAnswer: response, expectedAnswer: exercise.acceptedAnswers?.join(' | '), createdAt: now,
    });
    if (!correct && exercise.itemId) await database.runAsync(
      `INSERT INTO mistake_notebook (user_id, question_id, item_id, domain, added_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, question_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
      profile.id, `${activity.id}-${exercise.id}`, exercise.itemId, mistakeDomainFor(exercise.category), now, now,
    );
    if (exercise.responseKind === 'production' && response) await database.runAsync(
      'INSERT INTO course_production_answers (id, user_id, activity_id, exercise_id, answer_text, required_pattern, self_confirmed, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
      createLocalId('course-production'), profile.id, activity.id, exercise.id, response, exercise.acceptedAnswers?.[0] ?? null, now,
    );
    if (activity.type === 'timed_reading' && exercise.readingText) await database.runAsync(
      'INSERT INTO course_reading_progress (id, user_id, activity_id, character_count, elapsed_ms, comprehension_score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      createLocalId('course-reading'), profile.id, activity.id, exercise.readingText.length, responseTimeMs, correct ? 100 : 0, now,
    );
  }
  await saveHintUsage(database, profile.id, activity.id, exercise.id, interactionIndex, Math.max(submission.hintLevel ?? 0, evaluation.feedback.hintLevel), continueAfterTeaching || evaluation.feedback.kind === 'teaching');
  if (!correct && !continueAfterTeaching) return { correct: false, explanation: evaluation.feedback.explanation, feedback: evaluation.feedback, lesson: await guidedLessonFor(lesson, database, profile.id) };

  const nextInteractionIndex = interactionIndex + 1;
  const activityComplete = nextInteractionIndex >= activity.exercises.length;
  const finalActivity = activity.order === lesson.activities.length;
  const nextActivity = lesson.activities.find((candidate) => candidate.order === activity.order + 1);
  const currentSection = sectionForActivity(lesson, activity);
  const nextSection = nextActivity ? sectionForActivity(lesson, nextActivity) : currentSection;
  const sectionComplete = Boolean(activityComplete && currentSection && (!nextActivity || nextSection?.id !== currentSection.id));
  const completedSectionIds = sectionComplete && currentSection
    ? [...new Set([...lesson.progress.completedSectionIds, currentSection.id])]
    : lesson.progress.completedSectionIds;
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO course_activity_progress (user_id, activity_id, current_interaction_index, completed_at, time_spent_seconds)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, activity_id) DO UPDATE SET current_interaction_index = excluded.current_interaction_index, completed_at = excluded.completed_at, time_spent_seconds = course_activity_progress.time_spent_seconds + excluded.time_spent_seconds`,
      profile.id, activity.id, nextInteractionIndex, activityComplete ? now : null, secondsSpent,
    );
    await database.runAsync(
      `UPDATE course_lesson_progress
       SET current_section_id = ?, completed_sections_json = ?, time_spent_seconds = time_spent_seconds + ?, completed_at = CASE WHEN ? THEN ? ELSE completed_at END
       WHERE user_id = ? AND lesson_id = ?`,
      nextSection?.id ?? null, JSON.stringify(completedSectionIds), secondsSpent, activityComplete && finalActivity ? 1 : 0, now, profile.id, lesson.id,
    );
    if (activityComplete && activity.type === 'checkpoint') await saveActivityCheckpointResult(database, profile.id, lesson, activity.id, now);
    if (activityComplete && finalActivity) await completeCourseWhenEligible(database, profile.id, lesson.courseId, now);
  });
  return { correct: true, explanation: evaluation.feedback.explanation, feedback: evaluation.feedback, lesson: await guidedLessonFor(lesson, database, profile.id) };
}

function accuracy(rows: readonly ActivityAttemptHistoryRow[]): number | undefined {
  return rows.length ? Math.round((rows.filter((row) => Boolean(row.correct)).length / rows.length) * 100) : undefined;
}

function summarizeCourseActivityAttempts(
  rows: readonly ActivityAttemptHistoryRow[],
  activityTypes: ReadonlyMap<string, CourseLessonDefinition['activities'][number]['type']>,
): CourseLessonAnalytics {
  if (!rows.length) return { productionAttempts: 0 };
  const first = new Map<string, ActivityAttemptHistoryRow>();
  const corrected = new Map<string, ActivityAttemptHistoryRow>();
  for (const row of rows) {
    const key = `${row.activity_id}:${row.exercise_id}:${row.interaction_index}`;
    if (!first.has(key)) first.set(key, row);
    corrected.set(key, row);
  }
  const latest = [...corrected.values()];
  return {
    firstAttemptAccuracy: accuracy([...first.values()]),
    correctedAccuracy: accuracy(latest),
    transformationAccuracy: accuracy(latest.filter((row) => activityTypes.get(row.activity_id) === 'sentence_transformation')),
    conjugationAccuracy: accuracy(latest.filter((row) => activityTypes.get(row.activity_id) === 'conjugation_drill')),
    readingAccuracy: accuracy(latest.filter((row) => row.category === 'reading')),
    listeningAccuracy: accuracy(latest.filter((row) => row.category === 'listening')),
    productionAttempts: rows.filter((row) => row.category === 'production').length,
  };
}

async function activityAttemptHistory(
  database: SQLite.SQLiteDatabase,
  userId: string,
  activityIds: readonly string[],
): Promise<ActivityAttemptHistoryRow[]> {
  if (!activityIds.length) return [];
  return database.getAllAsync<ActivityAttemptHistoryRow>(
    `SELECT activity_id, exercise_id, interaction_index, attempt_number, category, correct
     FROM course_activity_attempt_history
     WHERE user_id = ? AND activity_id IN (${activityIds.map(() => '?').join(', ')})
     ORDER BY activity_id, exercise_id, interaction_index, attempt_number`,
    userId,
    ...activityIds,
  );
}

/** Summarizes the retained first and corrected responses without recalculating learning state. */
export async function getCourseLessonAnalytics(lessonId: string): Promise<CourseLessonAnalytics | undefined> {
  const lesson = await getCourseLesson(lessonId);
  if (!lesson?.activities.length) return undefined;
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  const rows = await activityAttemptHistory(database, profile.id, lesson.activities.map((activity) => activity.id));
  return summarizeCourseActivityAttempts(rows, new Map(lesson.activities.map((activity) => [activity.id, activity.type])));
}

/** Local-only diagnostic report for finding frustrating authored activities. */
export async function getCourseExperienceDebugReport(lessonId: string): Promise<CourseExperienceDebugReport | undefined> {
  const [lesson, database, profile] = await Promise.all([getCourseLesson(lessonId), getDatabase(), getLearnerProfile()]);
  if (!lesson) return undefined;
  const ids = lesson.activities.map((activity) => activity.id);
  if (!ids.length) return { lessonId, attempts: 0, retries: 0, repeatedFailureLoops: 0, hintedInteractions: 0, revealedAnswers: 0, completedSections: lesson.progress.completedSectionIds.length, activityTypeDistribution: {} };
  const placeholders = ids.map(() => '?').join(', ');
  const [attempts, hints] = await Promise.all([
    database.getAllAsync<{ activity_id: string; exercise_id: string; interaction_index: number; attempt_number: number; correct: number }>(
      `SELECT activity_id, exercise_id, interaction_index, attempt_number, correct FROM course_activity_attempt_history
       WHERE user_id = ? AND activity_id IN (${placeholders})`, profile.id, ...ids,
    ),
    database.getAllAsync<{ answer_revealed: number }>(
      `SELECT answer_revealed FROM course_activity_hint_usage WHERE user_id = ? AND activity_id IN (${placeholders})`, profile.id, ...ids,
    ),
  ]);
  const interactions = new Map<string, { attempts: number; incorrect: number }>();
  for (const attempt of attempts) {
    const key = `${attempt.activity_id}:${attempt.exercise_id}:${attempt.interaction_index}`;
    const current = interactions.get(key) ?? { attempts: 0, incorrect: 0 };
    current.attempts += 1;
    current.incorrect += attempt.correct ? 0 : 1;
    interactions.set(key, current);
  }
  const activityTypeDistribution: Record<string, number> = {};
  for (const activity of lesson.activities) activityTypeDistribution[activity.type] = (activityTypeDistribution[activity.type] ?? 0) + activity.interactionCount;
  return {
    lessonId,
    attempts: attempts.length,
    retries: [...interactions.values()].reduce((total, value) => total + Math.max(0, value.attempts - 1), 0),
    repeatedFailureLoops: [...interactions.values()].filter((value) => value.incorrect >= 2).length,
    hintedInteractions: hints.length,
    revealedAnswers: hints.filter((hint) => Boolean(hint.answer_revealed)).length,
    completedSections: lesson.progress.completedSectionIds.length,
    activityTypeDistribution,
  };
}

/** Aggregate course-workbook accuracy for the existing Progress screen. */
export async function getCourseLearningAnalytics(): Promise<CourseLessonAnalytics> {
  const manifest = buildCourseManifest();
  const activities = manifest.courses.flatMap((course) => course.units.flatMap((unit) => unit.lessons.flatMap((lesson) => lesson.activities)));
  const [database, profile] = await Promise.all([getDatabase(), getLearnerProfile()]);
  // Avoid a multi-thousand-value IN clause as the authored course grows.
  const rows = await database.getAllAsync<ActivityAttemptHistoryRow>(
    `SELECT activity_id, exercise_id, interaction_index, attempt_number, category, correct
     FROM course_activity_attempt_history
     WHERE user_id = ? AND activity_id IN (SELECT id FROM course_lesson_activities)
     ORDER BY activity_id, exercise_id, interaction_index, attempt_number`,
    profile.id,
  );
  return summarizeCourseActivityAttempts(rows, new Map(activities.map((activity) => [activity.id, activity.type])));
}

export async function completeCourseSection(lessonId: string, sectionId: string, secondsSpent = 0): Promise<CourseLessonSummary> {
  const lesson = await startCourseLesson(lessonId);
  const section = lesson.sections.find((candidate) => candidate.id === sectionId);
  if (!section) throw new Error('That section is not part of this lesson.');
  const database = await getDatabase();
  const profile = await getLearnerProfile();
  const now = new Date().toISOString();
  const current = await database.getFirstAsync<ProgressRow>('SELECT lesson_id, current_section_id, completed_sections_json, best_checkpoint_score, latest_checkpoint_score, started_at, completed_at, time_spent_seconds, placed_by_assessment FROM course_lesson_progress WHERE user_id = ? AND lesson_id = ?', profile.id, lessonId);
  const completed = new Set(mapProgress(current ?? undefined, lessonId).completedSectionIds);
  completed.add(sectionId);
  const nextSection = lesson.sections.find((candidate) => !completed.has(candidate.id));
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `INSERT INTO course_section_progress (user_id, section_id, completed_at, time_spent_seconds) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, section_id) DO UPDATE SET time_spent_seconds = MAX(course_section_progress.time_spent_seconds, excluded.time_spent_seconds)`,
      profile.id, sectionId, now, Math.max(0, Math.round(secondsSpent)),
    );
    await database.runAsync(
      `UPDATE course_lesson_progress SET completed_sections_json = ?, current_section_id = ?, time_spent_seconds = time_spent_seconds + ? WHERE user_id = ? AND lesson_id = ?`,
      JSON.stringify([...completed].sort()), nextSection?.id ?? sectionId, Math.max(0, Math.round(secondsSpent)), profile.id, lessonId,
    );
  });
  return (await getCourseLesson(lessonId)) ?? lesson;
}

function mapQuestion(row: QuestionRow, type: CourseQuestion['type']): CourseQuestion {
  const options = z.array(z.object({ id: z.string(), label: z.string() }).passthrough()).parse(JSON.parse(row.options_json) as unknown);
  return { id: row.id, itemId: row.item_id, type, domain: row.domain, prompt: row.prompt, explanation: row.explanation ?? undefined, correctOptionId: row.correct_option_id, options: options.map((option) => ({ id: option.id, label: option.label })) };
}

export async function getCourseCheckpointQuestions(lessonId: string): Promise<CourseQuestion[]> {
  const database = await getDatabase();
  await installCourseManifestIfNeeded(database);
  const references = await database.getAllAsync<ReferenceRow>('SELECT reference_type, reference_id FROM course_lesson_content_refs WHERE lesson_id = ? AND reference_role = \'checkpoint\' ORDER BY reference_type, reference_id', lessonId);
  const questionGroups = await Promise.all(references.map(async (reference) => {
    if (reference.reference_type === 'vocabulary-question') {
      const row = await database.getFirstAsync<QuestionRow>('SELECT id, vocabulary_id AS item_id, \'vocabulary\' AS domain, prompt, explanation, correct_option_id, options_json FROM vocabulary_question_bank WHERE id = ?', reference.reference_id);
      return row ? [mapQuestion(row, reference.reference_type)] : [];
    }
    if (reference.reference_type === 'practice-question') {
      const row = await database.getFirstAsync<QuestionRow>('SELECT id, item_id, domain, prompt, explanation, correct_option_id, options_json FROM canonical_practice_question_bank WHERE id = ?', reference.reference_id);
      return row ? [mapQuestion(row, reference.reference_type)] : [];
    }
    const row = await database.getFirstAsync<AssessmentQuestionRow>('SELECT id, curriculum_item_id, category, prompt, explanation, correct_option_id, options_json FROM assessment_questions WHERE id = ?', reference.reference_id);
    return row ? [{ id: row.id, itemId: row.curriculum_item_id, type: 'assessment-question' as const, domain: row.category, prompt: row.prompt, explanation: row.explanation, correctOptionId: row.correct_option_id, options: z.array(z.object({ id: z.string(), label: z.string() })).parse(JSON.parse(row.options_json) as unknown) }] : [];
  }));
  return questionGroups.flat().slice(0, 12);
}

export async function getCourseLessonContent(lessonId: string): Promise<CourseContentCard[]> {
  const database = await getDatabase();
  await installCourseManifestIfNeeded(database);
  const references = await database.getAllAsync<ReferenceRow>(
    `SELECT reference_type, reference_id FROM course_lesson_content_refs
     WHERE lesson_id = ? AND reference_type IN ('vocabulary', 'grammar', 'kanji', 'reading', 'listening')
     ORDER BY CASE reference_type WHEN 'vocabulary' THEN 1 WHEN 'grammar' THEN 2 WHEN 'kanji' THEN 3 WHEN 'listening' THEN 4 ELSE 5 END, reference_id`,
    lessonId,
  );
  if (!references.length) return [];
  const rows = await database.getAllAsync<{ id: string; type: CurriculumItemType; title: string; reading: string | null; meaning: string | null }>(
    `SELECT id, type, title, reading, meaning FROM curriculum_items WHERE id IN (${references.map(() => '?').join(', ')})`,
    ...references.map((reference) => reference.reference_id),
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return references.flatMap((reference) => {
    const row = byId.get(reference.reference_id);
    return row ? [{ id: row.id, type: row.type, title: row.title, reading: row.reading ?? undefined, meaning: row.meaning ?? undefined }] : [];
  });
}

export async function submitCourseCheckpoint(lessonId: string, answers: Readonly<Record<string, string | undefined>>): Promise<CourseCheckpointResult> {
  const [lesson, questions] = await Promise.all([startCourseLesson(lessonId), getCourseCheckpointQuestions(lessonId)]);
  if (!questions.length) throw new Error('This checkpoint has no installed questions.');
  const result = scoreCourseCheckpoint(questions, answers);
  const database = await getDatabase();
  const profile = await getLearnerProfile();
  const now = new Date().toISOString();
  const attemptId = createLocalId('course-checkpoint');
  for (const question of questions) {
    const selected = answers[question.id];
    const correct = selected === question.correctOptionId;
    await recordLearningAttempt({ id: createLocalId('course-attempt'), userId: profile.id, itemId: question.itemId, questionId: question.id, lessonId: `${attemptId}-${question.id}`, mode: question.domain === 'reading' ? 'reading' : question.domain === 'listening' ? 'listening' : 'quiz', correct, responseTimeMs: 0, selectedAnswer: selected, expectedAnswer: question.correctOptionId, createdAt: now });
    if (!correct) await database.runAsync(
      `INSERT INTO mistake_notebook (user_id, question_id, item_id, domain, added_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, question_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
      profile.id, question.id, question.itemId, question.domain, now, now,
    );
  }
  const checkpointSection = lesson.sections.find((section) => section.kind === 'checkpoint');
  if (checkpointSection) await completeCourseSection(lessonId, checkpointSection.id);
  const summarySection = lesson.sections.find((section) => section.kind === 'summary');
  await database.withTransactionAsync(async () => {
    await database.runAsync('INSERT INTO course_checkpoint_attempts (id, user_id, lesson_id, score, result_json, answers_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', attemptId, profile.id, lessonId, result.score, JSON.stringify(result), JSON.stringify(answers), now);
    await database.runAsync(
      `UPDATE course_lesson_progress SET latest_checkpoint_score = ?, best_checkpoint_score = MAX(COALESCE(best_checkpoint_score, 0), ?), completed_at = ?, current_section_id = ? WHERE user_id = ? AND lesson_id = ?`,
      result.score, result.score, now, summarySection?.id ?? null, profile.id, lessonId,
    );
    const unfinished = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM course_lessons AS lessons
       LEFT JOIN course_lesson_progress AS progress ON progress.lesson_id = lessons.id AND progress.user_id = ?
       WHERE lessons.course_id = ? AND (progress.completed_at IS NULL AND COALESCE(progress.placed_by_assessment, 0) = 0)`,
      profile.id, lesson.courseId,
    );
    if ((unfinished?.count ?? 1) === 0) await database.runAsync(
      'UPDATE course_enrollments SET completed_at = ? WHERE user_id = ? AND course_id = ?', now, profile.id, lesson.courseId,
    );
  });
  return result;
}

function unitForId(unitId: string): { course: CourseDefinition; unit: CourseDefinition['units'][number] } | undefined {
  const manifest = buildCourseManifest();
  for (const course of manifest.courses) {
    const unit = course.units.find((candidate) => candidate.id === unitId);
    if (unit) return { course, unit };
  }
  return undefined;
}

async function recordCourseQuestions(
  questions: readonly CourseQuestion[],
  answers: Readonly<Record<string, string | undefined>>,
  attemptPrefix: string,
  userId: string,
  createdAt: string,
): Promise<void> {
  const database = await getDatabase();
  for (const question of questions) {
    const selected = answers[question.id];
    const correct = selected === question.correctOptionId;
    await recordLearningAttempt({ id: createLocalId('course-attempt'), userId, itemId: question.itemId, questionId: question.id, lessonId: `${attemptPrefix}-${question.id}`, mode: question.domain === 'reading' ? 'reading' : question.domain === 'listening' ? 'listening' : 'quiz', correct, responseTimeMs: 0, selectedAnswer: selected, expectedAnswer: question.correctOptionId, createdAt });
    if (!correct) await database.runAsync(
      `INSERT INTO mistake_notebook (user_id, question_id, item_id, domain, added_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, question_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
      userId, question.id, question.itemId, question.domain, createdAt, createdAt,
    );
  }
}

export async function getUnitReviewQuestions(unitId: string): Promise<CourseQuestion[]> {
  const found = unitForId(unitId);
  if (!found) return [];
  const groups = await Promise.all(found.unit.lessons.map((lesson) => getCourseCheckpointQuestions(lesson.id)));
  const seen = new Set<string>();
  return groups.flat().filter((question) => {
    if (seen.has(question.id)) return false;
    seen.add(question.id);
    return true;
  }).slice(0, 24);
}

export async function submitUnitReview(unitId: string, answers: Readonly<Record<string, string | undefined>>): Promise<CourseCheckpointResult> {
  const found = unitForId(unitId);
  if (!found) throw new Error('This unit is not in the installed course.');
  const database = await getDatabase();
  await installCourseManifestIfNeeded(database);
  const profile = await getLearnerProfile();
  const progress = await courseProgress(found.course, database);
  if (!isUnitReviewAvailable(found.unit.lessons.map((lesson) => progress.get(lesson.id) ?? mapProgress(undefined, lesson.id)))) throw new Error('Attempt every lesson in this unit before starting its review.');
  const questions = await getUnitReviewQuestions(unitId);
  if (!questions.length) throw new Error('This unit review has no installed questions.');
  const result = scoreCourseCheckpoint(questions, answers);
  const now = new Date().toISOString();
  const id = createLocalId('course-unit-review');
  await recordCourseQuestions(questions, answers, id, profile.id, now);
  await database.runAsync('INSERT INTO course_unit_review_attempts (id, user_id, unit_id, score, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, profile.id, unitId, result.score, JSON.stringify(result), now);
  return result;
}

export async function getPlacementRecommendationForLearner(): Promise<CoursePlacementRecommendation> {
  const profile = await getLearnerProfile();
  return getPlacementRecommendation(profile.assessmentResult);
}

export async function getContinueLearningLesson(): Promise<CourseLessonSummary | undefined> {
  const database = await getDatabase();
  const profile = await getLearnerProfile();
  const row = await database.getFirstAsync<{ lesson_id: string }>(
    `SELECT progress.lesson_id FROM course_lesson_progress AS progress
     WHERE progress.user_id = ? AND progress.started_at IS NOT NULL AND progress.completed_at IS NULL
     ORDER BY progress.started_at DESC LIMIT 1`,
    profile.id,
  );
  if (!row) return undefined;
  const course = buildCourseOutline().find((candidate) => allLessons(candidate).some((lesson) => lesson.id === row.lesson_id));
  if (!course) return undefined;
  const [progress, allowBrowsing] = await Promise.all([courseProgress(course, database), getAllowBrowsing(database)]);
  return summariesForCourse(course, progress, allowBrowsing).find((lesson) => lesson.id === row.lesson_id);
}

export async function acceptCoursePlacement(recommendation: CoursePlacementRecommendation): Promise<void> {
  const courses = buildCourseOutline();
  const course = courses.find((candidate) => candidate.id === recommendation.courseId);
  if (!course || !course.units.some((unit) => unit.id === recommendation.unitId) || !allLessons(course).some((lesson) => lesson.id === recommendation.lessonId)) throw new Error('The suggested placement is not available in this course map.');
  const database = await getDatabase();
  await installCourseManifestIfNeeded(database);
  const profile = await getLearnerProfile();
  const now = new Date().toISOString();
  const target = allLessons(course).find((lesson) => lesson.id === recommendation.lessonId);
  if (!target) throw new Error('The suggested lesson could not be found.');
  await database.withTransactionAsync(async () => {
    await database.runAsync('INSERT INTO course_enrollments (user_id, course_id, started_at, selected_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, course_id) DO UPDATE SET selected_at = excluded.selected_at', profile.id, course.id, now, now);
    await database.runAsync('INSERT INTO course_placement_decisions (id, user_id, course_id, unit_id, lesson_id, assessment_score, accepted, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)', createLocalId('course-placement'), profile.id, course.id, target.unitId, target.id, profile.assessmentScore ?? null, now);
    for (const lesson of allLessons(course).filter((candidate) => candidate.order < target.order)) await database.runAsync(
      `INSERT INTO course_lesson_progress (user_id, lesson_id, completed_sections_json, placed_by_assessment) VALUES (?, ?, '[]', 1)
       ON CONFLICT(user_id, lesson_id) DO UPDATE SET placed_by_assessment = 1`, profile.id, lesson.id,
    );
  });
}

export async function getCourseItemUsage(itemId: string): Promise<CourseItemUsage> {
  const manifest = buildCourseManifest();
  const lessons = manifest.courses.flatMap((course) => allLessons(course));
  const usedIn = lessons.filter((lesson) => [lesson.vocabularyIds, lesson.grammarIds, lesson.kanjiIds, lesson.readingIds, lesson.listeningIds].some((ids) => ids.includes(itemId))).map((lesson) => ({ lessonId: lesson.id, lessonNumber: lesson.number, title: lesson.title }));
  return { introducedIn: usedIn[0], usedIn };
}
