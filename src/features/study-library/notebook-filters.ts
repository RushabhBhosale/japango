import type { MasteryStatus } from '@/types/learning';

export interface NotebookFilterCandidate {
  level: 'N5' | 'N4';
  title: string;
  reading?: string;
  meaning?: string;
  status: MasteryStatus;
  attemptCount: number;
  bookmarked: boolean;
  dueForReview: boolean;
  recentlyViewed: boolean;
}

export type NotebookProgressFilter =
  | 'all'
  | 'studied'
  | 'not-studied'
  | 'weak'
  | 'mastered'
  | 'bookmarked'
  | 'due'
  | 'recently';

export function matchesNotebookProgress(
  item: NotebookFilterCandidate,
  filter: NotebookProgressFilter,
): boolean {
  switch (filter) {
    case 'studied': return item.attemptCount > 0 || item.status !== 'new';
    case 'not-studied': return item.attemptCount === 0 && item.status === 'new';
    case 'weak': return item.status === 'weak';
    case 'mastered': return item.status === 'mastered';
    case 'bookmarked': return item.bookmarked;
    case 'due': return item.dueForReview;
    case 'recently': return item.recentlyViewed;
    case 'all': return true;
  }
}

export function matchesNotebookSearch(item: Pick<NotebookFilterCandidate, 'title' | 'reading' | 'meaning'>, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [item.title, item.reading, item.meaning]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase().includes(normalized));
}
