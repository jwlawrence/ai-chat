'use client';

import { BarChart3, LayoutDashboard, MousePointerClick, Sparkles } from 'lucide-react';
import { CHIP_PROMPTS, type ChipId, type ChipPrompt } from '@/lib/chat/chips';
import { cn } from '@/lib/utils';

interface Props {
  onSelect: (chip: ChipPrompt) => void;
  disabled?: boolean;
  className?: string;
}

const CHIP_ICONS: Record<ChipId, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  interactive: MousePointerClick,
  composition: Sparkles,
  charts: BarChart3,
};

const CHIP_BLURBS: Record<ChipId, string> = {
  dashboard: 'Live KPIs, a table, and a chart in one card.',
  interactive: 'A form with validation and stateful UI.',
  composition: 'Multi-section card with tabs and details.',
  charts: 'Bar, line, area — interactive and themed.',
};

export function ChipDeck({ onSelect, disabled, className }: Props) {
  return (
    <div className={cn('grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2', className)}>
      {CHIP_PROMPTS.map((chip) => {
        const Icon = CHIP_ICONS[chip.id];
        return (
          <button
            key={chip.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(chip)}
            aria-label={chip.label}
            className={cn(
              'group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left transition-all',
              'hover:border-foreground/20 hover:bg-accent/40 hover:shadow-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-card disabled:hover:shadow-none',
            )}
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-foreground/5 group-hover:text-foreground">
              <Icon className="size-4" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <div className="font-medium text-foreground text-sm">{chip.label}</div>
              <div className="text-muted-foreground text-xs leading-relaxed">
                {CHIP_BLURBS[chip.id]}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
