import { describe, expect, it } from 'vitest';

import { buildCourseManifest } from './course-definition';
import { validateLessonExperience, validateLessonTemplateDistribution } from './lesson-experience';

describe('lesson experience configuration', () => {
  it('keeps Lesson 1 free of a previous-lesson warm-up and starts with an easy recognition task', () => {
    const manifest = buildCourseManifest();
    const lesson = manifest.courses.find((course) => course.id === 'jlpt-n5')?.units[0]?.lessons[0];
    expect(lesson?.activities.some((activity) => activity.type === 'warm_up')).toBe(false);
    expect(lesson?.activities[0]?.title).toBe('Meet Aya');
    expect(lesson?.activities[0]?.exercises[0]?.responseKind).toBe('select');
  });

  it('assigns varied templates and explicit response formats across the authored course', () => {
    const manifest = buildCourseManifest();
    const lessons = manifest.courses.find((course) => course.id === 'jlpt-n5')?.units.flatMap((unit) => unit.lessons) ?? [];
    expect(new Set(lessons.map((lesson) => lesson.experience.template)).size).toBeGreaterThanOrEqual(5);
    expect(validateLessonTemplateDistribution(lessons)).toEqual([]);
    expect(lessons.flatMap((lesson) => lesson.activities).flatMap((activity) => activity.exercises).filter((exercise) => exercise.responseKind === 'typed').every((exercise) => Boolean(exercise.expectedResponse))).toBe(true);
  });

  it('passes activity variety checks and catches an invalid Lesson 1 warm-up', () => {
    const manifest = buildCourseManifest();
    const lesson = structuredClone(manifest.courses.find((course) => course.id === 'jlpt-n4')?.units[0]?.lessons[0]);
    if (!lesson) throw new Error('Lesson unavailable');
    expect(validateLessonExperience(lesson)).toEqual([]);
    lesson.activities.push({ ...lesson.activities[0]!, id: 'invalid-warmup', order: 99, type: 'warm_up', title: 'Warm-up', interactionCount: 1 });
    expect(validateLessonExperience(lesson).map((issue) => issue.message)).toContain('Lesson 1 cannot contain a previous-lesson warm-up.');
  });
});
