import { describe, expect, it } from 'vitest';

import { getMockExam, getMockExamQuestion, getMockExams } from './mock-exam-catalog';

describe('bundled JLPT mock exam catalogue', () => {
  it('contains exactly five complete exams for N5 and N4', () => {
    expect(getMockExams('N5')).toHaveLength(5);
    expect(getMockExams('N4')).toHaveLength(5);
    for (const exam of [...getMockExams('N5'), ...getMockExams('N4')]) {
      expect(exam.sections).toHaveLength(3);
      expect(new Set(exam.placements.map((placement) => placement.questionId)).size).toBe(exam.placements.length);
      expect(new Set(exam.placements.map((placement) => placement.domain))).toEqual(new Set(['vocabulary', 'kanji', 'grammar', 'reading', 'listening']));
    }
  });

  it('has one valid answer and source-linked content for every placement', () => {
    for (const exam of [...getMockExams('N5'), ...getMockExams('N4')]) {
      for (const placement of exam.placements) {
        const question = getMockExamQuestion(placement.questionId);
        expect(question).toBeDefined();
        expect(question?.choices).toHaveLength(4);
        expect(question?.choices.filter((choice) => choice.id === question.correctOptionId)).toHaveLength(1);
        if (exam.level === 'N5') expect(question?.level).toBe('N5');
      }
    }
  });

  it('retains stable IDs for deep links and progress records', () => {
    const first = getMockExams('N5')[0]!;
    expect(getMockExam(first.id)).toEqual(first);
  });
});
