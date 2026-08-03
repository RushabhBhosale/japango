import { lessonV2QuestionSchema, type LessonV2Question, type LessonV2ValidationIssue } from './contracts';
import { highestSourceSimilarity } from './similarity';

export function validateJlptQuestion(
  value: unknown,
  options: { approvedPatternIds: ReadonlySet<string>; sourceTexts: readonly string[] },
): { question?: LessonV2Question; issues: LessonV2ValidationIssue[] } {
  const parsed = lessonV2QuestionSchema.safeParse(value);
  if (!parsed.success) return {
    issues: parsed.error.issues.map((issue) => ({ severity: 'critical', subjectId: issue.path.join('.') || 'question', issueType: 'schema', message: issue.message })),
  };
  const question = parsed.data;
  const issues: LessonV2ValidationIssue[] = [];
  if (question.sourcePatternIds.some((id) => !options.approvedPatternIds.has(id))) {
    issues.push({ severity: 'critical', subjectId: question.id, issueType: 'unapproved_source_pattern', message: 'Every JLPT-style question must cite an approved source pattern.' });
  }
  if (question.validationStatus !== 'valid') {
    issues.push({ severity: 'critical', subjectId: question.id, issueType: 'draft_question', message: 'Question remains a draft and cannot publish.' });
  }
  const candidate = [question.instruction.raw, question.passage?.raw ?? '', question.prompt.raw, ...question.choices.map((choice) => choice.label.japanese?.raw ?? '')].join('\n');
  const similarity = highestSourceSimilarity(candidate, options.sourceTexts);
  if (similarity >= 0.82) issues.push({ severity: 'critical', subjectId: question.id, issueType: 'source_similarity', message: 'Question is too similar to private source-paper text. Create a new original situation.', suggestedFix: 'Change the setting, sentence, names, choices, and distractors.' });
  if (question.type.includes('reading') && !question.passage) {
    issues.push({ severity: 'critical', subjectId: question.id, issueType: 'missing_reading_passage', message: 'A reading question needs a passage for evidence-based answering.' });
  }
  if (question.type === 'sentence_order_star' && !question.explanation.correct.japanese?.raw.includes('★')) {
    issues.push({ severity: 'warning', subjectId: question.id, issueType: 'ordering_explanation', message: 'Include the completed correct order and explain the star position before approval.' });
  }
  return { question, issues };
}
