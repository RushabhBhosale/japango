const dayMs = 24 * 60 * 60 * 1000;

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * dayMs);
  return shifted.toISOString().slice(0, 10);
}

/** Counts a streak through today, or through yesterday while today is still open. */
export function calculateDailyReadingStreak(completedDates: string[], today = localDateKey()): number {
  const dates = new Set(completedDates);
  let cursor = dates.has(today) ? today : shiftDateKey(today, -1);
  if (!dates.has(cursor)) return 0;
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}
