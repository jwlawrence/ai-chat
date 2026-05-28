import { cookies } from 'next/headers';
import { getUserId } from '@/lib/auth';
import { verifyTrust } from '@/lib/turnstile/cookie';

export interface AnonState {
  isAnonymous: boolean;
  hasTrust: boolean;
}

/**
 * Resolve anonymous state for the chat page. Reads userId via getUserId and
 * the pac_trust cookie via next/headers. Safe to call from any server
 * component or server action.
 *
 * `hasTrust` defaults to false when TRUST_COOKIE_SECRET is unset — the chat
 * route enforces the gate, so the UI just degrades to "show Turnstile" and
 * the anonymous user re-verifies.
 */
export async function resolveAnonState(): Promise<AnonState> {
  const [userId, cookieStore] = await Promise.all([getUserId(), cookies()]);
  const isAnonymous = !userId;
  const secret = process.env.TRUST_COOKIE_SECRET;
  const value = cookieStore.get('pac_trust')?.value;
  const hasTrust = !!(secret && value && (await verifyTrust(value, secret)));
  return { isAnonymous, hasTrust };
}
