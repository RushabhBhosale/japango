import type { AudioLessonVersion } from './contracts';
import type { LessonV2ValidationIssue } from '../lessons-v2/contracts';
import { japaneseTextSimilarity, normalizedText } from '../lessons-v2/similarity';

const HIGH_SIMILARITY = 0.86;
const REVIEW_SIMILARITY = 0.72;

interface ContentNode {
  id: string;
  lessonVersionId: string;
  subjectId: string;
  description: string;
  language: 'japanese' | 'english';
  text: string;
}

export interface AudioContentAuditIssue extends LessonV2ValidationIssue {
  lessonVersionId: string;
}

export interface AudioContentAudit {
  scannedLessons: number;
  scannedTextFields: number;
  exactDuplicateCount: number;
  highSimilarityCount: number;
  reviewSimilarityCount: number;
  issues: AudioContentAuditIssue[];
}

function addNode(nodes: ContentNode[], node: ContentNode): void {
  const minimum = node.language === 'japanese' ? 12 : 24;
  if (normalizedText(node.text).length >= minimum) nodes.push(node);
}

function collectNodes(lessons: readonly AudioLessonVersion[]): ContentNode[] {
  const nodes: ContentNode[] = [];
  for (const lesson of lessons) {
    lesson.scriptSections.forEach((section) => {
      if (section.structuredJapanese) addNode(nodes, {
        id: `${lesson.id}:${section.id}:japanese`, lessonVersionId: lesson.id, subjectId: section.id,
        description: `${section.sectionType} section in “${lesson.title}”`, language: 'japanese', text: section.structuredJapanese.raw,
      });
      if (section.language !== 'japanese') addNode(nodes, {
        id: `${lesson.id}:${section.id}:spoken`, lessonVersionId: lesson.id, subjectId: section.id,
        description: `${section.sectionType} spoken script in “${lesson.title}”`, language: 'english', text: section.text,
      });
    });
    lesson.listeningQuestions.forEach((question) => {
      const questionTexts = [
        ['prompt', question.prompt],
        ['correct explanation', question.explanation.correct],
        ...question.choices.map((choice) => [`choice ${choice.id}`, choice.label] as const),
        ...question.explanation.distractors.map((distractor) => [`distractor explanation ${distractor.choiceId}`, distractor.explanation] as const),
        ...(question.explanation.commonMistake ? [['common mistake', question.explanation.commonMistake] as const] : []),
      ] as const;
      for (const [role, text] of questionTexts) {
        if (text.japanese) addNode(nodes, {
          id: `${lesson.id}:${question.id}:${role}:japanese`, lessonVersionId: lesson.id, subjectId: question.id,
          description: `${role} for question ${question.id} in “${lesson.title}”`, language: 'japanese', text: text.japanese.raw,
        });
        if (text.english) addNode(nodes, {
          id: `${lesson.id}:${question.id}:${role}:english`, lessonVersionId: lesson.id, subjectId: question.id,
          description: `${role} for question ${question.id} in “${lesson.title}”`, language: 'english', text: text.english,
        });
      }
    });
  }
  return nodes;
}

function issue(node: ContentNode, other: ContentNode, similarity: number, severity: 'critical' | 'warning', exact: boolean): AudioContentAuditIssue {
  return {
    lessonVersionId: node.lessonVersionId,
    subjectId: node.subjectId,
    severity,
    issueType: exact ? 'audio_exact_duplicate_content' : severity === 'critical' ? 'audio_high_similarity_content' : 'audio_repetitive_content_pattern',
    message: exact
      ? `${node.description} exactly repeats ${other.description}.`
      : `${node.description} is ${Math.round(similarity * 100)}% text-similar to ${other.description}.`,
    suggestedFix: severity === 'critical'
      ? 'Write a new audio-first situation with different people, setting, nouns, verbs, sentence pattern, question wording, and distractors. Re-verify linked Japanese text and explanations.'
      : 'Review this repeated pattern. Replace it when it does not serve deliberate spaced repetition.',
  };
}

/** Non-mutating audit for all learner-heard script and question text. */
export function auditAudioLessonContent(lessons: readonly AudioLessonVersion[]): AudioContentAudit {
  const nodes = collectNodes(lessons);
  const issues: AudioContentAuditIssue[] = [];
  const exact = new Map<string, ContentNode[]>();
  let exactDuplicateCount = 0;
  let highSimilarityCount = 0;
  let reviewSimilarityCount = 0;

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    const key = `${node.language}:${normalizedText(node.text)}`;
    for (const other of exact.get(key) ?? []) {
      exactDuplicateCount += 1;
      issues.push(issue(node, other, 1, 'critical', true), issue(other, node, 1, 'critical', true));
      break;
    }
    exact.set(key, [...(exact.get(key) ?? []), node]);
    for (let previous = 0; previous < index; previous += 1) {
      const other = nodes[previous]!;
      if (other.language !== node.language) continue;
      const shorter = Math.min(normalizedText(node.text).length, normalizedText(other.text).length);
      const longer = Math.max(normalizedText(node.text).length, normalizedText(other.text).length);
      if (shorter / longer < 0.66) continue;
      const similarity = japaneseTextSimilarity(node.text, other.text);
      if (similarity >= HIGH_SIMILARITY && normalizedText(node.text) !== normalizedText(other.text)) {
        highSimilarityCount += 1;
        issues.push(issue(node, other, similarity, 'critical', false), issue(other, node, similarity, 'critical', false));
      } else if (similarity >= REVIEW_SIMILARITY && normalizedText(node.text) !== normalizedText(other.text)) {
        reviewSimilarityCount += 1;
        issues.push(issue(node, other, similarity, 'warning', false), issue(other, node, similarity, 'warning', false));
      }
    }
  }
  return { scannedLessons: lessons.length, scannedTextFields: nodes.length, exactDuplicateCount, highSimilarityCount, reviewSimilarityCount, issues };
}

export function audioAuditIssuesForLesson(audit: AudioContentAudit, lessonVersionId: string): LessonV2ValidationIssue[] {
  return audit.issues
    .filter((issue) => issue.lessonVersionId === lessonVersionId)
    .map(({ lessonVersionId: _lessonVersionId, ...issue }) => issue);
}
