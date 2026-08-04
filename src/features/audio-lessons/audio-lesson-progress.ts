import type { AudioLessonProgress, AudioLessonMode } from '@/types/audio-lessons';

const completionThreshold = 0.95;

export function updateAudioLessonPlaybackProgress(
  current: AudioLessonProgress,
  input: { playbackPositionMs: number; totalDurationMs: number; listenedDeltaMs: number; playbackSpeed?: number; selectedMode?: AudioLessonMode; now?: string },
): AudioLessonProgress {
  const duration = Math.max(1, Math.round(input.totalDurationMs));
  const position = Math.min(duration, Math.max(0, Math.round(input.playbackPositionMs)));
  const percentage = Math.min(100, Math.round((position / duration) * 100));
  const completed = percentage >= completionThreshold * 100;
  return {
    ...current,
    status: completed ? 'completed' : position > 0 ? 'in_progress' : 'not_started',
    playbackPositionMs: position,
    totalListenedMs: Math.max(0, current.totalListenedMs + Math.max(0, Math.round(input.listenedDeltaMs))),
    completionPercentage: completed ? 100 : percentage,
    lastPlayedAt: input.now ?? new Date().toISOString(),
    playbackSpeed: input.playbackSpeed ?? current.playbackSpeed,
    selectedMode: input.selectedMode ?? current.selectedMode,
    updatedAt: input.now ?? new Date().toISOString(),
  };
}

export function recordAudioLessonQuestion(
  current: AudioLessonProgress,
  questionId: string,
  correct: boolean,
  now = new Date().toISOString(),
): AudioLessonProgress {
  const completed = new Set(current.completedQuestionIds);
  const correctIds = new Set(current.correctQuestionIds);
  completed.add(questionId);
  if (correct) correctIds.add(questionId); else correctIds.delete(questionId);
  return { ...current, completedQuestionIds: [...completed], correctQuestionIds: [...correctIds], updatedAt: now };
}

export function nextPlaylistIndex(currentIndex: number, count: number, direction: 'next' | 'previous', loop = false): number | undefined {
  if (count <= 0 || currentIndex < 0 || currentIndex >= count) return undefined;
  if (direction === 'next') return currentIndex + 1 < count ? currentIndex + 1 : loop ? 0 : undefined;
  return currentIndex > 0 ? currentIndex - 1 : loop ? count - 1 : undefined;
}
