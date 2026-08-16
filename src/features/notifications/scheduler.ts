import type { NotificationFrequency, NotificationSchedulerState, NotificationType } from '@/types/notifications';

export const DEFAULT_DAILY_TARGET = 4;
export const DEFAULT_DAILY_MIN = 3;
export const DAILY_HARD_MAX = 6;
export const AUTOMATIC_NOTIFICATION_GAP_MS = 2 * 60 * 60 * 1_000;
const RECENT_ACTIVITY_QUIET_MS = 20 * 60 * 1_000;

export function frequencyTarget(frequency: NotificationFrequency): number {
  switch (frequency) {
    case 'light': return 2;
    case 'frequent': return 6;
    case 'normal': return DEFAULT_DAILY_TARGET;
  }
}

function isRecentlyActive(lastAppOpenAt: string | undefined, now: Date): boolean {
  const last = lastAppOpenAt ? Date.parse(lastAppOpenAt) : Number.NaN;
  return Number.isFinite(last) && now.getTime() - last < RECENT_ACTIVITY_QUIET_MS;
}

/** Selects meaningful work before motivation, without choosing a send time. */
export function selectNotificationTypes(
  state: NotificationSchedulerState,
  frequency: NotificationFrequency,
  now = new Date(),
): NotificationType[] {
  const remaining = Math.max(0, Math.min(DAILY_HARD_MAX, frequencyTarget(frequency)) - state.notificationsSentToday);
  if (!remaining) return [];

  const candidates: NotificationType[] = [];
  if (state.reviewsDue > 0) candidates.push('due_review');
  if (!state.homeworkComplete) candidates.push('daily_homework');
  if (state.recentMistakes > 0) candidates.push('practice_review');
  if (state.currentLearningTargets.some((target) => target.type === 'vocabulary')) candidates.push('micro_vocabulary');
  if (state.currentLearningTargets.some((target) => target.type === 'kanji')) candidates.push('micro_kanji');
  if (state.currentLearningTargets.some((target) => target.type === 'grammar')) candidates.push('grammar_tip');
  if (!candidates.length) candidates.push('progress');
  return candidates.slice(0, remaining);
}

/** Returns local-device times that respect active hours and a two-hour gap. */
export function buildNotificationTimes(input: {
  now: Date;
  count: number;
  activeHours: { start: number; end: number };
  lastNotificationAt?: string;
  lastAppOpenAt?: string;
}): Date[] {
  const count = Math.max(0, Math.min(DAILY_HARD_MAX, input.count));
  if (!count) return [];
  const start = new Date(input.now);
  start.setMinutes(0, 0, 0);
  start.setHours(Math.max(start.getHours() + 1, input.activeHours.start));
  const last = input.lastNotificationAt ? Date.parse(input.lastNotificationAt) : Number.NaN;
  if (Number.isFinite(last)) start.setTime(Math.max(start.getTime(), last + AUTOMATIC_NOTIFICATION_GAP_MS));
  if (isRecentlyActive(input.lastAppOpenAt, input.now)) start.setTime(Math.max(start.getTime(), input.now.getTime() + AUTOMATIC_NOTIFICATION_GAP_MS));

  const times: Date[] = [];
  for (let index = 0; index < count; index += 1) {
    const next = new Date(start.getTime() + index * AUTOMATIC_NOTIFICATION_GAP_MS);
    if (next.getHours() > input.activeHours.end) break;
    times.push(next);
  }
  return times;
}
