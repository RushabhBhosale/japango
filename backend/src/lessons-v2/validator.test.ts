import { describe, expect, it } from 'vitest';

import { validateLessonV2Version } from './validator';

const sourceChunkId = '11111111-1111-4111-8111-111111111111';
function text(raw: string, status: 'verified' | 'needs_review' = 'verified') {
  return { raw, tokens: [{ id: `token-${raw}`, kind: 'plain' as const, surface: raw, kanjiIds: [], status }], status };
}

function lesson(questionStatus: 'valid' | 'draft' = 'valid') {
  return {
    id: '22222222-2222-4222-8222-222222222222', lessonId: '33333333-3333-4333-8333-333333333333', version: 1, status: 'draft', level: 'N5', title: 'Introduce yourself', slug: 'introduce-yourself', objectives: ['Use a simple self-introduction.'], estimatedMinutes: 12, createdAt: '2026-08-03T00:00:00.000Z', sourceReferences: [],
    sections: [{ id: 'section-1', kind: 'quiz', title: 'Check', order: 1, estimatedMinutes: 3, content: [], vocabularyIds: [], grammarIds: [], kanjiIds: [], questions: [{
      id: 'question-1', level: 'N5', type: 'grammar_cloze', section: 'grammar', sourcePatternIds: ['pattern-1'], testedSkill: 'particle choice', objectiveId: 'objective-1', grammarIds: [], vocabularyIds: [], kanjiIds: [], instruction: text('もっともいいものをえらんでください。'), prompt: text('わたし（ ）がくせいです。'), choices: [
        { id: 'a', label: { english: 'は' }, isCorrect: true }, { id: 'b', label: { english: 'を' }, isCorrect: false }, { id: 'c', label: { english: 'に' }, isCorrect: false }, { id: 'd', label: { english: 'で' }, isCorrect: false },
      ], explanation: { correct: { english: 'は marks the topic.' }, distractors: [], readingEvidenceTokenIds: [], vocabularyIds: [], kanjiIds: [] }, difficulty: 1, estimatedSeconds: 30, validationStatus: questionStatus, sourceReferences: [{ id: 'reference-1', sourceChunkId, sourcePath: 'question-paper.md', sourceRole: 'question_pattern' }],
    }] }],
  };
}

describe('Lessons V2 validation', () => {
  it('accepts a fully tokenized valid draft', () => {
    expect(validateLessonV2Version(lesson()).issues).toEqual([]);
  });

  it('blocks a draft question from publication', () => {
    expect(validateLessonV2Version(lesson('draft')).issues.some((issue) => issue.issueType === 'question_validation_status')).toBe(true);
  });

  it('blocks a known unnatural Japanese collocation from publication', () => {
    const candidate = lesson();
    candidate.sections[0]!.questions[0]!.prompt = text('彼が計画を救ったと言ってもいいです。');

    expect(validateLessonV2Version(candidate).issues).toContainEqual(expect.objectContaining({
      subjectId: 'question-1',
      issueType: 'japanese_naturalness_preflight',
      severity: 'critical',
    }));
  });
});
