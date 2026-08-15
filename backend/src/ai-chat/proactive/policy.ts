import type { ProactiveContext, ProactiveWeakness } from './schemas';

export interface ProactiveCandidate extends ProactiveContext {
  expoPushToken: string;
  sentToday: number;
  lastProactiveAt?: string;
}

function localParts(date: Date, timeZone: string): { date: string; hour: number } | undefined {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    const year = get('year'); const month = get('month'); const day = get('day'); const hour = Number(get('hour'));
    if (!year || !month || !day || !Number.isInteger(hour)) return undefined;
    return { date: `${year}-${month}-${day}`, hour };
  } catch {
    return undefined;
  }
}

export function shouldScheduleProactiveMessage(candidate: ProactiveCandidate, now: Date): { allowed: boolean; localDate?: string } {
  const local = localParts(now, candidate.timeZone);
  if (!local || local.hour < 9 || local.hour > 20 || candidate.sentToday >= 2) return { allowed: false };
  const lastActive = Date.parse(candidate.lastActiveAt);
  if (Number.isFinite(lastActive) && now.getTime() - lastActive < 4 * 60 * 60 * 1_000) return { allowed: false };
  const lastProactive = candidate.lastProactiveAt ? Date.parse(candidate.lastProactiveAt) : Number.NaN;
  if (Number.isFinite(lastProactive) && now.getTime() - lastProactive < 8 * 60 * 60 * 1_000) return { allowed: false };
  return { allowed: true, localDate: local.date };
}

export function chooseTeachingTarget(weaknesses: readonly ProactiveWeakness[], localDate: string): ProactiveWeakness | undefined {
  const weak = [...weaknesses].sort((left, right) => left.mastery - right.mastery || right.mistakes - left.mistakes)[0];
  const day = Number(localDate.slice(-2));
  return day % 2 === 0 && weak?.mistakes >= 2 ? weak : undefined;
}
