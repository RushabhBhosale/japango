import type { LessonV2ValidationIssue } from '../lessons-v2/contracts';
import { audioLessonVersionSchema, type AudioLessonVersion } from './contracts';

const visualOnlyInstruction = /(?:look at|shown above|on (?:the )?screen|see the (?:sentence|text)|上の文|画面を見)/iu;

function issue(subjectId: string, issueType: string, message: string, severity: LessonV2ValidationIssue['severity'] = 'critical'): LessonV2ValidationIssue {
  return { subjectId, issueType, message, severity };
}

function estimatedSpokenMs(text: string, language: 'japanese' | 'english' | 'bilingual', speakingRate: number): number {
  const japaneseCharacters = (text.match(/[\u3040-\u30ff\u3400-\u9fff]/gu) ?? []).length;
  const englishWords = text.replace(/[\u3040-\u30ff\u3400-\u9fff]/gu, ' ').trim().split(/\s+/u).filter(Boolean).length;
  const japaneseMs = japaneseCharacters ? (japaneseCharacters / (5.2 * speakingRate)) * 1_000 : 0;
  const englishMs = englishWords ? (englishWords / (2.5 * speakingRate)) * 1_000 : 0;
  return Math.round(language === 'japanese' ? japaneseMs : language === 'english' ? englishMs : japaneseMs + englishMs);
}

/** Validates audio-first writing and publish-only delivery constraints. */
export function validateAudioLessonVersion(value: unknown, options: { forPublication?: boolean } = {}): { lesson?: AudioLessonVersion; issues: LessonV2ValidationIssue[] } {
  const parsed = audioLessonVersionSchema.safeParse(value);
  if (!parsed.success) return { issues: parsed.error.issues.map((error) => issue(error.path.join('.') || 'audio_lesson', 'schema', error.message)) };
  const lesson = parsed.data;
  const issues: LessonV2ValidationIssue[] = [];
  const totalDurationMs = lesson.scriptSections.reduce((total, section) => total + section.estimatedDurationMs + section.pauseAfterMs, 0);
  if (totalDurationMs < lesson.estimatedMinutes * 45_000 || totalDurationMs > lesson.estimatedMinutes * 90_000) {
    issues.push(issue(lesson.id, 'unsuitable_audio_length', 'Script timing does not match the declared 5–18 minute lesson length.'));
  }
  for (const section of lesson.scriptSections) {
    if (visualOnlyInstruction.test(section.text)) issues.push(issue(section.id, 'visual_only_instruction', 'Audio lessons must not rely on visual-only instructions.'));
    const expected = estimatedSpokenMs(section.text, section.language, section.speakingRate) * section.repeatCount;
    if (expected > section.estimatedDurationMs * 1.45) {
      issues.push(issue(section.id, 'overly_dense_spoken_explanation', 'This section is too dense for its declared spoken duration.', 'warning'));
    }
    if (section.sectionType === 'listening_question' && section.pauseAfterMs < 2_000) {
      issues.push(issue(section.id, 'incorrect_pause_timing', 'Listening questions need at least a two-second thinking pause.'));
    }
    if (!section.transcript.trim()) issues.push(issue(section.id, 'missing_transcript', 'Every audio section needs a transcript.'));
    if (options.forPublication && section.audioStatus !== 'ready') issues.push(issue(section.id, 'missing_audio_file', 'Published lessons require a ready section-level audio file.'));
    if (options.forPublication && section.structuredJapanese?.status !== undefined && section.structuredJapanese.status !== 'verified') {
      issues.push(issue(section.id, 'unverified_japanese_tokens', 'Published Japanese audio text needs verified readings and links.'));
    }
  }
  for (const question of lesson.listeningQuestions) {
    if (question.thinkingPauseMs < 2_000) issues.push(issue(question.id, 'incorrect_pause_timing', 'Listening questions need a meaningful think pause.'));
    if (options.forPublication) {
      for (const text of [question.prompt.japanese, question.explanation.correct.japanese, question.explanation.commonMistake?.japanese]) {
        if (text && text.status !== 'verified') issues.push(issue(question.id, 'unverified_question_tokens', 'Published Japanese questions and explanations need verified tokens.'));
      }
    }
  }
  if (!lesson.scriptSections.some((section) => section.sectionType === 'listening_question')) {
    issues.push(issue(lesson.id, 'missing_listening_question_section', 'Audio lessons must announce at least one listening question.'));
  }
  return { lesson, issues };
}
