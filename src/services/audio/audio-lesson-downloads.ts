import { Directory, File, Paths } from 'expo-file-system';

import { saveAudioLessonDownload, type AudioLessonDownloadRecord } from '@/services/database/audio-lessons-repository';
import type { AudioLessonVersion } from '@/types/audio-lessons';

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, '-').slice(0, 160);
}

function extensionFromUrl(url: string): string {
  const extension = /\.([a-z0-9]{2,5})(?:[?#]|$)/iu.exec(url)?.[1];
  return extension ? `.${extension.toLowerCase()}` : '.m4a';
}

/** Downloads only server-published section audio. System speech needs no network file. */
export async function downloadAudioLesson(lesson: AudioLessonVersion): Promise<AudioLessonDownloadRecord[]> {
  const directory = new Directory(Paths.document, 'audio-lessons', safeFileName(lesson.id));
  directory.create({ idempotent: true, intermediates: true });
  const records: AudioLessonDownloadRecord[] = [];
  for (const section of lesson.scriptSections) {
    if (section.audioStatus === 'system_speech') {
      const record: AudioLessonDownloadRecord = { lessonVersionId: lesson.id, sectionId: section.id, status: 'system_speech', byteSize: 0 };
      await saveAudioLessonDownload(record);
      records.push(record);
      continue;
    }
    if (!section.audioUrl || section.audioStatus !== 'ready') {
      const record: AudioLessonDownloadRecord = { lessonVersionId: lesson.id, sectionId: section.id, status: 'failed', byteSize: 0 };
      await saveAudioLessonDownload(record);
      records.push(record);
      continue;
    }
    try {
      const destination = new File(directory, `${safeFileName(section.id)}${extensionFromUrl(section.audioUrl)}`);
      const file = await File.downloadFileAsync(section.audioUrl, destination, { idempotent: true });
      const record: AudioLessonDownloadRecord = { lessonVersionId: lesson.id, sectionId: section.id, remoteUrl: section.audioUrl, localUri: file.uri, status: 'downloaded', byteSize: file.info().size ?? 0 };
      await saveAudioLessonDownload(record);
      records.push(record);
    } catch {
      const record: AudioLessonDownloadRecord = { lessonVersionId: lesson.id, sectionId: section.id, remoteUrl: section.audioUrl, status: 'failed', byteSize: 0 };
      await saveAudioLessonDownload(record);
      records.push(record);
    }
  }
  return records;
}
