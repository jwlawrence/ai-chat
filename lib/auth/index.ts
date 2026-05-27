import NextAuth from 'next-auth';
import { cache } from 'react';
import { authConfig } from './config';

export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);

/**
 * Resolve the current request's user id, or null for anonymous callers.
 * Wrapped in React.cache so multiple consumers within one server-request share
 * a single auth() call. Returns null if auth() throws — see [[fix-6]] for the
 * "degrade gracefully on auth() failure" rationale.
 *
 * Logs a warning if session.user exists but lacks `id` (adapter misconfig
 * symptom — see [[fix-7]]).
 */
export const getUserId = cache(async (): Promise<string | null> => {
  try {
    const session = await auth();
    if (!session?.user) return null;
    if (!session.user.id) {
      console.error(
        '[auth] session.user is set but `id` is missing — adapter or callback misconfig?',
        { hasEmail: Boolean(session.user.email) },
      );
      return null;
    }
    return session.user.id;
  } catch (err) {
    console.error('[auth] getUserId() failed, treating request as anonymous:', err);
    return null;
  }
});
