'use client';

import { Turnstile } from '@marsidev/react-turnstile';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  siteKey: string;
}

/**
 * Turnstile gate for anonymous visitors. On successful challenge, POSTs the
 * token to /api/turnstile/verify (which sets the pac_trust cookie) and then
 * calls router.refresh() so the page re-renders with hasTrust=true.
 */
export function AnonTurnstileGate({ siteKey }: Props) {
  const router = useRouter();
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
      <div className="space-y-1">
        <h2 className="font-semibold text-foreground text-sm">One quick check</h2>
        <p className="text-muted-foreground text-xs">
          Verify you're human to try the showcase. Takes a moment.
        </p>
      </div>
      <Turnstile
        siteKey={siteKey}
        onSuccess={async (token) => {
          setVerifying(true);
          setError(null);
          try {
            const res = await fetch('/api/turnstile/verify', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ token }),
            });
            if (!res.ok) {
              setError('Verification failed — please try again.');
              return;
            }
            router.refresh();
          } catch {
            setError('Network error during verification.');
          } finally {
            setVerifying(false);
          }
        }}
        onError={() => setError('Verification widget failed to load.')}
      />
      {verifying ? <p className="text-muted-foreground text-xs">Verifying…</p> : null}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
