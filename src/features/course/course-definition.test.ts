import { describe, expect, it } from 'vitest';

import { buildCourseManifest, validateCourseManifest } from './course-definition';

describe('structured course manifest', () => {
  it('builds a deterministic, fully referenceable offline course map', () => {
    const first = buildCourseManifest();
    const second = buildCourseManifest();
    expect(first.hash).toBe(second.hash);
    expect(validateCourseManifest(first)).toEqual([]);
  });

  it('includes a complete Foundations sequence before N5 and N4', () => {
    const manifest = buildCourseManifest();
    const foundations = manifest.courses.find((course) => course.id === 'foundations');
    const n5 = manifest.courses.find((course) => course.id === 'jlpt-n5');
    const n4 = manifest.courses.find((course) => course.id === 'jlpt-n4');
    expect(foundations?.units.flatMap((unit) => unit.lessons)).toHaveLength(8);
    expect(n5?.units).toHaveLength(9);
    expect(n5?.units.flatMap((unit) => unit.lessons)).toHaveLength(27);
    expect(n4?.units).toHaveLength(12);
    expect(n4?.units.flatMap((unit) => unit.lessons)).toHaveLength(36);
  });

  it('populates substantial guided chapters with required textbook activities', () => {
    const manifest = buildCourseManifest();
    const n5Lesson = manifest.courses.find((course) => course.id === 'jlpt-n5')?.units[0]?.lessons[0];
    const n4Lesson = manifest.courses.find((course) => course.id === 'jlpt-n4')?.units.at(-1)?.lessons.at(-1);
    for (const lesson of [n5Lesson, n4Lesson]) {
      expect(lesson?.estimatedMinutes).toBeGreaterThanOrEqual(45);
      expect(lesson?.vocabularyIds.length).toBeGreaterThanOrEqual(12);
      expect(lesson?.patternObjectives.length).toBeGreaterThanOrEqual(2);
      expect(lesson?.activities.reduce((total, activity) => total + activity.interactionCount, 0)).toBeGreaterThanOrEqual(40);
      expect(lesson?.activities.find((activity) => activity.type === 'checkpoint')?.interactionCount).toBeGreaterThanOrEqual(20);
      expect(lesson?.activities.some((activity) => activity.type === 'sentence_transformation')).toBe(true);
      expect(lesson?.activities.some((activity) => activity.type === 'reading')).toBe(true);
      expect(lesson?.activities.some((activity) => activity.type === 'listening')).toBe(true);
    }
  });

  it('rejects shallow and duplicate exercises in a normal lesson', () => {
    const copy = structuredClone(buildCourseManifest());
    const lesson = copy.courses.find((course) => course.id === 'jlpt-n5')?.units[0]?.lessons[0];
    if (!lesson) throw new Error('N5 lesson unavailable.');
    lesson.estimatedMinutes = 20;
    const checkpoint = lesson.activities.find((activity) => activity.type === 'checkpoint');
    if (!checkpoint) throw new Error('Checkpoint unavailable.');
    checkpoint.exercises[1] = { ...checkpoint.exercises[0]!, id: checkpoint.exercises[0]!.id };
    checkpoint.interactionCount = checkpoint.exercises.length;
    expect(validateCourseManifest(copy).map((issue) => issue.message)).toEqual(expect.arrayContaining([
      'A normal lesson must estimate at least 45 minutes.',
      `Duplicate exercise ID ${checkpoint.exercises[0]!.id}.`,
    ]));
  });

  it('keeps verb forms ordered and gives the て-form workshop substantial practice', () => {
    const manifest = buildCourseManifest();
    const n5 = manifest.courses.find((course) => course.id === 'jlpt-n5');
    const n4 = manifest.courses.find((course) => course.id === 'jlpt-n4');
    const teWorkshop = n5?.units.flatMap((unit) => unit.lessons).find((lesson) => lesson.number === 24);
    expect(teWorkshop?.verbForms).toContain('te');
    expect(teWorkshop?.activities.find((activity) => activity.title === 'て-form mastery drill')?.interactionCount).toBeGreaterThanOrEqual(25);
    expect(n4?.units.flatMap((unit) => unit.lessons).flatMap((lesson) => lesson.verbForms)).toEqual(expect.arrayContaining(['potential', 'volitional', 'tara', 'nara', 'ba', 'passive', 'causative', 'causative_passive']));
    const n4Lessons = n4?.units.flatMap((unit) => unit.lessons) ?? [];
    expect(n4Lessons.find((lesson) => lesson.number === 10)?.verbForms).toContain('potential');
    expect(n4Lessons.find((lesson) => lesson.number === 28)?.verbForms).toContain('passive');
    expect(n4Lessons.find((lesson) => lesson.number === 29)?.verbForms).toContain('causative');
    expect(n4Lessons.find((lesson) => lesson.number === 30)?.verbForms).toContain('causative_passive');

    const invalid = structuredClone(manifest);
    const firstN5 = invalid.courses.find((course) => course.id === 'jlpt-n5')?.units[0]?.lessons[0];
    if (!firstN5) throw new Error('N5 lesson unavailable.');
    firstN5.verbForms = ['te'];
    expect(validateCourseManifest(invalid).map((issue) => issue.message)).toContain('te form is introduced before its dictionary form prerequisite.');
  });

  it('links progressively longer reading and listening practice to every chapter', () => {
    const manifest = buildCourseManifest();
    const courseLessons = (courseId: string) => manifest.courses.find((course) => course.id === courseId)?.units.flatMap((unit) => unit.lessons) ?? [];
    const passageLength = (lesson: ReturnType<typeof courseLessons>[number]) => lesson.activities.find((activity) => activity.type === 'reading')?.exercises[0]?.readingText?.length ?? 0;
    const n5 = courseLessons('jlpt-n5');
    const n4 = courseLessons('jlpt-n4');
    expect(passageLength(n5[0]!)).toBeGreaterThanOrEqual(60);
    expect(passageLength(n5[20]!)).toBeGreaterThanOrEqual(120);
    expect(passageLength(n4[0]!)).toBeGreaterThanOrEqual(250);
    expect(passageLength(n4[15]!)).toBeGreaterThanOrEqual(400);
    expect(passageLength(n4[27]!)).toBeGreaterThanOrEqual(600);
    for (const lesson of [...n5, ...n4]) {
      const readingPassage = lesson.activities.find((activity) => activity.title === 'Reading passage')?.exercises[0]?.readingText;
      const readingQuestions = lesson.activities.find((activity) => activity.title === 'Reading comprehension')?.exercises;
      expect(lesson.activities.some((activity) => activity.type === 'timed_reading')).toBe(true);
      expect(lesson.activities.some((activity) => activity.type === 'dictation')).toBe(true);
      expect(lesson.activities.some((activity) => activity.type === 'shadowing')).toBe(true);
      expect(lesson.activities.some((activity) => activity.type === 'listening' && activity.exercises.some((exercise) => exercise.listeningText))).toBe(true);
      expect(readingQuestions?.every((exercise) => exercise.readingText === readingPassage)).toBe(true);
    }
  });

  it('populates every N5 and N4 unit with substantial lessons and a workshop', () => {
    const manifest = buildCourseManifest();
    for (const courseId of ['jlpt-n5', 'jlpt-n4']) {
      const course = manifest.courses.find((candidate) => candidate.id === courseId);
      if (!course) throw new Error(`Missing ${courseId}.`);
      expect(course.units.every((unit) => unit.lessons.length === 3)).toBe(true);
      expect(course.units.every((unit) => unit.lessons.some((lesson) => lesson.kind === 'workshop'))).toBe(true);
      expect(course.units.flatMap((unit) => unit.lessons).every((lesson) => lesson.estimatedMinutes >= 45 && lesson.activities.length >= 32)).toBe(true);
      expect(course.units.flatMap((unit) => unit.lessons).filter((lesson) => lesson.kind !== 'workshop').every((lesson) => lesson.activities.reduce((total, activity) => total + activity.interactionCount, 0) <= 90)).toBe(true);
    }
  });

  it('detects an invalid canonical reference and prerequisite cycle', () => {
    const manifest = buildCourseManifest();
    const copy = structuredClone(manifest);
    const first = copy.courses[0]?.units[0]?.lessons[0];
    const second = copy.courses[0]?.units[0]?.lessons[1];
    if (!first || !second) throw new Error('Test course is unavailable.');
    first.vocabularyIds = ['not-a-canonical-item'];
    first.prerequisiteLessonIds = [second.id];
    second.prerequisiteLessonIds = [first.id];
    expect(validateCourseManifest(copy).map((issue) => issue.message)).toEqual(expect.arrayContaining([
      'Missing canonical vocabulary reference not-a-canonical-item.',
      'Impossible prerequisite cycle.',
      'Manifest hash does not match deterministic course content.',
    ]));
  });
});
