import { describe, expect, it } from 'vitest';

import type { LessonV2Version } from './contracts';
import { auditIssuesForGeneratedQuestion, auditIssuesForLesson, auditLessonsV2Content } from './content-audit';

function japanese(raw: string) {
  return { raw, tokens: [{ id: `token-${raw}`, kind: 'plain' as const, surface: raw, kanjiIds: [], status: 'verified' as const }], status: 'verified' as const };
}

function lesson(id: string, content: string, prompt: string): LessonV2Version {
  return {
    id,
    lessonId: `${id}-lesson`,
    version: 1,
    status: 'draft',
    level: 'N5',
    title: `Lesson ${id}`,
    slug: `lesson-${id}`,
    objectives: [`Use the grammar point in a new context for lesson ${id}.`],
    estimatedMinutes: 10,
    createdAt: '2026-08-04T00:00:00.000Z',
    sourceReferences: [],
    sections: [{
      id: `${id}-section`, kind: 'dialogue', title: `Dialogue ${id}`, order: 1, estimatedMinutes: 5,
      content: [{ japanese: japanese(content) }], vocabularyIds: [], grammarIds: [], kanjiIds: [],
      questions: [{
        id: `${id}-question`, level: 'N5', type: 'app_practice', section: 'grammar', sourcePatternIds: ['pattern-1'], testedSkill: 'choose a sentence', objectiveId: 'objective-1', grammarIds: [], vocabularyIds: [], kanjiIds: [],
        instruction: japanese('いちばん自然な文を一つ選んでください。'), prompt: japanese(prompt), choices: [
          { id: `${id}-a`, label: { english: 'Answer A' }, isCorrect: true },
          { id: `${id}-b`, label: { english: 'Answer B' }, isCorrect: false },
        ],
        explanation: { correct: { english: `The answer uses the target grammar correctly in lesson ${id}.` }, distractors: [], readingEvidenceTokenIds: [], vocabularyIds: [], kanjiIds: [] },
        difficulty: 2, estimatedSeconds: 30, validationStatus: 'valid', sourceReferences: [{ id: `${id}-source`, sourceChunkId: '11111111-1111-4111-8111-111111111111', sourcePath: 'paper.md', sourceRole: 'question_pattern' }],
      }],
    }],
  };
}

describe('Lessons V2 content audit', () => {
  it('reports exact dialogue duplication to both affected lessons', () => {
    const first = lesson('one', '駅の近くの店で、友だちと昼ごはんを食べました。', 'きょう、何をしましたか。');
    const second = lesson('two', '駅の近くの店で、友だちと昼ごはんを食べました。', 'あした、何をしますか。');

    const audit = auditLessonsV2Content([first, second]);

    expect(audit.exactDuplicateCount).toBe(2);
    expect(auditIssuesForLesson(audit, first).some((issue) => issue.issueType === 'exact_duplicate_content')).toBe(true);
    expect(auditIssuesForLesson(audit, second).some((issue) => issue.issueType === 'exact_duplicate_content')).toBe(true);
  });

  it('blocks a near-identical question prompt while leaving a distinct context alone', () => {
    const first = lesson('one', '田中さんは朝、会社へ行きました。', '図書館で来週の日本語の会話クラスを予約しました。受付で名前と電話番号を書きました。');
    const second = lesson('two', '佐藤さんは午後、病院へ行きました。', '図書館で来週の日本語の会話クラスを予約しました。受付で住所と電話番号を書きました。');
    const distinct = lesson('three', '山田さんは日曜日に公園を散歩しました。', '土曜日の朝、市場でりんごとパンを買って、家で朝ごはんを作りました。');

    const audit = auditLessonsV2Content([first, second, distinct]);

    expect(audit.issues.some((issue) => issue.issueType === 'high_similarity_content' && issue.severity === 'critical')).toBe(true);
    expect(auditIssuesForLesson(audit, distinct).some((issue) => issue.issueType === 'high_similarity_content' && issue.message.includes('question prompt'))).toBe(false);
  });

  it('includes non-archived generated mock-test questions in the same audit', () => {
    const source = lesson('one', '田中さんは朝、会社へ行きました。', '図書館で来週の日本語の会話クラスを予約しました。受付で名前と電話番号を書きました。');
    const generated = source.sections[0]?.questions[0];
    if (!generated) throw new Error('Fixture question is missing.');

    const audit = auditLessonsV2Content([source], [{ id: 'generated-question-id', question: generated }]);

    expect(audit.scannedGeneratedQuestions).toBe(1);
    expect(auditIssuesForGeneratedQuestion(audit, 'generated-question-id').some((issue) => issue.severity === 'critical')).toBe(true);
  });
});
