'use client';

import {
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Table as UiTable,
} from '@/components/ui/table';
import type { TableInput as TableProps } from './table-schema';

// Literal class names so Tailwind v4's JIT can detect them. Do not interpolate.
const ALIGN_CLASS = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
} as const;

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

export function Table({ columns, rows, caption }: TableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">No rows</div>
    );
  }
  return (
    <UiTable>
      {caption && <TableCaption>{caption}</TableCaption>}
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c.key} className={ALIGN_CLASS[c.align ?? 'left']}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          // Rows are not reorderable and capped at 50; index key is safe here.
          <TableRow key={`row-${i}`}>
            {columns.map((c) => (
              <TableCell key={c.key} className={ALIGN_CLASS[c.align ?? 'left']}>
                {formatCell(r[c.key])}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </UiTable>
  );
}
