import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { cookies } from 'next/headers';
import type { NextAuthConfig } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { verifyAnonCookie } from '@/lib/anon/cookie';
import { db } from '@/lib/db/client';
import { claimAnonymousSessions } from '@/lib/db/queries';
import { accounts, authSessions, users, verificationTokens } from '@/lib/db/schema';

export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: authSessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: { strategy: 'database' },
  events: {
    /**
     * Best-effort anonymous-session claim. Reads pac_anon from request cookies,
     * verifies the signature, re-parents any matching chat_sessions to the
     * newly-signed-in user. Any failure here is swallowed and logged — we
     * never block sign-in on a claim failure.
     */
    async signIn({ user }) {
      if (!user?.id) return;
      const secret = process.env.ANON_COOKIE_SECRET;
      if (!secret) return; // Anonymous tracking not configured.
      try {
        const cookieStore = await cookies();
        const cookieValue = cookieStore.get('pac_anon')?.value;
        const anonId = cookieValue ? await verifyAnonCookie(cookieValue, secret) : null;
        if (anonId) {
          await claimAnonymousSessions({ anonymousId: anonId, userId: user.id });
        }
      } catch (err) {
        console.error('[auth] anonymous-session claim failed during signIn', err);
      }
    },
  },
};
