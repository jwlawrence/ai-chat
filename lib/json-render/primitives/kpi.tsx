'use client';

import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { KpiInput as KpiProps } from './kpi-schema';

const TREND_STYLES = {
  up: { color: 'text-emerald-600 dark:text-emerald-400', Icon: ArrowUpIcon },
  down: { color: 'text-rose-600 dark:text-rose-400', Icon: ArrowDownIcon },
  flat: { color: 'text-muted-foreground', Icon: ArrowRightIcon },
};

type Delta = NonNullable<KpiProps['delta']>;

function DeltaRow({ delta }: { delta: Delta }) {
  const { color, Icon } = TREND_STYLES[delta.trend];
  return (
    <div className={cn('flex items-center gap-1 text-xs font-medium', color)}>
      <Icon className="size-3" />
      {delta.value}
    </div>
  );
}

export function KPI({ label, value, delta, caption }: KpiProps) {
  // h-full + flex column so a row of KPIs renders at uniform height, with the
  // value anchored at the top of the value zone regardless of how long the
  // label wraps. mt-auto on the optional delta/caption pushes the trailing
  // content to the bottom when present, keeping vertical rhythm consistent
  // across tiles whether or not they carry a caption.
  return (
    <Card className="h-full">
      <CardContent className="flex h-full flex-col gap-1 p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {delta && (
          <div className="mt-auto">
            <DeltaRow delta={delta} />
          </div>
        )}
        {caption && (
          <div className={cn('text-xs text-muted-foreground', !delta && 'mt-auto')}>{caption}</div>
        )}
      </CardContent>
    </Card>
  );
}
