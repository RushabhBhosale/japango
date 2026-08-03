import { lessonV2VersionSchema, type LessonV2ValidationIssue, type LessonV2Version } from './contracts';

function issue(subjectId: string, issueType: string, message: string, severity: LessonV2ValidationIssue['severity'] = 'critical'): LessonV2ValidationIssue {
  return { severity, subjectId, issueType, message };
}

/** Validates authored data before it can move beyond draft; no OCR repair occurs here. */
export function validateLessonV2Version(value: unknown): { lesson?: LessonV2Version; issues: LessonV2ValidationIssue[] } {
  const parsed = lessonV2VersionSchema.safeParse(value);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((error) => issue(error.path.join('.') || 'lesson', 'schema', error.message)),
    };
  }
  const lesson = parsed.data;
  const issues: LessonV2ValidationIssue[] = [];
  for (const section of lesson.sections) {
    for (const content of section.content) {
      if (content.japanese?.status !== undefined && content.japanese.status !== 'verified') {
        issues.push(issue(section.id, 'unverified_section_tokenization', 'Every published Japanese lesson section must have verified tokens.'));
      }
    }
    for (const question of section.questions) {
      if (question.validationStatus !== 'valid') issues.push(issue(question.id, 'question_validation_status', 'Question must be valid before this lesson can publish.'));
      if (question.similarityScore !== undefined && question.similarityScore >= 0.82) {
        issues.push(issue(question.id, 'source_similarity', 'Question is too similar to a source-paper question. Create a new original item.'));
      }
      for (const text of [question.instruction, question.passage, question.prompt]) {
        if (text && text.status !== 'verified') issues.push(issue(question.id, 'unverified_tokenization', 'All published Japanese text must have verified tokens.'));
      }
      for (const choice of question.choices) {
        if (choice.label.japanese && choice.label.japanese.status !== 'verified') issues.push(issue(question.id, 'unverified_choice_tokenization', 'Every Japanese choice must have verified tokens.'));
        if (choice.explanation?.japanese && choice.explanation.japanese.status !== 'verified') issues.push(issue(question.id, 'unverified_choice_explanation_tokenization', 'Every Japanese choice explanation must have verified tokens.'));
      }
      if (question.explanation.correct.japanese && question.explanation.correct.japanese.status !== 'verified') issues.push(issue(question.id, 'unverified_explanation_tokenization', 'Every Japanese answer explanation must have verified tokens.'));
      for (const explanation of question.explanation.distractors) {
        if (explanation.explanation.japanese && explanation.explanation.japanese.status !== 'verified') issues.push(issue(question.id, 'unverified_distractor_explanation_tokenization', 'Every Japanese distractor explanation must have verified tokens.'));
      }
      if (question.sourceReferences.some((reference) => reference.sourceRole === 'quality_warning')) {
        issues.push(issue(question.id, 'corrupted_source_reference', 'A question cannot publish while relying on an OCR quality-warning source.'));
      }
    }
  }
  return { lesson, issues };
}
