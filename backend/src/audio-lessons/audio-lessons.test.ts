import { describe, expect, it } from 'vitest';

import { auditAudioLessonContent } from './content-audit';
import { unresolvedAudioDependencies } from './dependency-validator';
import { buildAudioLessonPilots } from './pilots';
import { SystemSpeechTtsProvider } from './tts';
import { validateAudioLessonVersion } from './validator';

const bindings = {
  source: { sourceChunkId: '11111111-1111-4111-8111-111111111111', sourcePath: 'assets/docs-reference/japango-ocr/genki/sample.md' },
  vocabularyIds: ['22222222-2222-4222-8222-222222222222'],
  grammarIds: ['n5-masu'],
  kanjiIds: ['33333333-3333-4333-8333-333333333333'],
  relatedLessonIds: ['44444444-4444-4444-8444-444444444444'],
} as const;

describe('Audio Lessons', () => {
  it('builds sixty original, Japanese-immersion N5/N4 lessons with measured draft scripts', () => {
    const pilots = buildAudioLessonPilots(bindings);
    expect(pilots).toHaveLength(60);
    expect(pilots.filter((pilot) => pilot.jlptLevel === 'N5')).toHaveLength(25);
    expect(pilots.filter((pilot) => pilot.jlptLevel === 'N4')).toHaveLength(35);
    expect([...new Set(pilots.map((pilot) => pilot.lessonType))]).toEqual(expect.arrayContaining([
      'grammar_explanation', 'vocabulary_review', 'sentence_pattern_drill', 'dialogue_practice', 'listening_comprehension', 'short_story', 'jlpt_listening_practice', 'shadowing_practice',
    ]));
    expect(pilots.every((pilot) => pilot.status === 'draft' && pilot.estimatedMinutes >= 11 && pilot.estimatedMinutes <= 15)).toBe(true);
    expect(pilots.flatMap((pilot) => validateAudioLessonVersion(pilot).issues).filter((issue) => issue.severity === 'critical')).toEqual([]);
    expect(pilots.every((pilot) => pilot.scriptSections.every((section) => section.sourceReferences.length > 0))).toBe(true);
    expect(pilots.every((pilot) => pilot.listeningQuestions.length === 8 && pilot.listeningQuestions.every((question) => question.prompt.japanese))).toBe(true);
    expect(pilots.every((pilot) => pilot.scriptSections.filter((section) => section.language === 'japanese').every((section) => !/[A-Za-z]/u.test(section.text)))).toBe(true);
    expect(pilots.every((pilot) => {
      const spoken = pilot.scriptSections.reduce((total, section) => ({
        japanese: total.japanese + (section.language === 'japanese' ? section.estimatedDurationMs : 0),
        english: total.english + (section.language === 'english' ? section.estimatedDurationMs : 0),
      }), { japanese: 0, english: 0 });
      return spoken.english / (spoken.japanese + spoken.english) <= 0.05;
    })).toBe(true);
    expect(new Set(pilots.map((pilot) => pilot.listeningQuestions[0]?.choices.findIndex((choice) => choice.isCorrect))).size).toBeGreaterThan(2);
  });

  it('finds no high-similarity collision across the pilot scripts and questions', () => {
    const audit = auditAudioLessonContent(buildAudioLessonPilots(bindings));
    expect(audit.exactDuplicateCount).toBe(0);
    expect(audit.highSimilarityCount).toBe(0);
  }, 20_000);

  it('blocks a duplicate heard sentence and an invalid second answer', () => {
    const [first, second] = buildAudioLessonPilots(bindings);
    if (!first || !second) throw new Error('Pilot fixtures are missing.');
    const duplicatedSection = first.scriptSections[0];
    if (!duplicatedSection) throw new Error('Pilot script fixture is missing.');
    const duplicated = {
      ...second,
      id: 'audio-pilot-copy',
      lessonId: 'audio-pilot-copy',
      scriptSections: second.scriptSections.map((section, index) => index === 0 ? {
        ...section,
        text: duplicatedSection.text,
        transcript: duplicatedSection.transcript,
        structuredJapanese: duplicatedSection.structuredJapanese,
      } : section),
    };
    expect(auditAudioLessonContent([first, duplicated]).issues.some((issue) => issue.issueType === 'audio_exact_duplicate_content')).toBe(true);
    const invalid = { ...first, listeningQuestions: first.listeningQuestions.map((question) => ({ ...question, choices: question.choices.map((choice, index) => index === 1 ? { ...choice, isCorrect: true } : choice) })) };
    expect(validateAudioLessonVersion(invalid).issues.some((issue) => issue.issueType === 'schema' && issue.severity === 'critical')).toBe(true);
  });

  it('requires real audio files and verified Japanese links before publication', () => {
    const [pilot] = buildAudioLessonPilots(bindings);
    if (!pilot) throw new Error('Pilot fixture is missing.');
    const issues = validateAudioLessonVersion(pilot, { forPublication: true }).issues;
    expect(issues.some((issue) => issue.issueType === 'missing_audio_file')).toBe(true);
    expect(issues.some((issue) => issue.issueType === 'unverified_japanese_tokens')).toBe(true);
  });

  it('keeps system TTS behind the provider abstraction and preserves section timing', async () => {
    const [pilot] = buildAudioLessonPilots(bindings);
    const section = pilot?.scriptSections[0];
    if (!section) throw new Error('Pilot section is missing.');
    await expect(new SystemSpeechTtsProvider().synthesize(section)).resolves.toMatchObject({ audioStatus: 'system_speech', estimatedDurationMs: section.estimatedDurationMs });
  });

  it('reports missing vocabulary, kanji, related lesson, and OCR source dependencies', () => {
    const [pilot] = buildAudioLessonPilots(bindings);
    if (!pilot) throw new Error('Pilot fixture is missing.');
    const issues = unresolvedAudioDependencies(pilot, { vocabularyIds: new Set(), kanjiIds: new Set(), relatedLessonIds: new Set(), sourceChunkIds: new Set() });
    expect(issues.map((issue) => issue.subjectId)).toEqual(expect.arrayContaining([
      bindings.vocabularyIds[0], bindings.kanjiIds[0], bindings.relatedLessonIds[0], bindings.source.sourceChunkId,
    ]));
  });
});
