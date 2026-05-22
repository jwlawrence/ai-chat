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
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {delta && <DeltaRow delta={delta} />}
        {caption && <div className="text-xs text-muted-foreground">{caption}</div>}
      </CardContent>
    </Card>
  );
}
