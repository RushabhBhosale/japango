import { z } from 'zod';

import type { MockExam, MockExamLevel, MockExamQuestion, MockExamReading, MockExamListening } from '@/types/mock-exam';

const level = z.enum(['N5', 'N4']);
const domain = z.enum(['vocabulary', 'kanji', 'grammar', 'reading', 'listening']);
const questionSchema = z.object({
  id: z.string().min(1), domain, level, prompt: z.string().min(1), promptLanguage: z.literal('ja'), presentation: z.string().min(1), explanation: z.string().nullable(), correctOptionId: z.string().nullable(),
  choices: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) }).strict()).length(4),
  linkedItemIds: z.array(z.string().min(1)), stimulus: z.object({ type: z.string(), id: z.string() }).nullable(),
}).strict();
const examSchema = z.object({
  id: z.string().min(1), level, title: z.string().min(1),
  sections: z.array(z.object({ id: z.string(), title: z.string(), order: z.number().int().positive(), recommendedMinutes: z.number().int().positive(), questionPlacementIds: z.array(z.string()) }).strict()).length(3),
  placements: z.array(z.object({ id: z.string(), sectionId: z.string(), questionId: z.string(), position: z.number().int().positive(), domain, questionType: z.string(), parentType: z.enum(['reading-passage', 'listening-activity']).nullable(), parentId: z.string().nullable(), primaryTargetId: z.string().nullable() }).strict()).min(1),
  parents: z.array(z.object({ id: z.string(), sectionId: z.string(), parentType: z.enum(['reading-passage', 'listening-activity']), parentId: z.string(), position: z.number().int().positive(), questionIds: z.array(z.string()).min(1) }).strict()),
  timing: z.object({ totalMinutes: z.number().int().positive().nullable(), resumable: z.boolean() }).passthrough(),
}).strict();
const rawSchema = z.object({
  schemaVersion: z.literal(1), source: z.literal('original-japango-phase8-mock-corpus'), exams: z.array(examSchema), questions: z.array(questionSchema),
  reading: z.array(z.object({ id: z.string(), title: z.string(), japanese: z.string(), questionIds: z.array(z.string()) }).passthrough()),
  listening: z.array(z.object({ id: z.string(), title: z.string(), speechText: z.string(), transcript: z.string(), questionIds: z.array(z.string()) }).passthrough()),
}).strict();

const raw: unknown = require('../../../assets/mobile-curriculum/mock-exams.json');
const catalog = rawSchema.parse(raw);

function assertCatalog(): void {
  const containsLatin = (text: string) => /[A-Za-z]/.test(text);
  for (const examLevel of ['N5', 'N4'] as const) {
    if (catalog.exams.filter((exam) => exam.level === examLevel).length !== 5) throw new Error(`Expected five ${examLevel} mock exams.`);
  }
  const questions = new Map(catalog.questions.map((question) => [question.id, question]));
  const reading = new Set(catalog.reading.map((item) => item.id));
  const listening = new Set(catalog.listening.map((item) => item.id));
  for (const exam of catalog.exams) {
    if (containsLatin(exam.title) || exam.sections.some((section) => containsLatin(section.title))) throw new Error(`${exam.id} has non-Japanese exam labels.`);
    const ids = exam.placements.map((placement) => placement.questionId);
    if (ids.length !== new Set(ids).size) throw new Error(`${exam.id} has duplicate questions.`);
    if (new Set(exam.placements.map((placement) => placement.domain)).size !== 5) throw new Error(`${exam.id} is missing a required section domain.`);
    for (const placement of exam.placements) {
      const question = questions.get(placement.questionId);
      if (!question || !question.correctOptionId || question.choices.filter((choice) => choice.id === question.correctOptionId).length !== 1) throw new Error(`${exam.id} has an invalid answer key.`);
      if (containsLatin(question.prompt) || question.choices.some((choice) => containsLatin(choice.text))) throw new Error(`${exam.id} contains non-Japanese exam-facing text.`);
      if (exam.level === 'N5' && question.level !== 'N5') throw new Error(`${exam.id} includes non-N5 material.`);
      if (placement.parentType === 'reading-passage' && !reading.has(placement.parentId ?? '')) throw new Error(`${exam.id} has a missing reading passage.`);
      if (placement.parentType === 'listening-activity' && !listening.has(placement.parentId ?? '')) throw new Error(`${exam.id} has a missing listening activity.`);
    }
  }
}
assertCatalog();

export function getMockExams(levelValue: MockExamLevel): MockExam[] { return catalog.exams.filter((exam) => exam.level === levelValue) as MockExam[]; }
export function getMockExam(examId: string): MockExam | undefined { return catalog.exams.find((exam) => exam.id === examId) as MockExam | undefined; }
export function getMockExamQuestion(questionId: string): MockExamQuestion | undefined { return catalog.questions.find((question) => question.id === questionId) as MockExamQuestion | undefined; }
export function getMockExamReading(id: string): MockExamReading | undefined { return catalog.reading.find((item) => item.id === id) as MockExamReading | undefined; }
export function getMockExamListening(id: string): MockExamListening | undefined { return catalog.listening.find((item) => item.id === id) as MockExamListening | undefined; }
