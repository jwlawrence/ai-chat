'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

// Route-level error boundary. Without it an unhandled render or data error
// anywhere under app/ falls back to Next's default error screen, which
// carries none of the product's identity and offers no way back.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex max-w-md flex-col items-center gap-3">
        <h1 className="font-semibold text-3xl tracking-tight">Something broke.</h1>
        <p className="text-muted-foreground text-sm">
          That&apos;s on us, not on you. Trying again usually clears it.
        </p>
        {error.digest ? (
          <p className="font-mono text-muted-foreground text-xs">Reference: {error.digest}</p>
        ) : null}
      </div>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
