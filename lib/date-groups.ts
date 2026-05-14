import { differenceInCalendarDays, isToday, isYesterday } from 'date-fns';

export type DateBucket = 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';

export function bucketFor(d: Date | string): DateBucket {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  if (differenceInCalendarDays(new Date(), date) < 7) return 'Previous 7 days';
  return 'Older';
}

export function groupByBucket<T extends { updatedAt: string | Date }>(items: T[]): Array<{
  bucket: DateBucket;
  items: T[];
}> {
  const order: DateBucket[] = ['Today', 'Yesterday', 'Previous 7 days', 'Older'];
  const map = new Map<DateBucket, T[]>();
  for (const it of items) {
    const b = bucketFor(it.updatedAt);
    const list = map.get(b) ?? [];
    list.push(it);
    map.set(b, list);
  }
  return order.filter((b) => map.has(b)).map((b) => ({ bucket: b, items: map.get(b)! }));
}
