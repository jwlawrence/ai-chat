'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { RowInput as RowProps } from './row-schema';

// Literal class maps so Tailwind v4's JIT can detect them. Do NOT interpolate
// values into the class string — JIT will not see dynamic class names.
const GAP_CLASS = {
  tight: 'gap-2',
  normal: 'gap-4',
  loose: 'gap-6',
} as const;

const ALIGN_CLASS = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
} as const;

interface RowComponentProps extends RowProps {
  children?: ReactNode;
}

/**
 * Row — horizontal flex layout primitive.
 *
 * Two modes, because the two things a Row holds want opposite behaviour:
 *
 * - `fill=false` (default): children keep their natural width and the row
 *   wraps. Badges and buttons are intrinsically narrow, so stretching them
 *   into equal slots left a pill marooned in each third of the card.
 * - `fill=true`: the registry wraps each child in `flex-1 min-w-0` so KPIs,
 *   Charts, and Tables share the width evenly and nested content cannot
 *   overflow its slot.
 */
export function Row({
  gap = 'normal',
  align = 'stretch',
  fill = false,
  children,
}: RowComponentProps) {
  return (
    <div
      data-slot="row"
      data-fill={fill ? 'true' : 'false'}
      className={cn('flex w-full', !fill && 'flex-wrap', GAP_CLASS[gap], ALIGN_CLASS[align])}
    >
      {children}
    </div>
  );
}
