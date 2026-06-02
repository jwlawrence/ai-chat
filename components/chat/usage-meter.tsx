'use client';

import { useBudget } from '@/hooks/use-budget';
import { remainingPctLabel } from '@/lib/budget/usage-fraction';
import { cn } from '@/lib/utils';

export function UsageMeter() {
  const { data } = useBudget();
  const usedFraction = data?.usedFraction ?? 0;
  const pctUsed = Math.min(100, Math.max(0, usedFraction * 100));
  const warn = usedFraction >= 0.9;

  return (
    <div className="flex items-center gap-3 text-muted-foreground text-xs">
      <div className="flex items-center gap-1.5" title="Daily limit — resets 00:00 UTC">
        <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
          <div
            role="progressbar"
            aria-valuenow={Math.round(pctUsed)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Daily usage limit"
            className={cn('h-full transition-all', warn ? 'bg-destructive' : 'bg-foreground/60')}
            style={{ width: `${pctUsed}%` }}
          />
        </div>
        <span className="tabular-nums">{remainingPctLabel(usedFraction)}</span>
      </div>
    </div>
  );
}
