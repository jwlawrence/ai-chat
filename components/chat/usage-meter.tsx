'use client';

import { useSessions } from '@/hooks/use-sessions';
import type { ModelId } from '@/lib/ai/models';
import { estimateCostUSD, MODEL_PRICING } from '@/lib/ai/pricing';
import { cn } from '@/lib/utils';

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(n: number): string {
  if (n < 0.01) return `<$0.01`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function UsageMeter({
  sessionId,
  model,
}: {
  sessionId: string | undefined;
  model: ModelId;
}) {
  const { data: sessions } = useSessions();
  const session = sessionId ? sessions?.find((s) => s.id === sessionId) : null;
  const tokensIn = session?.tokensIn ?? 0;
  const tokensOut = session?.tokensOut ?? 0;
  const tokensCached = session?.tokensCached ?? 0;
  const cost = estimateCostUSD(model, { tokensIn, tokensOut, tokensCached });

  // Context-window meter uses input tokens — the running budget against the model's window.
  // Output tokens come out of the same window but accounting per-turn vs cumulative is fuzzy,
  // so we keep it simple and approximate.
  const max = MODEL_PRICING[model].maxContextTokens;
  const used = tokensIn;
  const pct = Math.min(100, (used / max) * 100);
  const warn = pct >= 80;

  return (
    <div className="flex items-center gap-3 text-muted-foreground text-xs">
      <div className="flex items-center gap-1.5" title={`${used.toLocaleString()} / ${max.toLocaleString()} input tokens`}>
        <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full transition-all', warn ? 'bg-destructive' : 'bg-foreground/60')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="tabular-nums">{fmtTokens(used)}</span>
      </div>
      <span className="tabular-nums" title={`$${cost.toFixed(4)} so far`}>
        {fmtCost(cost)}
      </span>
    </div>
  );
}
