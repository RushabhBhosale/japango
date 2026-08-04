import { describe, expect, it } from 'vitest';

import { nextPlaylistIndex, recordAudioLessonQuestion, updateAudioLessonPlaybackProgress } from './audio-lesson-progress';

const initial = {
  lessonVersionId: 'audio-version-1', status: 'not_started' as const, playbackPositionMs: 0, totalListenedMs: 0,
  completionPercentage: 0, playbackSpeed: 1, selectedMode: 'japanese_english' as const,
  completedQuestionIds: [], correctQuestionIds: [], updatedAt: '2026-08-04T00:00:00.000Z',
};

describe('Audio Lesson playback progress', () => {
  it('saves a restartable position and completes at the listening threshold', () => {
    const resumed = updateAudioLessonPlaybackProgress(initial, { playbackPositionMs: 32_000, totalDurationMs: 100_000, listenedDeltaMs: 32_000, now: '2026-08-04T00:01:00.000Z' });
    expect(resumed).toMatchObject({ status: 'in_progress', playbackPositionMs: 32_000, completionPercentage: 32, totalListenedMs: 32_000 });
    const completed = updateAudioLessonPlaybackProgress(resumed, { playbackPositionMs: 96_000, totalDurationMs: 100_000, listenedDeltaMs: 20_000, now: '2026-08-04T00:02:00.000Z' });
    expect(completed).toMatchObject({ status: 'completed', completionPercentage: 100, totalListenedMs: 52_000 });
  });

  it('records listening-question completion idempotently and corrects changed answers', () => {
    const once = recordAudioLessonQuestion(initial, 'question-1', true);
    const twice = recordAudioLessonQuestion(once, 'question-1', false);
    expect(twice.completedQuestionIds).toEqual(['question-1']);
    expect(twice.correctQuestionIds).toEqual([]);
  });

  it('orders playlists with explicit next/previous and optional wraparound', () => {
    expect(nextPlaylistIndex(0, 3, 'previous')).toBeUndefined();
    expect(nextPlaylistIndex(1, 3, 'next')).toBe(2);
    expect(nextPlaylistIndex(2, 3, 'next', true)).toBe(0);
    expect(nextPlaylistIndex(0, 3, 'previous', true)).toBe(2);
  });
});
