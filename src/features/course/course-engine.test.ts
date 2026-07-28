import { describe, expect, it } from 'vitest';

import { checkpointClassification, getPlacementRecommendation, isUnitReviewAvailable, nextLessonState, scoreCourseCheckpoint } from './course-engine';
import type { CourseLessonDefinition, CourseQuestion } from '@/types/course';

const lesson: CourseLessonDefinition = {
  id: 'lesson-2', order: 2, number: 2, contentLevel: 'N5', title: 'Second', theme: 'Test', communicationGoal: 'Test the progression.', objectives: ['test'], patternObjectives: ['pattern one', 'pattern two'], estimatedMinutes: 20,
  prerequisiteLessonIds: ['lesson-1'], vocabularyIds: [], grammarIds: [], kanjiIds: [], readingIds: [], listeningIds: [], vocabularyQuestionIds: [], practiceQuestionIds: [], assessmentQuestionIds: [],
  verbForms: [], adjectiveForms: [], experience: { template: 'conversation_first', primarySkill: 'Test', sectionOrder: ['introduction'], feedbackStyle: 'concise', allowOptionalSpeaking: true, showFullOverviewAtStart: false, transitionStyle: 'minimal' }, activities: [],
  sections: [{ id: 'section-1', order: 1, kind: 'introduction', title: 'Start', instruction: 'Start.', estimatedMinutes: 1 }],
};
const questions: CourseQuestion[] = [
  { id: 'q1', itemId: 'v1', type: 'vocabulary-question', domain: 'vocabulary', prompt: 'One', correctOptionId: 'a', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
  { id: 'q2', itemId: 'g1', type: 'practice-question', domain: 'grammar', prompt: 'Two', correctOptionId: 'b', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
];

describe('course engine', () => {
  it('scores checkpoints by domain and identifies weak content', () => {
    const result = scoreCourseCheckpoint(questions, { q1: 'a', q2: 'a' });
    expect(result.score).toBe(50);
    expect(result.classification).toBe('needs_review');
    expect(result.byDomain.grammar?.score).toBe(0);
    expect(result.weakItemIds).toEqual(['g1']);
  });

  it('uses the specified checkpoint bands', () => {
    expect([0, 59].map(checkpointClassification)).toEqual(['needs_review', 'needs_review']);
    expect([60, 74].map(checkpointClassification)).toEqual(['developing', 'developing']);
    expect([75, 89].map(checkpointClassification)).toEqual(['passed', 'passed']);
    expect([90, 100].map(checkpointClassification)).toEqual(['strong', 'strong']);
  });

  it('locks ordered lessons unless browsing is allowed', () => {
    expect(nextLessonState(lesson, undefined, ['available'], false)).toBe('locked');
    expect(nextLessonState(lesson, undefined, ['completed'], false)).toBe('available');
    expect(nextLessonState(lesson, undefined, ['locked'], true)).toBe('available');
  });

  it('unlocks unit reviews after every lesson has been attempted', () => {
    expect(isUnitReviewAvailable([{ lessonId: '1', state: 'available', completedSectionIds: [], timeSpentSeconds: 0, placedByAssessment: false }])).toBe(false);
    expect(isUnitReviewAvailable([{ lessonId: '1', state: 'in_progress', completedSectionIds: [], timeSpentSeconds: 0, placedByAssessment: false, startedAt: '2026-01-01T00:00:00.000Z' }])).toBe(true);
  });

  it('provides deterministic placement recommendations', () => {
    expect(getPlacementRecommendation(undefined).courseId).toBe('foundations');
    expect(getPlacementRecommendation({ overallScore: 65 } as never).lessonId).toBe('n5-lesson-07');
    expect(getPlacementRecommendation({ overallScore: 90 } as never).courseId).toBe('jlpt-n4');
  });
});
