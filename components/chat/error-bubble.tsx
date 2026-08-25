'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorBubble({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    // Card surface rather than a destructive tint: destructive text on a
    // destructive wash measures 3.8–4.4:1, under AA for 14px. On the card it
    // reaches 4.76:1 (light) / 5.25:1 (dark), and the body runs in plain
    // foreground so the message itself is the most legible thing here.
    // Radius follows the surface step (14px), not the control step.
    <div
      role="alert"
      className="mx-auto flex w-full max-w-3xl items-start gap-3 rounded-xl border border-destructive/30 bg-card p-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-destructive">Something went wrong.</div>
        <div className="break-words text-foreground">{message}</div>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0">
        <RotateCcw className="mr-1 size-3.5" /> Retry
      </Button>
    </div>
  );
}
