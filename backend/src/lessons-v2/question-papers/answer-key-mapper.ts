export interface AnswerKeyEntry {
  section?: string;
  questionNumber: string;
  answerChoice?: string;
  status: 'official' | 'needs_review' | 'unreadable';
}

/**
 * Parses only adjacent numeric answer rows. It deliberately leaves anything
 * ambiguous unknown instead of manufacturing an official answer.
 */
export function extractOfficialAnswerKey(raw: string): AnswerKeyEntry[] {
  if (!/正答表|せいとうひょう/u.test(raw)) return [];
  const lines = raw.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const entries: AnswerKeyEntry[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const questions = lines[index].match(/\b\d{1,2}\b/gu) ?? [];
    const answers = lines[index + 1].match(/\b[1-4]\b/gu) ?? [];
    if (!questions.length || questions.length !== answers.length) continue;
    questions.forEach((questionNumber, answerIndex) => entries.push({ questionNumber, answerChoice: answers[answerIndex], status: 'official' }));
  }
  return entries;
}
