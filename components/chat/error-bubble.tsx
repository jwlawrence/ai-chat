'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorBubble({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 text-destructive" />
      <div className="flex-1">
        <div className="font-medium text-destructive">Something went wrong.</div>
        <div className="text-destructive/80">{message}</div>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RotateCcw className="mr-1 size-3.5" /> Retry
      </Button>
    </div>
  );
}
