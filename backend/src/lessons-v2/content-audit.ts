import type { LessonV2Question, LessonV2ValidationIssue, LessonV2Version, StructuredJapaneseText } from './contracts';
import { japaneseTextSimilarity, normalizedText, textTrigrams } from './similarity';

const HIGH_SIMILARITY_THRESHOLD = 0.86;
const REPETITIVE_PATTERN_THRESHOLD = 0.72;
const MIN_JAPANESE_COMPARISON_LENGTH = 12;
const MIN_ENGLISH_COMPARISON_LENGTH = 24;

type ContentLanguage = 'english' | 'japanese';
type ContentRole =
  | 'lesson_title'
  | 'objective'
  | 'section_title'
  | 'section_content'
  | 'question_instruction'
  | 'question_passage'
  | 'question_prompt'
  | 'choice_label'
  | 'choice_explanation'
  | 'correct_explanation'
  | 'distractor_explanation'
  | 'common_mistake';

interface ContentNode {
  id: string;
  subjectId: string;
  lessonId: string;
  lessonVersionId: string;
  lessonTitle: string;
  sectionId?: string;
  questionId?: string;
  role: ContentRole;
  language: ContentLanguage;
  value: string;
  normalized: string;
  trigrams: Set<string>;
}

export interface LessonsV2ContentAuditIssue extends LessonV2ValidationIssue {
  lessonId: string;
  lessonVersionId: string;
}

export interface LessonsV2ContentAudit {
  scannedLessons: number;
  scannedGeneratedQuestions: number;
  scannedTextFields: number;
  exactDuplicateCount: number;
  highSimilarityCount: number;
  repetitivePatternCount: number;
  issues: LessonsV2ContentAuditIssue[];
}

export interface GeneratedQuestionAuditInput {
  id: string;
  question: LessonV2Question;
}

/** Returns the global-audit findings that must block or warn on one version. */
export function auditIssuesForLesson(audit: LessonsV2ContentAudit, lesson: LessonV2Version): LessonV2ValidationIssue[] {
  return audit.issues
    .filter((issue) => issue.lessonVersionId === lesson.id)
    .map(({ lessonId: _lessonId, lessonVersionId: _lessonVersionId, ...issue }) => issue);
}

export function auditIssuesForGeneratedQuestion(audit: LessonsV2ContentAudit, generatedQuestionId: string): LessonV2ValidationIssue[] {
  return audit.issues
    .filter((issue) => issue.lessonVersionId === `generated-question-${generatedQuestionId}`)
    .map(({ lessonId: _lessonId, lessonVersionId: _lessonVersionId, ...issue }) => issue);
}

function textNode(
  nodes: ContentNode[],
  metadata: Omit<ContentNode, 'language' | 'value' | 'normalized' | 'trigrams'>,
  language: ContentLanguage,
  value: string | undefined,
): void {
  if (!value) return;
  const normalized = normalizedText(value);
  const minimum = language === 'japanese' ? MIN_JAPANESE_COMPARISON_LENGTH : MIN_ENGLISH_COMPARISON_LENGTH;
  if (normalized.length < minimum) return;
  nodes.push({ ...metadata, language, value, normalized, trigrams: textTrigrams(value) });
}

function bilingualNodes(
  nodes: ContentNode[],
  metadata: Omit<ContentNode, 'language' | 'value' | 'normalized' | 'trigrams'>,
  value: { japanese?: StructuredJapaneseText; english?: string },
): void {
  textNode(nodes, metadata, 'japanese', value.japanese?.raw);
  textNode(nodes, metadata, 'english', value.english);
}

function generatedQuestionVersion({ id, question }: GeneratedQuestionAuditInput): LessonV2Version {
  const syntheticId = `generated-question-${id}`;
  return {
    id: syntheticId,
    lessonId: syntheticId,
    version: 1,
    status: 'review',
    level: question.level,
    title: `Generated question ${id}`,
    slug: `generated-question-${id}`,
    objectives: [question.testedSkill],
    estimatedMinutes: 1,
    sections: [{
      id: `${syntheticId}-section`, kind: 'quiz', title: 'Generated question', order: 1, estimatedMinutes: 1,
      content: [], questions: [question], vocabularyIds: question.vocabularyIds, grammarIds: question.grammarIds, kanjiIds: question.kanjiIds,
    }],
    sourceReferences: question.sourceReferences,
    createdAt: '2026-08-04T00:00:00.000Z',
  };
}

function collectContentNodes(lessons: readonly LessonV2Version[]): ContentNode[] {
  const nodes: ContentNode[] = [];
  for (const lesson of lessons) {
    const lessonMetadata = {
      id: `${lesson.id}:title`, subjectId: lesson.id, lessonId: lesson.lessonId, lessonVersionId: lesson.id, lessonTitle: lesson.title,
      role: 'lesson_title' as const,
    };
    textNode(nodes, lessonMetadata, 'english', lesson.title);
    lesson.objectives.forEach((objective, index) => textNode(nodes, {
      ...lessonMetadata, id: `${lesson.id}:objective:${index}`, role: 'objective',
    }, 'english', objective));
    for (const section of lesson.sections) {
      const sectionMetadata = {
        id: `${lesson.id}:${section.id}`, subjectId: section.id, lessonId: lesson.lessonId, lessonVersionId: lesson.id, lessonTitle: lesson.title,
        sectionId: section.id,
      };
      textNode(nodes, { ...sectionMetadata, id: `${sectionMetadata.id}:title`, role: 'section_title' }, 'english', section.title);
      section.content.forEach((content, index) => bilingualNodes(nodes, {
        ...sectionMetadata, id: `${sectionMetadata.id}:content:${index}`, role: 'section_content',
      }, content));
      for (const question of section.questions) {
        const questionMetadata = {
          ...sectionMetadata, id: `${sectionMetadata.id}:${question.id}`, subjectId: question.id, questionId: question.id,
        };
        bilingualNodes(nodes, { ...questionMetadata, id: `${questionMetadata.id}:instruction`, role: 'question_instruction' }, { japanese: question.instruction });
        if (question.passage) bilingualNodes(nodes, { ...questionMetadata, id: `${questionMetadata.id}:passage`, role: 'question_passage' }, { japanese: question.passage });
        bilingualNodes(nodes, { ...questionMetadata, id: `${questionMetadata.id}:prompt`, role: 'question_prompt' }, { japanese: question.prompt });
        for (const choice of question.choices) {
          bilingualNodes(nodes, { ...questionMetadata, id: `${questionMetadata.id}:${choice.id}:label`, role: 'choice_label' }, choice.label);
          if (choice.explanation) bilingualNodes(nodes, { ...questionMetadata, id: `${questionMetadata.id}:${choice.id}:explanation`, role: 'choice_explanation' }, choice.explanation);
        }
        bilingualNodes(nodes, { ...questionMetadata, id: `${questionMetadata.id}:correct-explanation`, role: 'correct_explanation' }, question.explanation.correct);
        for (const distractor of question.explanation.distractors) bilingualNodes(nodes, {
          ...questionMetadata, id: `${questionMetadata.id}:${distractor.choiceId}:distractor-explanation`, role: 'distractor_explanation',
        }, distractor.explanation);
        if (question.explanation.commonMistake) bilingualNodes(nodes, {
          ...questionMetadata, id: `${questionMetadata.id}:common-mistake`, role: 'common_mistake',
        }, question.explanation.commonMistake);
      }
    }
  }
  return nodes;
}

function describe(node: ContentNode): string {
  const section = node.sectionId ? ` section ${node.sectionId}` : '';
  const question = node.questionId ? ` question ${node.questionId}` : '';
  return `${node.role.replaceAll('_', ' ')} in “${node.lessonTitle}”${section}${question}`;
}

function duplicateIssue(node: ContentNode, original: ContentNode): LessonV2ValidationIssue {
  return {
    severity: 'critical',
    subjectId: node.subjectId,
    issueType: 'exact_duplicate_content',
    message: `${describe(node)} exactly repeats ${describe(original)}.`,
    suggestedFix: 'Replace the repeated sentence with a new, natural context while retaining the same objective, level, verified token sequence, vocabulary/kanji links, audio alignment, and correct answer.',
  };
}

function attributedIssue(node: ContentNode, issue: LessonV2ValidationIssue): LessonsV2ContentAuditIssue {
  return { ...issue, lessonId: node.lessonId, lessonVersionId: node.lessonVersionId };
}

function similarityIssue(
  node: ContentNode,
  original: ContentNode,
  similarity: number,
  severity: LessonV2ValidationIssue['severity'],
): LessonV2ValidationIssue {
  const highSimilarity = severity === 'critical';
  return {
    severity,
    subjectId: node.subjectId,
    issueType: highSimilarity ? 'high_similarity_content' : 'repetitive_content_pattern',
    message: `${describe(node)} is ${Math.round(similarity * 100)}% text-similar to ${describe(original)}.`,
    suggestedFix: highSimilarity
      ? 'Regenerate this item in a different everyday situation. Vary the people, nouns, verb, setting, sentence pattern, and answer structure, then re-verify its tokens, links, audio, and explanation.'
      : 'Review this similar sentence pattern. If the repetition is unnecessary, write a distinct context with different people, setting, vocabulary use, and plausible distractors.',
  };
}

function candidateKeys(node: ContentNode): string[] {
  const grams = [...node.trigrams];
  if (grams.length <= 16) return grams;
  const last = grams.length - 1;
  return [...new Set(Array.from({ length: 17 }, (_, index) => grams[Math.round((index * last) / 16)]))];
}

function comparable(left: ContentNode, right: ContentNode): boolean {
  if (left.language !== right.language) return false;
  if (left.lessonId === right.lessonId && left.lessonVersionId !== right.lessonVersionId) return false;
  const shorter = Math.min(left.normalized.length, right.normalized.length);
  const longer = Math.max(left.normalized.length, right.normalized.length);
  // A Jaccard score of .72 cannot be reached when lengths diverge much more
  // than this. Filtering here keeps the cross-corpus audit inexpensive.
  return shorter / longer >= 0.66;
}

/**
 * Audits every learner-visible content field without mutating canonical text.
 * Exact duplicates block publication; high similarity blocks publication; a
 * lower, pattern-level threshold is surfaced for human review.
 */
export function auditLessonsV2Content(
  lessons: readonly LessonV2Version[],
  generatedQuestions: readonly GeneratedQuestionAuditInput[] = [],
): LessonsV2ContentAudit {
  const nodes = collectContentNodes([...lessons, ...generatedQuestions.map(generatedQuestionVersion)]);
  const issues: LessonsV2ContentAuditIssue[] = [];
  const exact = new Map<string, ContentNode[]>();
  const uniqueNodes: ContentNode[] = [];
  let exactDuplicateCount = 0;
  for (const node of nodes) {
    const key = `${node.language}:${node.normalized}`;
    const original = (exact.get(key) ?? []).find((candidate) => comparable(node, candidate));
    if (original) {
      exactDuplicateCount += 1;
      issues.push(attributedIssue(node, duplicateIssue(node, original)));
      issues.push(attributedIssue(original, duplicateIssue(original, node)));
      exact.set(key, [...(exact.get(key) ?? []), node]);
      continue;
    }
    exact.set(key, [...(exact.get(key) ?? []), node]);
    uniqueNodes.push(node);
  }

  const candidatesByGram = new Map<string, ContentNode[]>();
  const comparedPairs = new Set<string>();
  let highSimilarityCount = 0;
  let repetitivePatternCount = 0;

  for (let index = 0; index < uniqueNodes.length; index += 1) {
    const node = uniqueNodes[index]!;
    const candidates = new Map<string, ContentNode>();
    for (const gram of candidateKeys(node)) {
      for (const candidate of candidatesByGram.get(`${node.language}:${gram}`) ?? []) {
        if (comparable(node, candidate)) candidates.set(candidate.id, candidate);
      }
    }
    for (const candidate of candidates.values()) {
      const pairKey = [candidate.id, node.id].sort().join('|');
      if (comparedPairs.has(pairKey)) continue;
      comparedPairs.add(pairKey);
      const similarity = japaneseTextSimilarity(node.value, candidate.value);
      if (similarity >= HIGH_SIMILARITY_THRESHOLD) {
        issues.push(attributedIssue(node, similarityIssue(node, candidate, similarity, 'critical')));
        issues.push(attributedIssue(candidate, similarityIssue(candidate, node, similarity, 'critical')));
        highSimilarityCount += 1;
      } else if (similarity >= REPETITIVE_PATTERN_THRESHOLD) {
        issues.push(attributedIssue(node, similarityIssue(node, candidate, similarity, 'warning')));
        issues.push(attributedIssue(candidate, similarityIssue(candidate, node, similarity, 'warning')));
        repetitivePatternCount += 1;
      }
    }
    for (const gram of candidateKeys(node)) {
      const key = `${node.language}:${gram}`;
      const candidates = candidatesByGram.get(key) ?? [];
      candidates.push(node);
      candidatesByGram.set(key, candidates);
    }
  }

  return {
    scannedLessons: lessons.length,
    scannedGeneratedQuestions: generatedQuestions.length,
    scannedTextFields: nodes.length,
    exactDuplicateCount,
    highSimilarityCount,
    repetitivePatternCount,
    issues,
  };
}
