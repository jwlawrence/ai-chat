'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSessions } from '@/hooks/use-sessions';
import { groupByBucket } from '@/lib/date-groups';
import { SidebarItem } from './sidebar-item';

export function SidebarList() {
  const { data, error, isLoading, mutate } = useSessions();
  // A failed fetch previously fell through to the empty state, so an outage
  // read as "you have no chats" — a failure disguised as a normal state.
  // `useSessions` sets `fallbackData: []`, so `data` is never undefined;
  // the length check is what distinguishes "failed with nothing to show"
  // from "revalidation failed but the previous list is still on screen".
  if (error && (data?.length ?? 0) === 0) {
    return (
      <div className="flex flex-col items-start gap-2 px-3 py-6">
        <p className="text-muted-foreground text-xs">Couldn't load your chats.</p>
        <Button variant="outline" size="xs" onClick={() => mutate()}>
          <RotateCcw className="mr-1.5 size-3" /> Try again
        </Button>
      </div>
    );
  }
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
