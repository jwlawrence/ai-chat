import type { UIMessage } from 'ai';
import { isChipId } from '@/lib/chat/chips';
import { verifyTrust } from '@/lib/turnstile/cookie';

/**
 * Extract a cookie value by name from a raw Cookie header string. Returns null
 * if not present. Robust to spaces and the no-cookie-header case.
 */
function readCookie(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

/**
 * Gate 1: Turnstile verification for anonymous visitors.
 *
 * Returns a 403 turnstileRequired response if the request is anonymous and
 * lacks a valid pac_trust cookie. Returns null if the gate passes (authenticated
 * users always pass; anonymous users must have a valid trust cookie).
 */
export async function checkTurnstileGate(opts: {
  userId: string | null;
  cookieHeader: string;
}): Promise<Response | null> {
  if (opts.userId) return null;
  const trustCookieValue = readCookie(opts.cookieHeader, 'pac_trust');
  const trustSecret = process.env.TRUST_COOKIE_SECRET ?? '';
  const trusted =
    trustCookieValue && trustSecret ? await verifyTrust(trustCookieValue, trustSecret) : null;
  if (!trusted) {
    return new Response(JSON.stringify({ error: 'turnstileRequired' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  return null;
}

/**
 * Gate 2: Chip-only enforcement for anonymous visitors.
 *
 * Returns a 403 chipRequired response if the request is anonymous and the
 * latest user message does not carry a known chipId in its metadata. Returns
 * null if the gate passes.
 */
export function checkChipGate(opts: {
  userId: string | null;
  incoming: UIMessage[];
}): Response | null {
  if (opts.userId) return null;
  const lastUser = [...opts.incoming].reverse().find((m) => m.role === 'user') as
    | (UIMessage & { metadata?: { chipId?: unknown } })
    | undefined;
  if (!isChipId(lastUser?.metadata?.chipId)) {
    return new Response(JSON.stringify({ error: 'chipRequired' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }
  return null;
}
