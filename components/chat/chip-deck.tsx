'use client';

import { BarChart3, LayoutDashboard, LayoutGrid, MailPlus } from 'lucide-react';
import { CHIP_PROMPTS, type ChipId, type ChipPrompt } from '@/lib/chat/chips';
import { cn } from '@/lib/utils';

interface Props {
  onSelect: (chip: ChipPrompt) => void;
  disabled?: boolean;
  className?: string;
  /**
   * Tightens the deck for space-constrained surfaces (the anonymous
   * bottom-bar, where the deck replaces the composer). On mobile this drops
   * to a 2-column grid, shrinks padding/icon, and hides the blurb so four
   * stacked full-width cards don't swallow a phone screen. From `sm` up it is
   * identical to the default deck — full 2×2 cards with blurbs.
   */
  compact?: boolean;
}

const CHIP_ICONS: Record<ChipId, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  composition: LayoutGrid,
  charts: BarChart3,
  interactive: MailPlus,
};

const CHIP_BLURBS: Record<ChipId, string> = {
  dashboard: 'How this app is built, at a glance.',
  composition: 'A hands-on tour of what it can do.',
  charts: 'Cost per turn, three ways.',
  interactive: 'Say hello or ask about the build.',
};

export function ChipDeck({ onSelect, disabled, className, compact }: Props) {
  return (
    <div
      className={cn(
        'grid w-full max-w-3xl gap-3 sm:grid-cols-2',
        compact ? 'grid-cols-2 gap-2 sm:gap-3' : 'grid-cols-1',
        className,
      )}
    >
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
              'group flex flex-col items-start gap-2 rounded-xl border border-border bg-card text-left transition-all',
              compact ? 'p-3 sm:p-4' : 'p-4',
              'hover:border-foreground/20 hover:bg-accent/40 hover:shadow-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-card disabled:hover:shadow-none',
            )}
          >
            <div
              className={cn(
                'flex items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-foreground/5 group-hover:text-foreground',
                compact ? 'size-8 sm:size-9' : 'size-9',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <div className="font-medium text-foreground text-sm">{chip.label}</div>
              <div
                className={cn(
                  'text-muted-foreground text-xs leading-relaxed',
                  compact && 'hidden sm:block',
                )}
              >
                {CHIP_BLURBS[chip.id]}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
