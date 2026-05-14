'use client';

import { groupByBucket } from '@/lib/date-groups';
import { useSessions } from '@/hooks/use-sessions';
import { Skeleton } from '@/components/ui/skeleton';
import { SidebarItem } from './sidebar-item';

export function SidebarList() {
  const { data, isLoading } = useSessions();
  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }
  const groups = groupByBucket(data ?? []);
  if (groups.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        No chats yet. Start one below.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3 p-2">
      {groups.map((g) => (
        <div key={g.bucket}>
          <div className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {g.bucket}
          </div>
          <div className="flex flex-col">
            {g.items.map((s) => (
              <SidebarItem key={s.id} session={s} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
