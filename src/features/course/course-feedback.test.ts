import { describe, expect, it } from 'vitest';

import { evaluateCourseAnswer } from './course-feedback';
import type { LessonActivityExercise } from '@/types/course';

function exercise(overrides: Partial<LessonActivityExercise> = {}): LessonActivityExercise {
  return {
    id: 'exercise',
    responseKind: 'typed',
    category: 'vocabulary',
    prompt: 'Translate into polite Japanese. Good morning.',
    acceptedAnswers: ['おはようございます'],
    expectedResponse: { script: 'hiragana', politeness: 'polite', format: 'Use hiragana.' },
    ...overrides,
  };
}

describe('course feedback', () => {
  it('accepts punctuation, full-width normalization, and authored alternatives', () => {
    const answer = evaluateCourseAnswer(exercise({ acceptedAnswers: ['食べます', 'たべます'] }), 'たべます！', 0);
    expect(answer.correct).toBe(true);
    expect(answer.feedback.title).toBe('Correct');
  });

  it('recognises a correct casual greeting when polite Japanese is required', () => {
    const answer = evaluateCourseAnswer(exercise(), 'おはよう', 0);
    expect(answer.correct).toBe(false);
    expect(answer.feedback.kind).toBe('partial');
    expect(answer.feedback.explanation).toContain('polite');
  });

  it('gives a Japanese-specific long-vowel correction', () => {
    const answer = evaluateCourseAnswer(exercise({ acceptedAnswers: ['おはよう'], expectedResponse: { script: 'hiragana', politeness: 'either' } }), 'おはよ', 0);
    expect(answer.feedback.explanation).toContain('final 「う」');
  });

  it('identifies a particle replacement when the sentence otherwise matches', () => {
    const answer = evaluateCourseAnswer(exercise({ acceptedAnswers: ['学校で勉強します'] }), '学校に勉強します', 0);
    expect(answer.feedback.explanation).toContain('「で」');
  });

  it('uses an authored conjugation hint and teaches after three failed attempts', () => {
    const verb = exercise({ category: 'conjugation', acceptedAnswers: ['読んで'], hints: ['む、ぶ、ぬ often change to んで.', '読＿', '読んで'] });
    const first = evaluateCourseAnswer(verb, '読いて', 0);
    const third = evaluateCourseAnswer(verb, '読いて', 2);
    expect(first.feedback.hint).toContain('んで');
    expect(first.feedback.canRetry).toBe(true);
    expect(third.feedback.kind).toBe('teaching');
    expect(third.feedback.canContinue).toBe(true);
    expect(third.feedback.scheduleForReview).toBe(true);
  });
});
