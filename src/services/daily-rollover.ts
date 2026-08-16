import { AppState, type AppStateStatus } from 'react-native';

import { localDateKey } from '@/services/database/daily-homework-repository';

type DailyRolloverListener = (date: string) => void;

const listeners = new Set<DailyRolloverListener>();
let activeDate = localDateKey();
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | undefined;
let rolloverTimer: ReturnType<typeof setTimeout> | undefined;

function millisecondsUntilNextLocalDay(now = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 1, 0);
  return Math.max(1, next.getTime() - now.getTime());
}

function scheduleNextCheck(): void {
  if (rolloverTimer) clearTimeout(rolloverTimer);
  rolloverTimer = setTimeout(() => {
    checkForRollover();
    scheduleNextCheck();
  }, millisecondsUntilNextLocalDay());
}

function checkForRollover(now = new Date()): void {
  const nextDate = localDateKey(now);
  if (nextDate === activeDate) return;
  activeDate = nextDate;
  for (const listener of listeners) listener(nextDate);
}

function onAppStateChange(nextState: AppStateStatus): void {
  if (nextState !== 'active') return;
  checkForRollover();
  scheduleNextCheck();
}

function start(): void {
  activeDate = localDateKey();
  appStateSubscription = AppState.addEventListener('change', onAppStateChange);
  scheduleNextCheck();
}

function stop(): void {
  appStateSubscription?.remove();
  appStateSubscription = undefined;
  if (rolloverTimer) clearTimeout(rolloverTimer);
  rolloverTimer = undefined;
}

/**
 * Notifies mounted screens and services when the device crosses into a new
 * local calendar day, including after the app returns from the background.
 */
export function subscribeToDailyRollover(listener: DailyRolloverListener): () => void {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) stop();
  };
}

