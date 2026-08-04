import { buildAudioLessonPilots, type AudioPilotBindings } from '../src/audio-lessons/pilots';
import { auditAudioLessonContent } from '../src/audio-lessons/content-audit';
import { audioLessonDraftInputSchema, type AudioLessonVersion } from '../src/audio-lessons/contracts';
import { AudioLessonsRepository } from '../src/audio-lessons/repository';
import { AudioLessonsService } from '../src/audio-lessons/service';
import { validateAudioLessonVersion } from '../src/audio-lessons/validator';

const revisionMarker = 'Japanese-immersion audio script with measured timing.';
const confirmPreviewPublish = process.argv.includes('--confirm-preview-publish');

function bindingsFromExisting(lesson: AudioLessonVersion): AudioPilotBindings {
  const source = lesson.sourceReferences[0];
  if (!source) throw new Error(`${lesson.slug} has no reviewed source reference to preserve.`);
  return {
    source: { sourceChunkId: source.sourceChunkId, sourcePath: source.sourcePath },
    vocabularyIds: lesson.vocabularyIds,
    grammarIds: lesson.grammarIds,
    kanjiIds: lesson.kanjiIds,
    relatedLessonIds: lesson.relatedLessonIds,
  };
}

function draftInput(pilot: AudioLessonVersion) {
  const {
    id: _id,
    lessonId: _lessonId,
    version: _version,
    status: _status,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    publishedAt: _publishedAt,
    ...input
  } = pilot;
  return audioLessonDraftInputSchema.parse(input);
}

async function main(): Promise<void> {
  const repository = new AudioLessonsRepository();
  const service = new AudioLessonsService(repository);
  const existing = await repository.listLessons();
  if (existing.length !== 60) throw new Error(`Expected 60 existing Audio Lessons, found ${existing.length}.`);

  const rebuilt = existing.map((lesson) => {
    const pilot = buildAudioLessonPilots(bindingsFromExisting(lesson)).find((candidate) => candidate.slug === lesson.slug);
    if (!pilot) throw new Error(`No rebuilt pilot exists for ${lesson.slug}.`);
    return { existing: lesson, pilot };
  });

  const issues = rebuilt.flatMap(({ pilot }) => validateAudioLessonVersion(pilot).issues.filter((issue) => issue.severity === 'critical'));
  if (issues.length) throw new Error(`Rebuilt catalog has ${issues.length} critical validation issue(s).`);
  const audit = auditAudioLessonContent(rebuilt.map(({ pilot }) => pilot));
  if (audit.exactDuplicateCount || audit.highSimilarityCount) {
    throw new Error(`Rebuilt catalog has ${audit.exactDuplicateCount} exact and ${audit.highSimilarityCount} high-similarity collision(s).`);
  }

  const totalDurationMs = rebuilt.reduce((total, { pilot }) => total + pilot.scriptSections.reduce((sectionTotal, section) => sectionTotal + section.estimatedDurationMs + section.pauseAfterMs, 0), 0);
  console.log(`Validated ${rebuilt.length} rebuilt lessons (${Math.round(totalDurationMs / 60_000)} total listening minutes).`);
  if (!confirmPreviewPublish) {
    console.log('Dry run only. Pass --confirm-preview-publish to create immutable successor versions and publish them as local-development system-speech previews.');
    return;
  }

  let published = 0;
  let skipped = 0;
  for (const [index, item] of rebuilt.entries()) {
    const current = await repository.getLesson(item.existing.lessonId);
    const alreadyCurrent = current.generationMetadata.sourceQuery?.includes(revisionMarker) === true;
    if (alreadyCurrent && current.status === 'published') {
      skipped += 1;
      console.log(`[${index + 1}/60] ${current.slug}: already published, skipped.`);
      continue;
    }

    console.log(`[${index + 1}/60] ${current.slug}: refreshing from version ${current.version} (${current.status}).`);
    if (current.status === 'published') await repository.createNextVersion(current.lessonId);
    await repository.updateLatestDraft(current.lessonId, draftInput(item.pilot));
    const generated = await service.generateDraftAudio(current.lessonId);
    const critical = validateAudioLessonVersion(generated).issues.filter((issue) => issue.severity === 'critical');
    if (critical.length) throw new Error(`${generated.slug} failed draft validation with ${critical.length} critical issue(s).`);

    // Explicit preview publication intentionally skips hosted-audio and verified-token
    // production gates. The command name and confirmation flag make that exception
    // visible; production publication must continue through AudioLessonsService.publish.
    await repository.publish(current.lessonId, critical);
    published += 1;
    console.log(`[${index + 1}/60] ${generated.slug}: published version ${generated.version}.`);
  }
  console.log(`Refresh complete: ${published} published, ${skipped} already current.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `Audio Lesson refresh failed: ${error.message}` : 'Audio Lesson refresh failed.');
  process.exitCode = 1;
});
