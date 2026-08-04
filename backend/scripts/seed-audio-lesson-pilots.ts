import { AudioLessonsService } from '../src/audio-lessons/service';

function list(name: string): string[] {
  return (process.env[name] ?? '').split(',').map((value) => value.trim()).filter(Boolean);
}

const sourceChunkId = process.env.AUDIO_PILOT_SOURCE_CHUNK_ID?.trim();
const sourcePath = process.env.AUDIO_PILOT_SOURCE_PATH?.trim();
if (!sourceChunkId || !sourcePath) {
  console.error('Set AUDIO_PILOT_SOURCE_CHUNK_ID and AUDIO_PILOT_SOURCE_PATH to reviewed OCR grounding before seeding pilots.');
  process.exitCode = 1;
} else {
  const dryRun = process.argv.includes('--dry-run');
  new AudioLessonsService().seedPilots({
    sourceChunkId,
    sourcePath,
    patternId: process.env.AUDIO_PILOT_PATTERN_ID?.trim() || undefined,
    vocabularyIds: list('AUDIO_PILOT_VOCABULARY_IDS'),
    grammarIds: list('AUDIO_PILOT_GRAMMAR_IDS'),
    kanjiIds: list('AUDIO_PILOT_KANJI_IDS'),
    relatedLessonIds: list('AUDIO_PILOT_RELATED_LESSON_IDS'),
  }, dryRun).then((result) => {
    console.log(`${result.pilots.length} Audio Lesson pilots ${result.created ? 'created as drafts' : 'validated in dry-run mode'}.`);
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? `Audio pilot seed failed: ${error.message}` : 'Audio pilot seed failed.');
    process.exitCode = 1;
  });
}
