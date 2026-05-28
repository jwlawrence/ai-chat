import { type NextRequest, NextResponse } from 'next/server';
import { makeAnonId, signAnonId, verifyAnonCookie } from '@/lib/anon/cookie';

const COOKIE_NAME = 'pac_anon';
const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

export async function proxy(req: NextRequest) {
  const secret = process.env.ANON_COOKIE_SECRET;
  // Graceful degradation: if the secret isn't configured (local dev without
  // .env.local set, CI without env, etc.), let requests through unidentified
  // rather than 500ing the whole site. The chat-route gating will treat the
  // visitor as anonymous-without-actor and the global cap will still apply.
  if (!secret) return NextResponse.next();

  const existing = req.cookies.get(COOKIE_NAME)?.value;
  const verified = existing ? await verifyAnonCookie(existing, secret) : null;

  const res = NextResponse.next();

  const value = verified && existing ? existing : await signAnonId(makeAnonId(), secret);
  res.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SEVEN_DAYS_SECONDS,
    path: '/',
  });
  return res;
}

export const proxyConfig = {
  // Exclude static + image optimizer + favicon + Auth.js endpoints. Auth.js
  // sets its own cookies and the proxy shouldn't touch them.
  // Note: proxy.ts itself has no unit tests because Next.js proxies run in a
  // special edge-like environment (NextRequest/NextResponse) that's painful
  // to mock faithfully in vitest. The pure cookie helpers it calls are fully
  // tested in lib/anon/cookie.test.ts (Wave 1). End-to-end coverage for the
  // proxy is deferred to the Wave 4 route-level integration tests.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
