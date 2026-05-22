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
 * Children render in equal-width flex slots. The component itself just
 * provides the flex container; the registry wires individual children with
 * `flex-1 min-w-0` wrappers so they share the row width evenly without
 * letting nested charts/tables overflow.
 */
export function Row({ gap = 'normal', align = 'stretch', children }: RowComponentProps) {
  return (
    <div data-slot="row" className={cn('flex w-full', GAP_CLASS[gap], ALIGN_CLASS[align])}>
      {children}
    </div>
  );
}
