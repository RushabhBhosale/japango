import type { AudioLessonVersion } from './contracts';
import type { LessonV2ValidationIssue } from '../lessons-v2/contracts';

export interface AudioDependencyAvailability {
  vocabularyIds: ReadonlySet<string>;
  kanjiIds: ReadonlySet<string>;
  relatedLessonIds: ReadonlySet<string>;
  sourceChunkIds: ReadonlySet<string>;
}

const labels = {
  vocabularyIds: 'vocabulary',
  kanjiIds: 'kanji',
  relatedLessonIds: 'related lesson',
  sourceChunkIds: 'OCR source chunk',
} as const;

/** Grammar IDs remain curated curriculum IDs; they are verified by lesson review. */
export function unresolvedAudioDependencies(
  lesson: AudioLessonVersion,
  available: AudioDependencyAvailability,
): LessonV2ValidationIssue[] {
  const requested = {
    vocabularyIds: lesson.vocabularyIds,
    kanjiIds: lesson.kanjiIds,
    relatedLessonIds: lesson.relatedLessonIds,
    sourceChunkIds: lesson.sourceReferences.map((reference) => reference.sourceChunkId),
  } as const;
  return (Object.keys(requested) as (keyof typeof requested)[]).flatMap((kind) => requested[kind]
    .filter((id) => !available[kind].has(id))
    .map((id) => ({
      severity: 'critical' as const,
      subjectId: id,
      issueType: 'unresolved_dependency',
      message: `Linked ${labels[kind]} is missing and blocks publishing. Create or link it before publishing.`,
    })));
}
